'use strict';
// builder.js - the tab builder window (main.js "tab builder"): name the cells the program
// found on a capture of a new stash tab, one after the other, then save. The name picker
// works like the Swap tab's: a few letters, the matches with their icons, Enter.
(function () {
  const $ = (id) => document.getElementById(id);
  const api = window.builderApi;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const CELL = 51.5;
  let D = null, items = [], byId = new Map(), cells = [], sel = -1, adding = false, scale = 1, hitIdx = 0, hits = [];
  let names = null; // English -> the client's own name (the game's strings, game-names.js)
  const local = (en) => (names && names[en]) || en;

  function fit() {
    const img = $('panel');
    const avail = Math.max(300, $('stage').clientWidth - 24);
    scale = Math.min(1, avail / D.width);
    img.style.width = (D.width * scale) + 'px';
    img.style.height = (D.height * scale) + 'px';
    draw();
  }
  // reference coords -> displayed px
  const kx = () => (D.width / D.refBox.w) * scale, ky = () => (D.height / D.refBox.h) * scale;
  const toPx = (c) => ({ left: (c.x - D.refBox.x) * kx(), top: (c.y - D.refBox.y) * ky(), width: c.w * kx(), height: c.h * ky() });

  function draw() {
    const box = $('cells');
    box.innerHTML = '';
    cells.forEach((c, i) => {
      const p = toPx(c);
      const d = document.createElement('div');
      d.className = 'cell' + (c.apiId ? ' named' : '') + (i === sel ? ' sel' : '');
      Object.assign(d.style, { left: p.left + 'px', top: p.top + 'px', width: p.width + 'px', height: p.height + 'px' });
      const it = c.apiId && byId.get(c.apiId);
      d.innerHTML = `<span class="no">${i + 1}</span>` + (it && it.icon ? `<img src="${esc(it.icon)}" alt="">` : '');
      d.title = c.apiId ? local(it ? it.name : c.apiId) : 'Zelle ' + (i + 1) + ' – noch ohne Namen';
      d.onclick = (e) => { e.stopPropagation(); if (!adding) choose(i); };
      box.appendChild(d);
    });
    list();
  }
  function list() {
    const named = cells.filter((c) => c.apiId).length;
    $('progress').textContent = `${named} von ${cells.length} Zellen benannt`;
    $('list').innerHTML = cells.map((c, i) => {
      const it = c.apiId && byId.get(c.apiId);
      return `<div class="li${i === sel ? ' sel' : ''}" data-i="${i}"><span class="n">${i + 1}</span>`
        + (it && it.icon ? `<img src="${esc(it.icon)}" alt="">` : '<span style="width:22px"></span>')
        + `<span class="nm${c.apiId ? '' : ' empty'}">${esc(c.apiId ? local(it ? it.name : c.apiId) : 'noch ohne Namen')}</span></div>`;
    }).join('');
  }
  function choose(i) {
    sel = i;
    $('picktitle').textContent = i >= 0 ? `Item für Zelle ${i + 1}` : '';
    $('pickbox').style.display = i >= 0 ? '' : 'none';
    $('search').value = '';
    search();
    draw();
    if (i >= 0) { $('search').focus(); const li = $('list').querySelector(`[data-i="${i}"]`); if (li) li.scrollIntoView({ block: 'nearest' }); }
  }
  function search() {
    const q = $('search').value.trim().toLowerCase();
    hits = [];
    if (q.length >= 2) {
      for (const it of items) {
        const ln = local(it.name).toLowerCase(), en = String(it.name).toLowerCase();
        const at = Math.min(...[ln.indexOf(q), en.indexOf(q)].filter((v) => v >= 0).concat([999]));
        if (at < 999) hits.push({ it, at });
      }
      hits.sort((a, b) => a.at - b.at || local(a.it.name).length - local(b.it.name).length);
      hits = hits.slice(0, 12).map((h) => h.it);
    }
    hitIdx = 0;
    $('hits').innerHTML = hits.map((it, k) => `<div class="hit${k === 0 ? ' on' : ''}" data-k="${k}">${it.icon ? `<img src="${esc(it.icon)}" alt="">` : ''}<span>${esc(local(it.name))}</span>`
      + (local(it.name) !== it.name ? `<span class="en">${esc(it.name)}</span>` : '') + '</div>').join('')
      || (q.length >= 2 ? '<div class="dim">Kein Treffer.</div>' : '<div class="dim">Mindestens 2 Buchstaben.</div>');
  }
  function pick(it) {
    if (sel < 0 || !it) return;
    // one cell per item: the same name on another cell moves here
    cells.forEach((c, j) => { if (j !== sel && c.apiId === it.apiId) c.apiId = null; });
    cells[sel].apiId = it.apiId;
    const next = cells.findIndex((c, j) => j > sel && !c.apiId);
    const any = next >= 0 ? next : cells.findIndex((c) => !c.apiId);
    choose(any);
    if (any < 0) { $('msg').className = 'dim ok'; $('msg').textContent = 'Alle Zellen benannt – jetzt „Speichern & paaren“.'; }
  }

  async function init() {
    D = await api.getData();
    if (!D) { document.body.textContent = 'Keine Aufnahme.'; return; }
    names = (window.I18N_NAMES && window.I18N_NAMES[D.lang]) || null;
    items = await api.items();
    for (const it of items) byId.set(it.apiId, it);
    cells = D.cells.map((c) => Object.assign({ apiId: null }, c));
    // editing a saved tab: its names go back onto the cells found (within 8 reference px);
    // a saved cell not found this time comes along as it was
    if (D.edit) {
      $('name').value = D.edit.label || '';
      for (const e of D.edit.cells) {
        const m = cells.find((c) => !c.apiId && Math.hypot(c.x - e.x, c.y - e.y) < 8);
        if (m) m.apiId = e.apiId; else cells.push(Object.assign({}, e));
      }
    }
    $('panel').src = 'data:image/png;base64,' + D.panelBase64;
    $('panel').onload = fit;
    window.addEventListener('resize', fit);
    $('msg').textContent = D.cells.length ? `${D.cells.length} Zellen gefunden.` : 'Keine Zellen gefunden – mit „+ Zelle“ selbst setzen.';
    choose(cells.findIndex((c) => !c.apiId));
  }

  $('search').addEventListener('input', search);
  $('search').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      hitIdx = Math.max(0, Math.min(hits.length - 1, hitIdx + (e.key === 'ArrowDown' ? 1 : -1)));
      $('hits').querySelectorAll('.hit').forEach((h, k) => h.classList.toggle('on', k === hitIdx));
    } else if (e.key === 'Enter') { e.preventDefault(); pick(hits[hitIdx]); }
    else if (e.key === 'Tab') { e.preventDefault(); const n = cells.findIndex((c, j) => j > sel && !c.apiId); choose(n >= 0 ? n : sel); }
  });
  $('hits').addEventListener('click', (e) => { const h = e.target.closest('.hit'); if (h) pick(hits[+h.dataset.k]); });
  $('list').addEventListener('click', (e) => { const li = e.target.closest('.li'); if (li) choose(+li.dataset.i); });
  $('add').onclick = () => { adding = !adding; $('add').classList.toggle('on', adding); $('pic').classList.toggle('adding', adding); };
  $('pic').addEventListener('click', (e) => {
    if (!adding) return;
    const r = $('pic').getBoundingClientRect();
    const x = D.refBox.x + (e.clientX - r.left) / kx() - CELL / 2, y = D.refBox.y + (e.clientY - r.top) / ky() - CELL / 2;
    cells.push({ x: +x.toFixed(1), y: +y.toFixed(1), w: CELL, h: CELL, apiId: null, added: true });
    adding = false; $('add').classList.remove('on'); $('pic').classList.remove('adding');
    choose(cells.length - 1);
  });
  const delSel = () => { if (sel < 0) return; cells.splice(sel, 1); choose(Math.min(sel, cells.length - 1)); };
  $('del').onclick = delSel;
  document.addEventListener('keydown', (e) => { if (e.key === 'Delete' && document.activeElement !== $('search') && document.activeElement !== $('name')) delSel(); });
  $('cancel').onclick = () => api.close();
  $('save').onclick = async () => {
    const named = cells.filter((c) => c.apiId);
    const label = $('name').value.trim();
    const msg = $('msg');
    if (!label) { msg.className = 'dim err'; msg.textContent = 'Bitte dem Fach einen Namen geben.'; $('name').focus(); return; }
    if (!named.length) { msg.className = 'dim err'; msg.textContent = 'Noch keine Zelle benannt.'; return; }
    $('save').disabled = true; msg.className = 'dim'; msg.textContent = 'Speichere, paare und setze die Kästchen …';
    const r = await api.save({ key: D.edit && D.edit.key, label, cells: named.map((c) => ({ apiId: c.apiId, x: c.x, y: c.y, w: c.w, h: c.h })) });
    $('save').disabled = false;
    if (!r || !r.ok) { msg.className = 'dim err'; msg.textContent = 'Speichern ging nicht: ' + ((r && r.error) || '?'); return; }
    msg.className = 'dim ok';
    msg.textContent = r.paired
      ? `„${r.label}“ gespeichert und gepaart – ${r.readCount || 0} von ${r.slotCount || named.length} Zahlen gelesen. Ab jetzt reicht F7. Zahlen im Vermögen prüfen, wo nötig Debug.`
      : `„${r.label}“ gespeichert. Das Paaren an diesem Bild hat nicht geklappt – einmal „Fächer scannen“ bis zu diesem Fach durchgehen.`;
  };
  init();
})();
