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
const LONG_MS = 700; // a hosszú nyomás ideje azoknál az elemeknél, amelyek csak hosszú nyomásra reagálnak (data-long)
const DRAG_VH = 3; // ennyi mozgás (a képernyő magasságának %-ában) után a nyomás húzásnak számít a gördíthető területen

export class TouchController {
  /**
   * @param {HTMLElement} root
   * @param {{getSettings: () => object, onActivate: (el: HTMLElement, long: boolean, point: ({x: number, y: number}|null)) => (void|'nav'), onScroll?: (el: HTMLElement, dy: number) => void, marker: HTMLElement}} opts
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
    root.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      // Egérnél a jobb klikk ugyanazt csinálja, mint a hosszú nyomás.
      if (e.target.closest && e.target.closest('[data-native]')) return;
      const t = this._targetAt(e.clientX, e.clientY);
      if (t && (t.dataset.long || t.dataset.longact)) this._fire(t, !!t.dataset.longact, { x: e.clientX, y: e.clientY });
    });
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
    this.active = {
      id: e.pointerId, mode, down: target, hover: null, timer: null, armed: true, lockUntilLift: false,
      x: e.clientX, y: e.clientY, startX: e.clientX, startY: e.clientY, since: performance.now(), dragging: false,
    };
    this._marker(e.clientX, e.clientY, mode !== 'normal');
    this._setHover(target);
  }

  _move(e) {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    this._marker(e.clientX, e.clientY, a.mode !== 'normal');
    let dy = e.clientY - a.y;
    a.x = e.clientX;
    a.y = e.clientY;
    // A gördíthető területen (data-scroll) a húzás gördít, és nem aktivál semmit.
    if (a.down && a.down.dataset.scroll && this.opts.onScroll) {
      if (!a.dragging && Math.hypot(a.x - a.startX, a.y - a.startY) > window.innerHeight * DRAG_VH / 100) {
        a.dragging = true;
        a.armed = false;
        a.lockUntilLift = true;
        clearTimeout(a.timer);
        if (a.hover) a.hover.classList.remove('hover', 'dwelling');
        dy = a.y - a.startY;
      }
      if (a.dragging) {
        this.opts.onScroll(a.down, dy);
        return;
      }
    }
    this._setHover(this._targetAt(e.clientX, e.clientY));
  }

  _up(e) {
    const a = this.active;
    if (!a || e.pointerId !== a.id) return;
    const hover = a.hover;
    const down = a.down;
    const mode = a.mode;
    const { armed, since, dragging } = a;
    this._clear();
    if (!hover || dragging) return;
    if (hover.dataset.long) return; // az ilyen elem csak hosszú nyomásra aktiválódik
    if (hover.dataset.longact) {
      // Rövid és hosszú művelettel is bíró elem: a hosszú már lefutott, vagy a rövid a felengedéskor aktiválódik.
      if (!armed) return;
      if (mode === 'hold') {
        if (performance.now() - since >= this.opts.getSettings().holdMs) this._fire(hover);
      } else if (mode === 'release' || this._same(hover, down)) {
        this._fire(hover);
      }
      return;
    }
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
    a.since = performance.now();
    if (!a.lockUntilLift) a.armed = true;
    if (!el) return;
    el.classList.add('hover');
    if (a.armed && (a.mode === 'hold' || el.dataset.long || el.dataset.longact)) this._startDwell(el);
  }

  _startDwell(el) {
    const a = this.active;
    const holdMs = this.opts.getSettings().holdMs;
    const dual = !!el.dataset.longact;
    let ms = a.mode === 'hold' ? holdMs : LONG_MS;
    if (el.dataset.long) ms = LONG_MS;
    else if (dual && a.mode === 'hold') ms = Math.max(LONG_MS, holdMs + 500); // a rövid művelet holdMs-nél már megvan
    el.style.setProperty('--dwell', ms + 'ms');
    el.classList.add('dwelling');
    a.timer = setTimeout(() => {
      if (!this.active || this.active !== a || a.hover !== el) return;
      el.classList.remove('dwelling');
      a.armed = false;
      this._fire(el, dual, { x: a.x, y: a.y });
    }, ms);
  }

  _fire(el, long = false, point = null) {
    const now = performance.now();
    const gap = this.opts.getSettings().repeatMs;
    if (this.last && this._same(this.last.el, el) && now - this.last.t < gap) {
      this._flash(el, 'ignored');
      return;
    }
    this.last = { el, t: now };
    this._flash(el, 'ok');
    if (navigator.vibrate) navigator.vibrate(25);
    const result = this.opts.onActivate(el, long, point);
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
