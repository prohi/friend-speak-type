/* Helyi adattárolás (localStorage). Semmi nem hagyja el a készüléket. */

export const DEFAULTS = {
  voice: 'piper',          // 'piper' | 'system'
  pitch: 1.0,              // 0.7 – 1.4
  speed: 1.0,              // 0.5 – 2.0
  letterSpeech: false,
  keyboard: 'custom',      // 'custom' | 'system'
  uppercase: false,
  dyslexicFont: false,
  contrast: false,
  speakSide: 'right',      // 'left' | 'right'
  touchMode: 'release',    // 'normal' | 'release' | 'hold'
  holdMs: 800,             // 200 – 3000
  repeatMs: 300,           // 0 – 2000
  suggestions: true,
  suggestionCount: 4,      // 3 – 5
  lockEnabled: false,
  pin: '',
};

const KEYS = {
  settings: 'fst.settings',
  messages: 'fst.messages',
  history: 'fst.history',
  phrases: 'fst.phrases',
  words: 'fst.words',
  seeded: 'fst.seeded',
};

const HISTORY_LIMIT = 60;
const PHRASE_LIMIT = 300;

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch (e) {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error('Mentési hiba', e);
  }
}

export const store = {
  settings: { ...DEFAULTS },
  messages: [],   // [{id, text}]
  history: [],    // [{text, time}]
  phrases: {},    // {text: {count, last}}
  words: { uni: {}, bi: {} },

  load(seedMessages) {
    this.settings = { ...DEFAULTS, ...read(KEYS.settings, {}) };
    this.messages = read(KEYS.messages, []);
    this.history = read(KEYS.history, []);
    this.phrases = read(KEYS.phrases, {});
    this.words = read(KEYS.words, { uni: {}, bi: {} });
    if (!read(KEYS.seeded, false)) {
      this.messages = seedMessages.map((text, i) => ({ id: Date.now() + i, text }));
      write(KEYS.messages, this.messages);
      write(KEYS.seeded, true);
    }
  },

  saveSettings() { write(KEYS.settings, this.settings); },
  saveMessages() { write(KEYS.messages, this.messages); },
  saveWords() { write(KEYS.words, this.words); },

  resetSettings() {
    this.settings = { ...DEFAULTS };
    this.saveSettings();
  },

  addMessage(text) {
    text = text.trim();
    if (!text || this.messages.some((m) => m.text === text)) return false;
    this.messages.push({ id: Date.now() + Math.random(), text });
    this.saveMessages();
    return true;
  },

  removeMessage(id) {
    this.messages = this.messages.filter((m) => m.id !== id);
    this.saveMessages();
  },

  recordSpoken(text) {
    text = text.trim();
    if (!text) return;
    const now = Date.now();
    this.history = [{ text, time: now }, ...this.history.filter((h) => h.text !== text)].slice(0, HISTORY_LIMIT);
    write(KEYS.history, this.history);
    const p = this.phrases[text] || { count: 0, last: 0 };
    this.phrases[text] = { count: p.count + 1, last: now };
    const keys = Object.keys(this.phrases);
    if (keys.length > PHRASE_LIMIT) {
      keys.sort((a, b) => this.phrases[a].count - this.phrases[b].count || this.phrases[a].last - this.phrases[b].last);
      for (const k of keys.slice(0, keys.length - PHRASE_LIMIT)) delete this.phrases[k];
    }
    write(KEYS.phrases, this.phrases);
  },

  /** A gyakran kimondott mondatok, a leggyakoribb elöl. */
  frequentPhrases() {
    return Object.entries(this.phrases)
      .map(([text, v]) => ({ text, ...v }))
      .sort((a, b) => b.count - a.count || b.last - a.last);
  },

  removePhrase(text) {
    delete this.phrases[text];
    write(KEYS.phrases, this.phrases);
  },

  removeHistory(text) {
    this.history = this.history.filter((h) => h.text !== text);
    write(KEYS.history, this.history);
  },

  clearLearned() {
    this.history = [];
    this.phrases = {};
    this.words = { uni: {}, bi: {} };
    write(KEYS.history, this.history);
    write(KEYS.phrases, this.phrases);
    this.saveWords();
  },

  exportAll() {
    return JSON.stringify({
      app: 'friend-speak-type', version: 1,
      settings: this.settings, messages: this.messages, history: this.history,
      phrases: this.phrases, words: this.words,
    }, null, 1);
  },

  importAll(json) {
    const d = JSON.parse(json);
    if (!d || d.app !== 'friend-speak-type') throw new Error('Nem megfelelő fájl');
    this.settings = { ...DEFAULTS, ...(d.settings || {}) };
    this.messages = Array.isArray(d.messages) ? d.messages : [];
    this.history = Array.isArray(d.history) ? d.history : [];
    this.phrases = d.phrases || {};
    this.words = d.words || { uni: {}, bi: {} };
    this.saveSettings();
    this.saveMessages();
    write(KEYS.history, this.history);
    write(KEYS.phrases, this.phrases);
    this.saveWords();
    write(KEYS.seeded, true);
  },

  async requestPersistence() {
    try {
      if (navigator.storage && navigator.storage.persist) await navigator.storage.persist();
    } catch (e) { /* nem kritikus */ }
  },
};
