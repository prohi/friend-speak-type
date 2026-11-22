/*
 * Érintéskezelés mozgáskorlátozott felhasználóknak.
 *
 * Módok:
 *  - normal:  a gomb akkor aktiválódik, ha az ujj ugyanazon a gombon emelkedik fel, ahol lenyomták
 *  - release: az érintés csak jelöl (piros kör), az ujj felemelésekor az éppen kijelölt gomb aktiválódik
 *  - hold:    a gomb akkor aktiválódik, ha az ujj a beállított ideig folyamatosan rajta marad
 *
 * Minden módban: csak az első ujj számít, a további egyidejű érintések figyelmen kívül maradnak,
 * és ugyanaz a gomb a beállított időn belül nem aktiválható újra (ismétlésszűrés).
 */

const TARGET = '.t';

export class TouchController {
  /**
   * @param {HTMLElement} root
   * @param {{getSettings: () => object, onActivate: (el: HTMLElement) => (void|'nav'), marker: HTMLElement}} opts
   */
  constructor(root, opts) {
    this.root = root;
    this.opts = opts;
    this.active = null;
    this.last = null;
    root.addEventListener('pointerdown', (e) => this._down(e));
    root.addEventListener('pointermove', (e) => this._move(e));
    root.addEventListener('pointerup', (e) => this._up(e));
    root.addEventListener('pointercancel', (e) => this._cancel(e));
    root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _targetAt(x, y) {
    const el = document.elementFromPoint(x, y);
    const t = el && el.closest(TARGET);
    return t && !t.classList.contains('disabled') ? t : null;
  }

  /** Két elem akkor azonos, ha ugyanazt a helyet foglalják (újrarajzolás után is). */
  _same(a, b) {
    if (a === b) return true;
    return !!(a && b && a.dataset.slot && a.dataset.slot === b.dataset.slot);
  }

  _down(e) {
    if (!e.isPrimary || this.active) return;
    if (e.target.closest && e.target.closest('[data-native]')) return; // pl. a rendszerbillentyűzetes szövegmező
    e.preventDefault();
    try { this.root.setPointerCapture(e.pointerId); } catch (err) { /* nem kritikus */ }
    const mode = this.opts.getSettings().touchMode;
    const target = this._targetAt(e.clientX, e.clientY);
    this.active = { id: e.pointerId, mode, down: target, hover: null, timer: null, armed: true, lockUntilLift: false };
    this._marker(e.clientX, e.clientY, mode !== 'normal');
    this._setHover(target);
  }

  _move(e) {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    this._marker(e.clientX, e.clientY, a.mode !== 'normal');
    this._setHover(this._targetAt(e.clientX, e.clientY));
  }

  _up(e) {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    const hover = a.hover;
    const down = a.down;
    const mode = a.mode;
    this._clear();
    if (!hover) return;
    if (mode === 'release') this._fire(hover);
    else if (mode === 'normal' && this._same(hover, down)) this._fire(hover);
  }

  _cancel(e) {
    if (this.active && e.pointerId === this.active.id) this._clear();
  }

  _setHover(el) {
    const a = this.active;
    if (!a) return;
    if (this._same(a.hover, el)) {
      if (el && a.hover !== el) a.hover = el; // újrarajzolt elem: az új példányt jelöljük
      if (a.hover) a.hover.classList.add('hover');
      return;
    }
    if (a.hover) a.hover.classList.remove('hover', 'dwelling');
    clearTimeout(a.timer);
    a.hover = el;
    if (!a.lockUntilLift) a.armed = true;
    if (!el) return;
    el.classList.add('hover');
    if (a.mode === 'hold' && a.armed) this._startDwell(el);
  }

  _startDwell(el) {
    const a = this.active;
    const ms = this.opts.getSettings().holdMs;
    el.style.setProperty('--dwell', ms + 'ms');
    el.classList.add('dwelling');
    a.timer = setTimeout(() => {
      if (!this.active || this.active !== a || a.hover !== el) return;
      el.classList.remove('dwelling');
      a.armed = false;
      this._fire(el);
    }, ms);
  }

  _fire(el) {
    const now = performance.now();
    const gap = this.opts.getSettings().repeatMs;
    if (this.last && this._same(this.last.el, el) && now - this.last.t < gap) {
      this._flash(el, 'ignored');
      return;
    }
    this.last = { el, t: now };
    this._flash(el, 'ok');
    if (navigator.vibrate) navigator.vibrate(25);
    const result = this.opts.onActivate(el);
    if (result === 'nav' && this.active) {
      this.active.armed = false;
      this.active.lockUntilLift = true;
    }
  }

  _flash(el, cls) {
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 220);
  }

  _marker(x, y, visible) {
    const m = this.opts.marker;
    m.style.transform = `translate(${x}px, ${y}px)`;
    m.classList.toggle('visible', visible);
  }

  _clear() {
    const a = this.active;
    if (!a) return;
    clearTimeout(a.timer);
    if (a.hover) a.hover.classList.remove('hover', 'dwelling');
    this.active = null;
    this.opts.marker.classList.remove('visible');
  }
}
