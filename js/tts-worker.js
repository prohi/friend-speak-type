/* Piper TTS háttérszál: fonetizálás (espeak-ng WASM) + ONNX Runtime inferencia. */
importScripts('../vendor/ort/ort.wasm.min.js', '../vendor/piper/piper_phonemize.js');

const ROOT = new URL('../', self.location.href).href;
ort.env.wasm.wasmPaths = ROOT + 'vendor/ort/';
ort.env.wasm.numThreads = 1; // SharedArrayBuffer nélkül (GitHub Pages) úgyis egy szál van

let phonemizer = null;
let session = null;
let config = null;
let lastPrinted = null;
let cancelledUpTo = 0;

async function init(modelUrl, configUrl) {
  config = await (await fetch(configUrl)).json();
  phonemizer = await createPiperPhonemize({
    print: (line) => { lastPrinted = line; },
    printErr: () => {},
    locateFile: (f) => ROOT + 'vendor/piper/' + f,
  });
  const model = await (await fetch(modelUrl)).arrayBuffer();
  session = await ort.InferenceSession.create(model, { executionProviders: ['wasm'], graphOptimizationLevel: 'all' });
}

function phonemeIds(text) {
  lastPrinted = null;
  phonemizer.callMain(['-l', config.espeak.voice, '--input', JSON.stringify([{ text }]), '--espeak_data', '/espeak-ng-data']);
  return lastPrinted ? JSON.parse(lastPrinted).phoneme_ids : [];
}

async function synthesize(text, lengthScale) {
  const ids = phonemeIds(text);
  if (!ids.length) return null;
  const inf = config.inference;
  const feeds = {
    input: new ort.Tensor('int64', BigInt64Array.from(ids, (n) => BigInt(n)), [1, ids.length]),
    input_lengths: new ort.Tensor('int64', BigInt64Array.from([BigInt(ids.length)]), [1]),
    scales: new ort.Tensor('float32', Float32Array.from([inf.noise_scale, lengthScale, inf.noise_w]), [3]),
  };
  if (config.num_speakers > 1) feeds.sid = new ort.Tensor('int64', BigInt64Array.from([0n]), [1]);
  const result = await session.run(feeds);
  return result.output.data;
}

function splitSentences(text) {
  return text
    .split(/(?<=[.!?…])\s+|\n+/u)
    .map((s) => s.trim())
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.type === 'init') {
      await init(m.modelUrl, m.configUrl);
      self.postMessage({ type: 'ready', sampleRate: config.audio.sample_rate, lengthScale: config.inference.length_scale });
    } else if (m.type === 'cancel') {
      cancelledUpTo = Math.max(cancelledUpTo, m.id);
    } else if (m.type === 'synth') {
      const parts = splitSentences(m.text);
      for (let i = 0; i < parts.length; i++) {
        if (m.id <= cancelledUpTo) break;
        const samples = await synthesize(parts[i], m.lengthScale);
        if (m.id <= cancelledUpTo) break;
        if (samples) {
          const copy = new Float32Array(samples);
          self.postMessage({ type: 'audio', id: m.id, index: i, samples: copy, sampleRate: config.audio.sample_rate }, [copy.buffer]);
        }
        await new Promise((r) => setTimeout(r, 0)); // hogy a megszakító üzenet beérjen
      }
      self.postMessage({ type: 'done', id: m.id });
    }
  } catch (err) {
    self.postMessage({ type: 'error', id: m.id, message: String(err && err.message || err) });
  }
};
