/* Szóajánló: gyakorisági lista + a felhasználó saját szokásai (egyes szavak és szópárok). */

const ACCENT = { á: 'a', é: 'e', í: 'i', ó: 'o', ö: 'o', ő: 'o', ú: 'u', ü: 'u', ű: 'u' };
const START = '^';

/** A beírt előtag minden betűje egyezik, de a nem ékezetes betű az ékezetesre is illik (e → é). */
export function matchesPrefix(word, prefix) {
  if (word.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    const p = prefix[i];
    const w = word[i];
    if (p !== w && ACCENT[w] !== p) return false;
  }
  return true;
}

export function tokenize(text) {
  return text.toLowerCase().match(/[\p{L}]+|[.!?]/gu) || [];
}

export class Predictor {
  constructor(store) {
    this.store = store;
    this.dict = new Map();   // szó -> alappontszám (0..1)
    this.list = [];          // [szó, alappontszám], gyakoriság szerint
    this.seedUni = {};
    this.seedBi = {};
  }

  async load(wordsUrl, seedPhrases) {
    const text = await (await fetch(wordsUrl)).text();
    let max = 1;
    const rows = [];
    for (const line of text.split('\n')) {
      const i = line.indexOf(' ');
      if (i < 1) continue;
      const count = parseInt(line.slice(i + 1), 10);
      rows.push([line.slice(0, i), count]);
      if (count > max) max = count;
    }
    const lmax = Math.log(max + 1);
    for (const [w, c] of rows) {
      const score = Math.log(c + 1) / lmax;
      this.dict.set(w, score);
      this.list.push([w, score]);
    }
    for (const phrase of seedPhrases) this._count(tokenize(phrase), this.seedUni, this.seedBi);
  }

  _count(tokens, uni, bi) {
    let prev = START;
    for (const t of tokens) {
      if (t === '.' || t === '!' || t === '?') { prev = START; continue; }
      uni[t] = (uni[t] || 0) + 1;
      bi[prev + ' ' + t] = (bi[prev + ' ' + t] || 0) + 1;
      prev = t;
    }
  }

  learn(text) {
    this._count(tokenize(text), this.store.words.uni, this.store.words.bi);
    const bi = this.store.words.bi;
    const keys = Object.keys(bi);
    if (keys.length > 30000) for (const k of keys) if (bi[k] <= 1) delete bi[k];
    this.store.saveWords();
  }

  /**
   * @param {string} prefix  a most írt szó eleje (lehet üres)
   * @param {string} prev    az előző szó kisbetűvel, vagy '^' mondat elején
   */
  suggest(prefix, prev, count) {
    const p = prefix.toLowerCase();
    const { uni, bi } = this.store.words;
    const scored = new Map();

    const consider = (w, base) => {
      if (w === p) return;
      if (p && !matchesPrefix(w, p)) return;
      const key = prev + ' ' + w;
      const u = (uni[w] || 0) + 0.3 * (this.seedUni[w] || 0);
      const b = (bi[key] || 0) + 0.5 * (this.seedBi[key] || 0);
      if (!p && !b && !(prev === START && u)) return;
      const score = base + 1.2 * Math.log1p(u) + 2.5 * Math.log1p(b);
      const old = scored.get(w);
      if (old === undefined || score > old) scored.set(w, score);
    };

    if (p) {
      for (const [w, base] of this.list) consider(w, base);
    } else {
      for (const k of Object.keys(bi)) if (k.startsWith(prev + ' ')) consider(k.slice(prev.length + 1), this.dict.get(k.slice(prev.length + 1)) || 0.3);
      for (const k of Object.keys(this.seedBi)) if (k.startsWith(prev + ' ')) consider(k.slice(prev.length + 1), this.dict.get(k.slice(prev.length + 1)) || 0.3);
    }
    // saját, a listában nem szereplő szavak
    for (const w of Object.keys(uni)) if (!this.dict.has(w)) consider(w, 0.3);

    let result = [...scored.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
    if (result.length < count && !p) {
      for (const [w] of this.list) {
        if (result.length >= count) break;
        if (!result.includes(w)) result.push(w);
      }
    }
    return result.slice(0, count);
  }
}
