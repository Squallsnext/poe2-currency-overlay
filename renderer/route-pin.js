'use strict';
// Pinned route window: shows what the overlay renderer computed (renderer.js
// detachedPayload) and sends every click and entry back to it - the rates, the route and
// the gold estimate all live there. On each new content the focused field and caret are
// restored, so typing is not interrupted when the overlay pushes an update.
const tip = document.getElementById('spark-tip');
let copyText = '';

function focusKey(el) {
  if (!el || !tip.contains(el)) return null;
  if (el.classList.contains('tip-gold-qty')) return { sel: '.tip-gold-qty' };
  const row = el.closest('.tip-fix-row');
  if (row) return { sel: `.tip-fix-row[data-a="${row.dataset.a}"][data-b="${row.dataset.b}"] [data-side="${el.dataset.side}"]` };
  return null;
}

window.routePinApi.onContent((p) => {
  document.documentElement.dataset.theme = p.theme === 'industry' ? 'industry' : 'default';
  document.documentElement.classList.toggle('dyslexic-font', !!p.dyslexic);
  document.getElementById('rp').style.background = `color-mix(in srgb, var(--s-root) ${Math.round((p.alpha || 1) * 1000) / 10}%, transparent)`;
  document.getElementById('rp-title').textContent = p.title || '';
  copyText = p.copyText || '';
  const f = document.activeElement;
  const key = focusKey(f);
  const caret = key && typeof f.selectionStart === 'number' ? [f.selectionStart, f.selectionEnd] : null;
  const typed = key ? f.value : null;
  tip.innerHTML = p.html || '';
  if (key) {
    const el = tip.querySelector(key.sel);
    if (el) {
      // a field still being typed into keeps what was typed, not the pushed value
      if (typed != null && document.hasFocus()) el.value = typed;
      el.focus();
      if (caret) try { el.setSelectionRange(caret[0], caret[1]); } catch {}
    }
  }
  requestAnimationFrame(() => window.routePinApi.action({ type: 'height', value: document.getElementById('rp').scrollHeight + 10 }));
});

document.getElementById('rp-close').onclick = () => window.routePinApi.action({ type: 'close' });

tip.addEventListener('click', (e) => {
  // "fix rate" folds the rate editor open/closed (the overlay renders it)
  if (e.target.closest('.tip-fix')) { window.routePinApi.action({ type: 'toggleFix' }); return; }
  const clr = e.target.closest('.tip-fix-clear');
  if (clr) {
    const row = clr.closest('.tip-fix-row');
    window.routePinApi.action({ type: 'clearRate', a: row.dataset.a, b: row.dataset.b });
    return;
  }
  const cp = e.target.closest('.tip-copy');
  if (cp && copyText) {
    navigator.clipboard.writeText(copyText).then(() => { cp.textContent = '✓'; }, () => { cp.textContent = '✕'; });
  }
});
tip.addEventListener('keydown', (e) => {
  // Enter in the size/rounds box: send it now and leave the box
  const qty = e.target.closest && e.target.closest('.tip-gold-qty');
  if (qty && e.key === 'Enter') {
    e.preventDefault();
    clearTimeout(qtyTimer);
    window.routePinApi.action({ type: 'qty', value: qty.value });
    qty.blur();
    return;
  }
  const inp = e.target.closest && e.target.closest('.tip-fix-in');
  if (!inp) return;
  if (e.key === 'Escape') { inp.blur(); return; }
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const row = inp.closest('.tip-fix-row');
  window.routePinApi.action({ type: 'setRate', a: row.dataset.a, b: row.dataset.b,
    qa: row.querySelector('[data-side="a"]').value, qb: row.querySelector('[data-side="b"]').value });
  inp.blur(); // the pushed update shows the saved state, not a half-typed field
});
let qtyTimer = null;
tip.addEventListener('input', (e) => {
  if (!e.target.closest('.tip-gold-qty')) return;
  clearTimeout(qtyTimer);
  const v = e.target.value;
  qtyTimer = setTimeout(() => window.routePinApi.action({ type: 'qty', value: v }), 300);
});
