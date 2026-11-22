/* A saját, nagy gombos magyar billentyűzet kiosztása és felépítése. */

const L = (ch, w = 1, shiftCh) => ({ ch, w, shiftCh });
const A = (act, label, w = 1) => ({ act, label, w });
const SP = (w) => ({ spacer: w });
const letters = (s) => [...s].map((c) => L(c));

export const LAYOUTS = {
  abc: [
    [SP(1), ...letters('áéíóöőúüű'), SP(1)],
    [...letters('qwertzuiop'), A('backspace', '◀')],
    [SP(0.5), ...letters('asdfghjkl'), A('enter', '↵', 1.5)],
    [A('shift', '⇧'), ...letters('yxcvbnm'), L(',', 1, '!'), L('.', 1, '?'), A('shift', '⇧')],
    [A('layout', '123', 2), A('space', '', 7), A('left', '←'), A('right', '→')],
  ],
  sym: [
    [SP(1), L('!'), L('?'), L('.'), L(','), L(':'), L(';'), L('"'), L("'"), L('-'), SP(1)],
    [...letters('1234567890'), A('backspace', '◀')],
    [SP(0.5), ...letters('@#€%&*()/'), A('enter', '↵', 1.5)],
    [SP(1), ...letters('+=_~<>[]'), SP(2)],
    [A('layout', 'ABC', 2), A('space', '', 7), A('left', '←'), A('right', '→')],
  ],
};

const el = (tag, cls) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
};

export function buildKeyboard(container, layoutName) {
  container.textContent = '';
  LAYOUTS[layoutName].forEach((row, ri) => {
    const r = el('div', 'krow');
    row.forEach((k, ci) => {
      if (k.spacer) {
        const s = el('div', 'kspacer');
        s.style.flex = String(k.spacer);
        r.append(s);
        return;
      }
      const b = el('button', 't key');
      b.type = 'button';
      b.style.flex = String(k.w);
      b.dataset.slot = `k${ri}_${ci}`;
      const cap = el('span', 'cap');
      if (k.act) {
        b.dataset.act = k.act;
        b.classList.add('special', 'k-' + k.act);
        cap.textContent = k.label;
      } else {
        b.dataset.act = 'key';
        b.dataset.ch = k.ch;
        if (k.shiftCh) b.dataset.shift = k.shiftCh;
      }
      b.append(cap);
      r.append(b);
    });
    container.append(r);
  });
}

/** A betűk feliratát frissíti (⇧ és nagybetűs megjelenítés), a gombokat nem építi újra. */
export function labelKeys(container, { shift, upper }) {
  for (const b of container.querySelectorAll('.key[data-ch]')) {
    const cap = b.firstElementChild;
    const ch = b.dataset.ch;
    const hint = b.dataset.shift;
    const main = shift && hint ? hint : shift || upper ? ch.toUpperCase() : ch;
    cap.textContent = main;
    if (hint && !shift) {
      const small = document.createElement('small');
      small.textContent = hint;
      cap.append(small);
    }
  }
  for (const b of container.querySelectorAll('.k-shift')) b.classList.toggle('on', shift);
}

export function keyChar(el, shift) {
  const ch = el.dataset.ch;
  if (shift && el.dataset.shift) return el.dataset.shift;
  return shift ? ch.toUpperCase() : ch;
}
