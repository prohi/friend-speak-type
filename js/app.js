import { store } from './store.js';
import { Speaker, LETTER_TEXTS } from './tts.js';
import { Predictor } from './predict.js';
import { TouchController } from './touch.js';
import { buildKeyboard, labelKeys, keyChar } from './keyboard.js';

const VERSION = '0.5';
const MODEL_URL = 'voices/hu_HU-anna-medium.onnx';
const CONFIG_URL = 'voices/hu_HU-anna-medium.onnx.json';
const CARDS_PER_PAGE = 8;

const $ = (sel) => document.querySelector(sel);
const make = (tag, cls, text) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

const speaker = new Speaker();
const predictor = new Predictor(store);
const editor = { text: '', caret: 0, undo: '' };
let shift = false;
let layout = 'abc';
let suggestions = [];
let seedPhrases = [];
let piperStarted = false;
let offlineReady = false;
let cacheName = '';
let touchCtl = null;

/* ---------- Beállítások alkalmazása ---------- */

function voiceOpts() {
  const s = store.settings;
  return { speed: s.speed, pitch: s.pitch, voice: s.voice };
}

function applySettings() {
  const s = store.settings;
  const b = document.body;
  b.classList.toggle('contrast', s.contrast);
  b.classList.toggle('dyslexic', s.dyslexicFont);
  b.classList.toggle('upper', s.uppercase);
  b.classList.toggle('left-hand', s.speakSide === 'left');
  const sys = s.keyboard === 'system';
  b.classList.toggle('sys-kb', sys);
  $('#keyboard').hidden = sys;
  $('#editor').hidden = sys;
  $('#editor-ta').hidden = !sys;
  $('#suggest').hidden = !s.suggestions;
  labelKeys($('#keyboard'), { shift, upper: s.uppercase });
  if (s.voice === 'piper' && !piperStarted) startPiper();
  renderEditor();
  renderSuggestions();
}

function startPiper() {
  piperStarted = true;
  speaker.start(MODEL_URL, CONFIG_URL);
}

function prefetchCommon() {
  speaker.prefetch(['Igen', 'Nem'], voiceOpts());
  if (store.settings.letterSpeech) speaker.prefetch(LETTER_TEXTS, voiceOpts());
}

/* ---------- Szövegszerkesztő ---------- */

function renderEditor() {
  const wrap = $('#editor-wrap');
  wrap.classList.toggle('has-text', editor.text.length > 0);
  const view = $('#editor');
  view.classList.toggle('empty', editor.text.length === 0);
  if (store.settings.keyboard === 'system') {
    const ta = $('#editor-ta');
    if (ta.value !== editor.text) ta.value = editor.text;
    return;
  }
  view.textContent = '';
  const caret = make('span', 'caret');
  view.append(document.createTextNode(editor.text.slice(0, editor.caret)), caret, document.createTextNode(editor.text.slice(editor.caret)));
  caret.scrollIntoView({ block: 'nearest' });
}

function changed() {
  renderEditor();
  refreshSuggestions();
}

function setText(text) {
  editor.text = text;
  editor.caret = text.length;
  changed();
}

function insert(str) {
  const t = editor.text;
  editor.text = t.slice(0, editor.caret) + str + t.slice(editor.caret);
  editor.caret += str.length;
  changed();
}

function backspace() {
  if (editor.caret === 0) return;
  const t = editor.text;
  editor.text = t.slice(0, editor.caret - 1) + t.slice(editor.caret);
  editor.caret -= 1;
  changed();
}

function moveCaret(d) {
  editor.caret = Math.max(0, Math.min(editor.text.length, editor.caret + d));
  renderEditor();
  refreshSuggestions();
}

function clearEditor() {
  if (!editor.text) return restoreText();
  editor.undo = editor.text;
  setText('');
  toast('Törölve – a ✕ újabb érintése visszaállítja');
}

/** Visszaállítja az utoljára törölt vagy lecserélt szöveget; ismételve a két változat között vált. */
function restoreText() {
  if (!editor.undo) return toast('Nincs mit visszaállítani');
  const current = editor.text;
  setText(editor.undo);
  editor.undo = current;
  toast('Szöveg visszaállítva');
}

async function pasteFromClipboard() {
  const apply = (raw) => {
    const text = raw.replace(/\r\n?/g, '\n');
    if (!text.trim()) return toast('A vágólap üres');
    insert(text);
    toggleEditSheet(false);
    toast('Beillesztve');
  };
  const read = () => {
    if (!navigator.clipboard || !navigator.clipboard.readText) throw new Error('nincs vágólap-támogatás');
    return navigator.clipboard.readText();
  };
  // Ha a vágólap olvasása nincs engedélyezve, a rendszer saját beillesztő mezőjét ajánljuk fel (az mindig működik).
  const fallback = () => {
    toggleEditSheet(true, true);
    toast('Tartsd hosszan az ujjad a mezőben, és válaszd a „Beillesztés” lehetőséget');
  };
  try {
    apply(await read());
  } catch (e) {
    // A böngésző a vágólap olvasását valódi érintéshez köti; ha az ujj még a képernyőn van, a felengedésekor újra megpróbáljuk.
    if (touchCtl && touchCtl.active) {
      setTimeout(() => document.addEventListener('pointerup', async () => {
        try { apply(await read()); } catch (err) { fallback(); }
      }, { once: true }), 0);
    } else {
      fallback();
    }
  }
}

function toggleEditSheet(show, withPasteBox = false) {
  $('#sheet-edit').hidden = !show;
  const box = $('#paste-box');
  box.hidden = !(show && withPasteBox);
  box.value = '';
}

/* ---------- Szóajánló ---------- */

function context() {
  const before = editor.text.slice(0, editor.caret);
  const prefix = (before.match(/[\p{L}]*$/u) || [''])[0];
  const rest = before.slice(0, before.length - prefix.length);
  let prev = '^';
  if (!/(^|[.!?])\s*$/.test(rest)) {
    const m = rest.match(/([\p{L}]+)[\s,;:]*$/u);
    if (m) prev = m[1].toLowerCase();
  }
  return { before, prefix, rest, prev };
}

function refreshSuggestions() {
  const s = store.settings;
  if (!s.suggestions) {
    suggestions = [];
    return;
  }
  const { prefix, prev } = context();
  suggestions = predictor.suggest(prefix, prev, s.suggestionCount);
  renderSuggestions();
}

function renderSuggestions() {
  const box = $('#suggest');
  const n = store.settings.suggestionCount;
  box.textContent = '';
  for (let i = 0; i < n; i++) {
    const b = make('button', 't sug', suggestions[i] || '');
    b.type = 'button';
    b.dataset.act = 'sug';
    b.dataset.i = String(i);
    b.dataset.slot = 'sug' + i;
    if (!suggestions[i]) b.classList.add('disabled');
    box.append(b);
  }
}

function acceptSuggestion(i) {
  let word = suggestions[i];
  if (!word) return;
  const { before, prefix, rest, prev } = context();
  const startsUpper = prefix && prefix[0] !== prefix[0].toLowerCase();
  if (startsUpper || (!prefix && prev === '^' && editor.text.length)) word = word[0].toUpperCase() + word.slice(1);
  const needsSpace = !prefix && before.length > 0 && !/\s$/.test(before);
  const head = rest + (needsSpace ? ' ' : '');
  const tail = editor.text.slice(editor.caret);
  editor.text = head + word + ' ' + tail;
  editor.caret = (head + word + ' ').length;
  changed();
}

/* ---------- Kimondás ---------- */

function speakEditor() {
  const text = editor.text.trim();
  if (!text) return;
  speaker.speak(text, voiceOpts());
  store.recordSpoken(text);
  predictor.learn(text);
}

function speakStored(text) {
  speaker.speak(text, voiceOpts());
  store.recordSpoken(text);
  predictor.learn(text);
}

/* ---------- Üzenet-értesítés ---------- */

let toastTimer = null;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- Átfedő képernyők ---------- */

const overlays = { messages: $('#overlay-messages'), settings: $('#overlay-settings'), pin: $('#overlay-pin'), install: $('#overlay-install') };

/* ---------- Telepítés felajánlása ---------- */

let installEvent = null;
let installBusy = false;
const INSTALL_QUIET_MS = 3 * 24 * 3600 * 1000; // telepítés elfogadása után ennyi ideig nem ajánljuk fel újra

async function alreadyInstalled() {
  try {
    if (navigator.getInstalledRelatedApps) return (await navigator.getInstalledRelatedApps()).length > 0;
  } catch (e) { /* nem kritikus */ }
  return false;
}

function setupInstall() {
  const standalone = ['standalone', 'fullscreen', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches);
  window.addEventListener('beforeinstallprompt', async (e) => {
    e.preventDefault();
    installEvent = e;
    const recent = Date.now() - Number(localStorage.getItem('fst.installAccepted') || 0) < INSTALL_QUIET_MS;
    if (standalone || recent || sessionStorage.getItem('fst.installDismissed') || await alreadyInstalled()) return;
    overlays.install.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    localStorage.setItem('fst.installAccepted', String(Date.now()));
    overlays.install.hidden = true;
    toast('Telepítve! Mostantól a kezdőképernyőről indítható.');
  });
  // Ez a gomb szándékosan natív: a telepítési ablak csak valódi érintésre nyílik meg.
  $('#install-go').addEventListener('click', async () => {
    if (!installEvent || installBusy) return;
    installBusy = true;
    try {
      installEvent.prompt();
      const { outcome } = await installEvent.userChoice;
      if (outcome === 'accepted') {
        localStorage.setItem('fst.installAccepted', String(Date.now()));
        overlays.install.hidden = true;
      }
    } catch (e) { /* a böngésző már elutasította */ }
    installEvent = null;
    installBusy = false;
  });
  $('#install-later').addEventListener('click', () => {
    sessionStorage.setItem('fst.installDismissed', '1');
    overlays.install.hidden = true;
  });
}

function closeTopOverlay() {
  for (const name of ['pin', 'settings', 'messages']) {
    if (!overlays[name].hidden) {
      overlays[name].hidden = true;
      if (name === 'pin') pinCtx = null;
      return;
    }
  }
}

/* ---------- Mentett üzenetek ---------- */

const msgState = { tab: 'saved', page: 0, mode: 'say', pendingDel: null };
const TABS = [['saved', 'MENTETT'], ['freq', 'GYAKORI'], ['hist', 'ELŐZMÉNY']];

function messageItems() {
  if (msgState.tab === 'saved') return store.messages.map((m) => ({ text: m.text, id: m.id }));
  if (msgState.tab === 'freq') return store.frequentPhrases().map((p) => ({ text: p.text, count: p.count }));
  return store.history.map((h) => ({ text: h.text }));
}

function showMessages() {
  msgState.page = 0;
  msgState.pendingDel = null;
  overlays.messages.hidden = false;
  renderMessages();
}

function renderMessages() {
  const tabs = $('#msg-tabs');
  tabs.textContent = '';
  for (const [id, label] of TABS) {
    const b = make('button', 't tab' + (msgState.tab === id ? ' on' : ''), label);
    b.type = 'button';
    b.dataset.act = 'msg-tab';
    b.dataset.tab = id;
    b.dataset.slot = 'mtab-' + id;
    tabs.append(b);
  }

  const items = messageItems();
  const pages = Math.max(1, Math.ceil(items.length / CARDS_PER_PAGE));
  msgState.page = Math.min(msgState.page, pages - 1);
  const body = $('#msg-body');
  body.textContent = '';
  const slice = items.slice(msgState.page * CARDS_PER_PAGE, (msgState.page + 1) * CARDS_PER_PAGE);
  if (!slice.length) {
    const hints = {
      saved: 'Még nincs mentett üzenet.\nÍrj a szövegmezőbe, majd az „ÚJ” gombbal mentheted.',
      freq: 'Itt jelennek meg a leggyakrabban kimondott mondataid.',
      hist: 'Itt jelennek meg a legutóbb kimondott mondataid.',
    };
    body.append(make('div', 'empty-note', hints[msgState.tab]));
    body.firstChild.style.whiteSpace = 'pre-line';
  }
  slice.forEach((item, i) => {
    const b = make('button', 't card');
    b.type = 'button';
    b.dataset.act = 'card';
    b.dataset.idx = String(msgState.page * CARDS_PER_PAGE + i);
    b.dataset.slot = 'card' + i;
    b.append(make('span', '', item.text));
    if (item.count) b.append(make('span', 'count', item.count + '×'));
    if (msgState.pendingDel === item.text) b.classList.add('del');
    body.append(b);
  });

  const foot = $('#msg-foot');
  foot.textContent = '';
  const btn = (cls, text, data, slot) => {
    const b = make('button', 't foot-btn ' + cls, text);
    b.type = 'button';
    Object.assign(b.dataset, data);
    b.dataset.slot = slot;
    return b;
  };
  const mode = (id, label) => btn(msgState.mode === id ? 'on' : '', label, { act: 'msg-mode', mode: id }, 'mode-' + id);
  foot.append(mode('say', 'KIMOND'), mode('load', 'BETÖLT'));
  if (msgState.tab === 'saved') foot.append(btn('', '✚ ÚJ', { act: 'msg-new' }, 'msg-new'));
  else foot.append(mode('save', 'MENT'));
  foot.append(mode('del', 'TÖRÖL'), make('div', 'foot-sep'));
  foot.append(btn('', '◀', { act: 'msg-page', d: '-1' }, 'pg-prev'), make('div', 'foot-info', `${msgState.page + 1}/${pages}`), btn('', '▶', { act: 'msg-page', d: '1' }, 'pg-next'));
}

function cardAction(index) {
  const item = messageItems()[index];
  if (!item) return;
  const mode = msgState.mode;
  if (mode !== 'del') msgState.pendingDel = null;
  if (mode === 'say') {
    speakStored(item.text);
  } else if (mode === 'load') {
    if (editor.text) editor.undo = editor.text;
    setText(item.text);
    overlays.messages.hidden = true;
    return 'nav';
  } else if (mode === 'save') {
    toast(store.addMessage(item.text) ? 'Elmentve a mentett üzenetek közé' : 'Már mentve van');
  } else if (mode === 'del') {
    if (msgState.pendingDel === item.text) {
      if (msgState.tab === 'saved') store.removeMessage(item.id);
      else if (msgState.tab === 'freq') store.removePhrase(item.text);
      else store.removeHistory(item.text);
      msgState.pendingDel = null;
      toast('Törölve');
    } else {
      msgState.pendingDel = item.text;
      toast('Törléshez érintsd meg még egyszer');
    }
    renderMessages();
  }
}

/* ---------- Kód (PIN) ---------- */

let pinCtx = null;

function askPin(title, onDone) {
  pinCtx = { title, value: '', onDone };
  $('#pin-title').textContent = title;
  const pad = $('#pin-pad');
  pad.textContent = '';
  const add = (label, data, slot) => {
    const b = make('button', 't', label);
    b.type = 'button';
    Object.assign(b.dataset, data);
    b.dataset.slot = slot;
    pad.append(b);
  };
  for (const d of '123456789') add(d, { act: 'pin-key', d }, 'pin' + d);
  add('✕', { act: 'pin-clear' }, 'pin-clear');
  add('0', { act: 'pin-key', d: '0' }, 'pin0');
  add('◀', { act: 'pin-back' }, 'pin-back');
  renderPin();
  overlays.pin.hidden = false;
}

function renderPin() {
  const dots = $('#pin-dots');
  dots.textContent = '';
  for (let i = 0; i < 4; i++) dots.append(make('span', pinCtx && i < pinCtx.value.length ? 'on' : ''));
}

function pinDigit(d) {
  if (!pinCtx || pinCtx.value.length >= 4) return;
  pinCtx.value += d;
  renderPin();
  if (pinCtx.value.length === 4) {
    const { value, onDone } = pinCtx;
    setTimeout(() => {
      if (!pinCtx) return;
      const ok = onDone(value);
      if (ok === false) {
        pinCtx.value = '';
        const dots = $('#pin-dots');
        dots.classList.add('shake');
        setTimeout(() => dots.classList.remove('shake'), 350);
        renderPin();
      }
    }, 120);
  }
}

function openSettings() {
  const show = () => {
    overlays.pin.hidden = true;
    pinCtx = null;
    setTab.current = setTab.current || 'voice';
    overlays.settings.hidden = false;
    renderSettings();
    checkOffline(); // friss állapot a verziósorhoz
  };
  if (store.settings.lockEnabled && store.settings.pin) {
    askPin('Add meg a kódot', (v) => (v === store.settings.pin ? (show(), true) : false));
  } else {
    show();
  }
}

/* ---------- Beállítások képernyő ---------- */

const CHOICES = {
  voice: [['piper', 'Természetes (Piper)'], ['system', 'Rendszerhang']],
  keyboard: [['custom', 'Saját, nagy gombos'], ['system', 'Rendszer billentyűzet']],
  speakSide: [['right', 'Jobb oldalon'], ['left', 'Bal oldalon']],
  touchMode: [['normal', 'Normál érintés'], ['release', 'Aktiválás felengedéskor'], ['hold', 'Aktiválás hosszú lenyomásra']],
};

const secs = (ms) => (ms / 1000).toFixed(1).replace('.', ',') + ' mp';

const SETTINGS_TABS = [
  {
    id: 'voice', label: 'HANG',
    rows: [
      { type: 'choice', key: 'voice', label: 'Felolvasó hang' },
      { type: 'stepper', key: 'pitch', label: 'Hangmagasság', min: 0.7, max: 1.4, step: 0.1, fmt: (v) => v.toFixed(1).replace('.', ',') },
      { type: 'stepper', key: 'speed', label: 'Beszédsebesség', min: 0.5, max: 2.0, step: 0.1, fmt: (v) => v.toFixed(1).replace('.', ',') },
      { type: 'toggle', key: 'letterSpeech', label: 'Betűk felolvasása gépelés közben' },
      { type: 'action', id: 'test-voice', label: 'Hangpróba', text: '🔊 Próbamondat' },
    ],
  },
  {
    id: 'text', label: 'SZÖVEG',
    rows: [
      { type: 'choice', key: 'keyboard', label: 'Billentyűzet' },
      { type: 'toggle', key: 'uppercase', label: 'Csupa nagybetűs megjelenítés' },
      { type: 'toggle', key: 'dyslexicFont', label: 'Diszlexiabarát betűtípus' },
      { type: 'toggle', key: 'contrast', label: 'Kontrasztos téma' },
      { type: 'toggle', key: 'suggestions', label: 'Szóajánló' },
      { type: 'stepper', key: 'suggestionCount', label: 'Ajánlott szavak száma', min: 3, max: 5, step: 1, fmt: (v) => String(v) },
    ],
  },
  {
    id: 'touch', label: 'ÉRINTÉS',
    rows: [
      { type: 'choice', key: 'touchMode', label: 'Érintési mód' },
      { type: 'stepper', key: 'holdMs', label: 'Hosszú lenyomás ideje', min: 200, max: 3000, step: 100, fmt: secs },
      { type: 'stepper', key: 'repeatMs', label: 'Ismétlésszűrés', sub: 'ugyanaz a gomb ennyi ideig nem aktiválható újra', min: 0, max: 2000, step: 100, fmt: secs },
      { type: 'choice', key: 'speakSide', label: 'Kimondó gomb helye' },
    ],
  },
  {
    id: 'misc', label: 'EGYÉB',
    rows: [
      { type: 'toggle', key: 'lockEnabled', label: 'Beállítások zárolása kóddal' },
      { type: 'action', id: 'export', label: 'Adatok mentése', text: 'Mentés fájlba' },
      { type: 'action', id: 'import', label: 'Adatok betöltése', text: 'Betöltés fájlból' },
      { type: 'action', id: 'clear-learned', label: 'Tanult szavak és előzmények', text: 'Törlés', danger: true },
      { type: 'action', id: 'reset-settings', label: 'Gyári beállítások', text: 'Visszaállítás', danger: true },
      { type: 'note' },
    ],
  },
];

const setTab = { current: 'voice' };
let pendingConfirm = null;
let confirmTimer = null;

function renderSettings() {
  const tabs = $('#set-tabs');
  tabs.textContent = '';
  for (const t of SETTINGS_TABS) {
    const b = make('button', 't tab' + (setTab.current === t.id ? ' on' : ''), t.label);
    b.type = 'button';
    b.dataset.act = 'set-tab';
    b.dataset.tab = t.id;
    b.dataset.slot = 'stab-' + t.id;
    tabs.append(b);
  }
  const body = $('#set-body');
  body.textContent = '';
  const tab = SETTINGS_TABS.find((t) => t.id === setTab.current);
  const s = store.settings;
  const ctl = (cls, text, data, slot) => {
    const b = make('button', 't sbtn ' + cls, text);
    b.type = 'button';
    Object.assign(b.dataset, data);
    b.dataset.slot = slot;
    return b;
  };
  for (const row of tab.rows) {
    const r = make('div', 'srow' + (row.wide ? ' wide' : ''));
    if (row.type === 'note') {
      r.classList.add('note');
      r.append(
        make('div', 'note-main', `Verzió ${VERSION} · Gyorsítótár: ${cacheName || 'nincs'} · Futtatás: ${runMode()} · Offline: ${offlineReady ? 'kész ✓' : 'még nem kész'}`),
        make('div', '', 'Hang: Piper (hu_HU anna, CC0/CC BY) · Szólista: FrequencyWords (CC BY-SA 4.0)'),
      );
      body.append(r);
      continue;
    }
    const label = make('div', 'slabel', row.label);
    if (row.sub) label.append(make('small', '', row.sub));
    r.append(label);
    const c = make('div', 'sctl');
    if (row.type === 'stepper') {
      c.append(
        ctl('step', '−', { act: 'set', key: row.key, op: 'dec' }, `${row.key}-dec`),
        ctl('val', row.fmt(s[row.key]), {}, `${row.key}-val`),
        ctl('step', '+', { act: 'set', key: row.key, op: 'inc' }, `${row.key}-inc`),
      );
    } else if (row.type === 'toggle') {
      c.append(ctl(s[row.key] ? 'state-on' : '', s[row.key] ? 'BE' : 'KI', { act: 'set', key: row.key, op: 'toggle' }, `${row.key}-t`));
    } else if (row.type === 'choice') {
      const name = CHOICES[row.key].find((o) => o[0] === s[row.key]);
      c.append(ctl('', name ? name[1] : String(s[row.key]), { act: 'set', key: row.key, op: 'next' }, `${row.key}-c`));
    } else if (row.type === 'action') {
      const confirming = pendingConfirm === row.id;
      c.append(ctl(row.danger ? 'danger' : '', confirming ? 'BIZTOS? Érintsd meg újra' : row.text, { act: 'action', id: row.id }, 'a-' + row.id));
    }
    r.append(c);
    body.append(r);
  }
}

function changeSetting(key, op) {
  const s = store.settings;
  const row = SETTINGS_TABS.flatMap((t) => t.rows).find((r) => r.key === key);
  if (!row) return;
  if (row.type === 'stepper') {
    const dir = op === 'inc' ? 1 : -1;
    const v = Math.round((s[key] + dir * row.step) * 1000) / 1000;
    s[key] = Math.max(row.min, Math.min(row.max, v));
  } else if (row.type === 'toggle') {
    if (key === 'lockEnabled') return toggleLock();
    s[key] = !s[key];
  } else if (row.type === 'choice') {
    const opts = CHOICES[key];
    const i = opts.findIndex((o) => o[0] === s[key]);
    s[key] = opts[(i + 1) % opts.length][0];
  }
  store.saveSettings();
  applySettings();
  renderSettings();
  if (key === 'pitch' || key === 'speed') {
    speaker.speak('Ez egy hangpróba.', voiceOpts());
    prefetchCommon();
  }
  if (key === 'letterSpeech' && s.letterSpeech) prefetchCommon();
  if (key === 'touchMode') toast(CHOICES.touchMode.find((o) => o[0] === s.touchMode)[1]);
}

function toggleLock() {
  const s = store.settings;
  if (s.lockEnabled) {
    s.lockEnabled = false;
    s.pin = '';
    store.saveSettings();
    renderSettings();
    return;
  }
  askPin('Adj meg egy új 4 jegyű kódot', (first) => {
    askPin('Írd be még egyszer', (second) => {
      if (second !== first) {
        toast('A két kód nem egyezik');
        return false;
      }
      s.pin = first;
      s.lockEnabled = true;
      store.saveSettings();
      overlays.pin.hidden = true;
      pinCtx = null;
      renderSettings();
      toast('A zár bekapcsolva');
      return true;
    });
    return true;
  });
}

function runAction(id) {
  const danger = id === 'clear-learned' || id === 'reset-settings';
  if (danger && pendingConfirm !== id) {
    pendingConfirm = id;
    clearTimeout(confirmTimer);
    confirmTimer = setTimeout(() => { pendingConfirm = null; if (!overlays.settings.hidden) renderSettings(); }, 4000);
    renderSettings();
    return;
  }
  pendingConfirm = null;
  if (id === 'test-voice') {
    speaker.speak('Szia! Ez egy hangpróba. Így fog hangzani a beszéd.', voiceOpts());
  } else if (id === 'export') {
    const blob = new Blob([store.exportAll()], { type: 'application/json' });
    const a = make('a');
    a.href = URL.createObjectURL(blob);
    a.download = `friend-speak-type-mentes-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    toast('Az adatok mentve a letöltések közé');
  } else if (id === 'import') {
    $('#import-file').click();
  } else if (id === 'clear-learned') {
    store.clearLearned();
    refreshSuggestions();
    toast('A tanult adatok törölve');
  } else if (id === 'reset-settings') {
    store.resetSettings();
    applySettings();
    toast('Gyári beállítások visszaállítva');
  }
  renderSettings();
}

/* ---------- Gombok kezelése ---------- */

function handleActivate(el) {
  const d = el.dataset;
  switch (d.act) {
    case 'key': {
      const ch = keyChar(el, shift);
      insert(ch);
      if (store.settings.letterSpeech && /\p{L}/u.test(ch)) speaker.speakLetter(ch, voiceOpts());
      if (shift) {
        shift = false;
        labelKeys($('#keyboard'), { shift, upper: store.settings.uppercase });
      }
      return;
    }
    case 'shift':
      shift = !shift;
      labelKeys($('#keyboard'), { shift, upper: store.settings.uppercase });
      return;
    case 'backspace': return backspace();
    case 'enter': return insert('\n');
    case 'space': return insert(' ');
    case 'left': return moveCaret(-1);
    case 'right': return moveCaret(1);
    case 'layout':
      layout = layout === 'abc' ? 'sym' : 'abc';
      buildKeyboard($('#keyboard'), layout);
      labelKeys($('#keyboard'), { shift, upper: store.settings.uppercase });
      return;
    case 'sug': return acceptSuggestion(Number(d.i));
    case 'say':
      speaker.speak(d.text, voiceOpts());
      return;
    case 'speak': return speakEditor();
    case 'clear': return clearEditor();
    case 'editor-menu': toggleEditSheet(true); return 'nav';
    case 'sheet-close': toggleEditSheet(false); return 'nav';
    case 'restore': toggleEditSheet(false); restoreText(); return 'nav';
    case 'paste': pasteFromClipboard(); return 'nav';
    case 'open-messages': showMessages(); return 'nav';
    case 'close-overlay': closeTopOverlay(); return 'nav';
    case 'open-settings': openSettings(); return 'nav';
    case 'msg-tab':
      msgState.tab = d.tab; msgState.page = 0; msgState.pendingDel = null;
      if (msgState.mode === 'save' && d.tab === 'saved') msgState.mode = 'say';
      return renderMessages();
    case 'msg-mode':
      msgState.mode = d.mode; msgState.pendingDel = null;
      return renderMessages();
    case 'msg-page':
      msgState.page = Math.max(0, msgState.page + Number(d.d)); msgState.pendingDel = null;
      return renderMessages();
    case 'msg-new':
      toast(store.addMessage(editor.text) ? 'Elmentve' : editor.text.trim() ? 'Már mentve van' : 'Előbb írj be egy szöveget');
      return renderMessages();
    case 'card': return cardAction(Number(d.idx));
    case 'set-tab': setTab.current = d.tab; pendingConfirm = null; return renderSettings();
    case 'set': return changeSetting(d.key, d.op);
    case 'action': return runAction(d.id);
    case 'pin-key': return pinDigit(d.d);
    case 'pin-back': if (pinCtx) { pinCtx.value = pinCtx.value.slice(0, -1); renderPin(); } return;
    case 'pin-clear': if (pinCtx) { pinCtx.value = ''; renderPin(); } return;
    case 'pin-cancel': overlays.pin.hidden = true; pinCtx = null; return 'nav';
    default:
  }
}

/* ---------- Indítás ---------- */

async function main() {
  try {
    seedPhrases = await (await fetch('data/phrases-hu.json')).json();
  } catch (e) {
    seedPhrases = [];
  }
  store.load(seedPhrases);

  buildKeyboard($('#keyboard'), layout);
  touchCtl = new TouchController(document.body, { getSettings: () => store.settings, onActivate: handleActivate, marker: $('#touch-marker') });

  speaker.onStatus = (status, detail) => {
    const box = $('#status');
    if (status === 'loading') box.textContent = 'Hang betöltése…';
    else if (status === 'ready') { box.textContent = ''; prefetchCommon(); }
    else if (status === 'failed') { box.textContent = 'Rendszerhang'; console.error('TTS hiba:', detail); }
  };
  speaker.onSpeaking = (on) => $('#speak-btn').classList.toggle('speaking', on);

  const unlock = () => speaker.unlock();
  document.addEventListener('pointerdown', unlock, true);
  document.addEventListener('pointerup', unlock, true);

  const ta = $('#editor-ta');
  const syncFromTextarea = () => {
    editor.text = ta.value;
    editor.caret = ta.selectionStart;
    $('#editor-wrap').classList.toggle('has-text', editor.text.length > 0);
    refreshSuggestions();
  };
  ta.addEventListener('input', syncFromTextarea);
  ta.addEventListener('keyup', syncFromTextarea);

  $('#paste-box')?.addEventListener('input', (e) => {
    const text = e.target.value;
    if (!text.trim()) return;
    insert(text.replace(/\r\n?/g, '\n'));
    toggleEditSheet(false);
    toast('Beillesztve');
  });

  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      store.importAll(await file.text());
      applySettings();
      renderSettings();
      toast('Az adatok betöltve');
    } catch (err) {
      toast('A fájl nem olvasható');
    }
  });

  applySettings();
  setupInstall();
  store.requestPersistence();

  predictor.load('data/words-hu.txt', seedPhrases).then(refreshSuggestions).catch((e) => console.error('Szólista hiba', e));

  // Fejlesztés közben (localhost) a gyorsítótár elrejtené a módosításokat, ezért ott csak ?sw esetén fut.
  const dev = ['localhost', '127.0.0.1'].includes(location.hostname) && !location.search.includes('sw');
  if ('serviceWorker' in navigator && !dev) {
    setupUpdates();
    checkOffline();
    setInterval(checkOffline, 15000);
  } else {
    checkOffline();
  }

  keepAwake();
}

/** Új verzió keresése induláskor és az alkalmazásba való visszatéréskor; megérkezése után biztonságos pillanatban újratölt. */
function setupUpdates() {
  const hadController = !!navigator.serviceWorker.controller;
  let reloadPending = false;
  const tryReload = () => {
    const idle = !editor.text.trim() && Object.values(overlays).every((o) => o.hidden) && $('#sheet-edit').hidden;
    if (idle && !speaker.job) location.reload();
  };
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadPending) return; // az első telepítéskor nem kell újratölteni
    reloadPending = true;
    toast('Új verzió érkezett');
    tryReload();
    setInterval(tryReload, 5000); // amint nincs beírt szöveg és nincs nyitott képernyő, betölti az újat
  });
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((reg) => {
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {});
    });
  }).catch((e) => console.error('SW hiba', e));
}

async function checkOffline() {
  try {
    const hit = await caches.match(MODEL_URL);
    const was = offlineReady;
    const was2 = cacheName;
    offlineReady = !!hit;
    cacheName = (await caches.keys()).find((k) => /^fst-v/.test(k)) || '';
    if ((was !== offlineReady || was2 !== cacheName) && !overlays.settings.hidden) renderSettings();
  } catch (e) { /* nem kritikus */ }
}

/** Telepített alkalmazásként (önálló ablakban) vagy böngészőlapon fut-e. */
function runMode() {
  const installed = ['standalone', 'fullscreen', 'minimal-ui'].some((m) => matchMedia(`(display-mode: ${m})`).matches) || navigator.standalone === true;
  return installed ? 'telepített alkalmazás' : 'böngészőlap';
}

let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) { /* nem kritikus */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});

/**
 * Ha az index.html és az app.js különböző verzióból származik (pl. a böngésző saját gyorsítótára miatt),
 * egyszer frissen újratölti a fájlokat. Kiadáskor az index.html app-version értékét is a VERSION-re kell állítani.
 */
async function versionsMismatch() {
  const htmlVersion = document.querySelector('meta[name="app-version"]')?.content;
  if (htmlVersion === VERSION) return false;
  if (sessionStorage.getItem('fst.versionFix') === VERSION) return false; // nem ismételjük végtelenül
  sessionStorage.setItem('fst.versionFix', VERSION);
  await Promise.allSettled(['./', 'index.html', 'css/style.css'].map((u) => fetch(u, { cache: 'reload' })));
  location.reload();
  return true;
}

if (!(await versionsMismatch())) main();
