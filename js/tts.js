/* Beszédmotor: Piper (háttérszálon) + a rendszer saját hangja tartaléknak. */

const LETTER_NAMES = {
  a: 'a', á: 'á', b: 'bé', c: 'cé', d: 'dé', e: 'e', é: 'é', f: 'ef', g: 'gé', h: 'há', i: 'i', í: 'í',
  j: 'jé', k: 'ká', l: 'el', m: 'em', n: 'en', o: 'o', ó: 'ó', ö: 'ö', ő: 'ő', p: 'pé', q: 'kú', r: 'er',
  s: 'es', t: 'té', u: 'u', ú: 'ú', ü: 'ü', ű: 'ű', v: 'vé', w: 'dupla vé', x: 'iksz', y: 'ipszilon', z: 'zé',
  ' ': 'szóköz',
};

export const LETTER_TEXTS = Object.entries(LETTER_NAMES).filter(([k]) => k !== ' ').map(([, v]) => v);

const CACHE_LIMIT = 150;

export class Speaker {
  constructor() {
    this.status = 'idle'; // idle | loading | ready | failed
    this.onStatus = () => {};
    this.onSpeaking = () => {};
    this.worker = null;
    this.ctx = null;
    this.seq = 0;
    this.job = null;
    this.cache = new Map();
    this.prefetchQueue = [];
    this.baseLength = 1;
  }

  start(modelUrl, configUrl) {
    this._setStatus('loading');
    try {
      this.worker = new Worker('js/tts-worker.js');
    } catch (e) {
      this._setStatus('failed', String(e));
      return;
    }
    this.worker.onmessage = (e) => this._onMessage(e.data);
    this.worker.onerror = (e) => this._setStatus('failed', e.message);
    this.worker.postMessage({
      type: 'init',
      modelUrl: new URL(modelUrl, location.href).href,
      configUrl: new URL(configUrl, location.href).href,
    });
  }

  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) this.ctx = new AC();
    }
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
  }

  _setStatus(s, detail) {
    this.status = s;
    this.onStatus(s, detail);
  }

  _onMessage(m) {
    if (m.type === 'ready') {
      this.baseLength = m.lengthScale;
      this._setStatus('ready');
      this._pump();
    } else if (m.type === 'audio') {
      const job = this.job;
      if (!job || job.id !== m.id) return;
      job.segments.push(m.samples);
      this._schedule(job, m.samples, m.sampleRate);
    } else if (m.type === 'done') {
      const job = this.job;
      if (!job || job.id !== m.id) return;
      job.synthDone = true;
      if (job.segments.length) this._cachePut(job.key, { segments: job.segments, sampleRate: job.sampleRate });
      this._maybeFinish(job);
    } else if (m.type === 'error') {
      if (this.status === 'loading') {
        this._setStatus('failed', m.message);
      } else if (this.job && this.job.id === m.id) {
        const job = this.job;
        this.job = null;
        if (!job.silent) this._speakSystem(job.text, job.speed, job.pitch).then(job.resolve);
        else this._pump();
      }
    }
  }

  _cachePut(key, value) {
    this.cache.delete(key);
    this.cache.set(key, value);
    if (this.cache.size > CACHE_LIMIT) this.cache.delete(this.cache.keys().next().value);
  }

  _schedule(job, samples, sampleRate) {
    if (job.silent || !this.ctx) return;
    job.sampleRate = sampleRate;
    const buffer = this.ctx.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = job.pitch;
    src.connect(this.ctx.destination);
    const start = Math.max(this.ctx.currentTime + 0.03, job.nextStart);
    src.start(start);
    job.nextStart = start + buffer.duration / job.pitch + 0.12;
    job.pending++;
    job.sources.push(src);
    src.onended = () => {
      job.pending--;
      this._maybeFinish(job);
    };
  }

  _maybeFinish(job) {
    if (this.job !== job || !job.synthDone || job.pending > 0) return;
    this.job = null;
    if (!job.silent) this.onSpeaking(false);
    job.resolve();
    this._pump();
  }

  /** Ugyanaz a szöveg ugyanazokkal a beállításokkal azonnal szólhat a gyorsítótárból. */
  _key(text, lengthScale) {
    return text + '|' + lengthScale.toFixed(3);
  }

  speak(text, { speed = 1, pitch = 1, voice = 'piper' } = {}) {
    this.stop();
    text = (text || '').trim();
    if (!text) return Promise.resolve();
    if (voice === 'system' || this.status !== 'ready' || !this.ctx) return this._speakSystem(text, speed, pitch);

    const lengthScale = (this.baseLength * pitch) / speed;
    const key = this._key(text, lengthScale);
    return new Promise((resolve) => {
      const job = {
        id: ++this.seq, text, speed, pitch, key, resolve, silent: false,
        sources: [], pending: 0, segments: [], synthDone: false, sampleRate: 22050,
        nextStart: this.ctx.currentTime,
      };
      this.job = job;
      this.onSpeaking(true);
      const hit = this.cache.get(key);
      if (hit) {
        this._cachePut(key, hit);
        for (const s of hit.segments) this._schedule(job, s, hit.sampleRate);
        job.synthDone = true;
        job.segments = [];
        this._maybeFinish(job);
      } else {
        this.worker.postMessage({ type: 'synth', id: job.id, text, lengthScale });
      }
    });
  }

  speakLetter(ch, opts) {
    const name = LETTER_NAMES[ch.toLowerCase()];
    if (!name) return Promise.resolve();
    return this.speak(name, opts);
  }

  stop() {
    const job = this.job;
    if (job) {
      this.job = null;
      if (this.worker) this.worker.postMessage({ type: 'cancel', id: job.id });
      for (const s of job.sources) {
        s.onended = null;
        try { s.stop(); } catch (e) { /* már leállt */ }
      }
      if (job.silent) this.prefetchQueue.unshift(job.request);
      else this.onSpeaking(false);
      job.resolve();
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  }

  /** Előre legenerálja a megadott rövid szövegeket (pl. IGEN, NEM), hogy azonnal szóljanak. */
  prefetch(texts, { speed = 1, pitch = 1 } = {}) {
    for (const text of texts) {
      const lengthScale = (this.baseLength * pitch) / speed;
      if (this.cache.has(this._key(text, lengthScale))) continue;
      this.prefetchQueue.push({ text, speed, pitch });
    }
    this._pump();
  }

  _pump() {
    if (this.job || this.status !== 'ready' || !this.prefetchQueue.length) return;
    const request = this.prefetchQueue.shift();
    const lengthScale = (this.baseLength * request.pitch) / request.speed;
    const key = this._key(request.text, lengthScale);
    if (this.cache.has(key)) return this._pump();
    this.job = {
      id: ++this.seq, text: request.text, speed: request.speed, pitch: request.pitch, key, request,
      resolve: () => {}, silent: true, sources: [], pending: 0, segments: [], synthDone: false, sampleRate: 22050,
    };
    this.worker.postMessage({ type: 'synth', id: this.job.id, text: request.text, lengthScale });
  }

  _speakSystem(text, speed, pitch) {
    return new Promise((resolve) => {
      if (!('speechSynthesis' in window)) return resolve();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'hu-HU';
      const hu = window.speechSynthesis.getVoices().find((v) => v.lang && v.lang.toLowerCase().startsWith('hu'));
      if (hu) u.voice = hu;
      u.rate = speed;
      u.pitch = pitch;
      u.onend = u.onerror = () => { this.onSpeaking(false); resolve(); };
      this.onSpeaking(true);
      window.speechSynthesis.speak(u);
    });
  }
}
