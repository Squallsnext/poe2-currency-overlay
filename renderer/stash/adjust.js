'use strict';
// Align tool ("Zahlenfelder ausrichten"): one box per slot, drawn over the captured panel,
// dragged/nudged onto the count it should read. Saved as per-slot {cx,cy,stripWidth,up,dn}
// in reference space (main.js stash-adjust-save). Lived as a template string inside
// main.js until it grew a help popup, steps and snapping diagnostics - now its own page
// (adjust.html / adjust.css), data handed over by main via adjust-preload.js.

let REF_BOX, WIDTH, HEIGHT, KX, KY, TAB, DATA, ORIG;
const $ = (id) => document.getElementById(id);
const wrap = $('wrap');
const gwInput = $('gw'), ghInput = $('gh');
let selected = null;
let drag = null;

function boxEl(i) { return document.querySelector('.box[data-i="' + i + '"]'); }
function place(el, r){
  el.style.left = r.x + 'px'; el.style.top = r.y + 'px';
  el.style.width = r.w + 'px'; el.style.height = r.h + 'px';
}
function deltas(){
  const out = {};
  for (const r of DATA) {
    const cx = REF_BOX.x + (r.x + r.w / 2) / KX;
    const cy = REF_BOX.y + (r.y + r.h / 2) / KY;
    const stripWidth = (r.w / KX) / 2;
    const up = (r.h / KY) / 2;
    out[r.apiId] = { cx: +cx.toFixed(2), cy: +cy.toFixed(2), stripWidth: +stripWidth.toFixed(2), up: +up.toFixed(2), dn: +up.toFixed(2) };
  }
  return out;
}
function select(el){
  document.querySelectorAll('.box.sel').forEach(x => x.classList.remove('sel'));
  selected = el; if (el) el.classList.add('sel');
  updateGuide(); updateMoveInfo();
}

// Per-tab settings: essences (three frame styles) want a different certainty than the
// currency tab (one frame style), and the search range scales with the capture.
function tabKey(k){ return k + ':' + TAB; }
function loadSetting(k, dflt){
  try { const v = localStorage.getItem(tabKey(k)); if (v != null) return v; const g = localStorage.getItem(k); if (g != null) return g; } catch {}
  return dflt;
}
function saveSetting(k, v){ try { localStorage.setItem(tabKey(k), v); } catch {} }

// ---- hand-placed boxes = models ("Vorbilder") for snapping ----
// Every box the player moved directly (not as a follower of a group move) is one. Frames
// differ between tiers (a perfect essence's frame is gilded and ornate, a lesser one's
// plain): compared with a single plain model, an ornate frame looked "unlike" it and
// needed the certainty down at ~15 %. With several models each box is compared with the
// one it resembles most - set one ornate box by hand, press F again, and every other
// ornate box follows.
const leaders = new Set();
function makeLeader(i){
  leaders.add(i);
  const el = boxEl(i); if (el) el.classList.add('leader');
  clearSnapFail(i);
  refreshSteps();
}

// ---- grid overlay + a guide line through the selected box's centre ----
const gridEl = $('grid'), guideEl = $('guide');
const gridStep = $('gridstep');
function drawGrid(){
  const g = Math.max(2, +gridStep.value || 10);
  gridEl.style.backgroundImage =
    'repeating-linear-gradient(to right, rgba(111,211,255,.28) 0 1px, transparent 1px ' + g + 'px),'
    + 'repeating-linear-gradient(to bottom, rgba(111,211,255,.28) 0 1px, transparent 1px ' + g + 'px)';
}
function updateGuide(){
  if (!selected) return;
  const r = DATA[+selected.dataset.i];
  guideEl.style.top = Math.round(r.y + r.h / 2) + 'px';
}

// ---- how far the selected box was moved, and what that says about the search range ----
// The other boxes are usually off by about the same amount as the first one was (the
// whole tab sits shifted), so the snap search range should be a bit MORE than that move -
// and not much more: the neighbour cell's frame is only a short way further out and
// nearly as strong, a too-wide range can snap onto it.
const rangeEl = $('snaprange'), minEl = $('snapmin');
function recommendedRange(dx, dy){ return Math.max(6, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy))) + 5); }
function updateMoveInfo(){
  const info = $('moveinfo');
  info.textContent = '';
  if (!selected) return;
  const i = +selected.dataset.i, r = DATA[i], o = ORIG[i];
  const dx = Math.round(r.x - o.x), dy = Math.round(r.y - o.y);
  if (!dx && !dy) return;
  const sgn = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + Math.abs(v);
  const rec = recommendedRange(dx, dy);
  const R = +rangeEl.value || 0;
  let txt = 'Ausgewähltes Kästchen verschoben: x ' + sgn(dx) + ' · y ' + sgn(dy) + ' px. ';
  let offer = false;
  if (R < rec) { txt += 'Suchbereich (' + R + ') ist kleiner – empfohlen ≥ ' + rec + ' px.'; offer = true; }
  else if (R > 2 * rec + 10) { txt += 'Suchbereich (' + R + ') ist sehr groß – kann an der Nachbarzelle einrasten; empfohlen ~' + rec + ' px.'; offer = true; }
  else txt += 'Suchbereich ' + R + ' px passt dazu.';
  info.appendChild(document.createTextNode(txt));
  if (offer) {
    const b = document.createElement('button');
    b.textContent = rec + ' px übernehmen';
    b.onclick = () => { rangeEl.value = rec; saveSetting('adjSnapRange', rec); updateMoveInfo(); };
    info.appendChild(b);
  }
}

// ---- row / column align, move-all, marking, undo ----
// "Reihe angleichen": every box to the RIGHT of the selected one whose centre sits within
// 10 reference px above/below it takes the selected box's height (y only - x untouched).
// Scaled to this capture, and well under the gap between real rows (~60) and the offset
// half-rows (~19), so a neighbouring row is never pulled in.
let ROW_TOL, COL_TOL;
const moveAllEl = $('moveall');
function moveAll(){ return !!(moveAllEl && moveAllEl.checked); }
// Marked boxes (Ctrl+click / lasso): moving one of them moves all marked ones together.
const marked = new Set();
function setMarked(i, on){
  if (on) marked.add(i); else marked.delete(i);
  const el = boxEl(i);
  if (el) el.classList.toggle('marked', on);
}
function clearMarked(){ for (const i of [...marked]) setMarked(i, false); }
// which other boxes follow a move of box i: all ("alle mitbewegen"), else the marked
// group if i belongs to it, else none
function followers(i){
  if (moveAll()) return null; // null = everyone
  if (marked.has(i) && marked.size > 1) return marked;
  return new Set();
}
function shiftAll(dx, dy, except, only){
  for (let i = 0; i < DATA.length; i++) {
    if (i === except) continue;
    if (only && !only.has(i)) continue;
    DATA[i].x += dx; DATA[i].y += dy;
    const el = boxEl(i);
    if (el) place(el, DATA[i]);
  }
}
// Undo: a snapshot of every box's position before each align/drag/nudge/snap
const history = [];
function snapshot(){
  history.push(DATA.map((r) => ({ x: r.x, y: r.y, w: r.w, h: r.h })));
  if (history.length > 50) history.shift();
}
function undo(){
  const snap = history.pop(); if (!snap) return;
  snap.forEach((p, i) => { Object.assign(DATA[i], p); const el = boxEl(i); if (el) place(el, DATA[i]); });
  clearAllSnapFail();
  $('snapinfo').textContent = 'Rückgängig gemacht.';
  updateGuide(); updateMoveInfo();
}
// "Spalte angleichen": every box BELOW the selected one whose centre is within 25 reference
// px left/right of it takes the selected box's horizontal position (x only). Wider than the
// row tolerance because hand-placed boxes drift sideways more (30+ px at 5K seen), and still
// under half the ~57-63 px column spacing, so the next column is not pulled in.
function alignCol(){
  if (!selected) return;
  snapshot();
  const a = DATA[+selected.dataset.i];
  const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
  for (let i = 0; i < DATA.length; i++) {
    const r = DATA[i];
    if (r === a) continue;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (cy <= acy || Math.abs(cx - acx) > COL_TOL) continue;
    r.x = acx - r.w / 2;
    const el = boxEl(i);
    if (el) place(el, r);
  }
}
function alignRow(){
  if (!selected) return;
  snapshot();
  const a = DATA[+selected.dataset.i];
  const acx = a.x + a.w / 2, acy = a.y + a.h / 2;
  for (let i = 0; i < DATA.length; i++) {
    const r = DATA[i];
    if (r === a) continue;
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (cx <= acx || Math.abs(cy - acy) > ROW_TOL) continue;
    r.y = acy - r.h / 2;
    const el = boxEl(i);
    if (el) place(el, r);
  }
}
// One shared size for every box: the real reader applies a single strip/up/dn per tab,
// only the CENTER differs per slot.
let sizeTouched = false;
function setGlobalSize(w, h){
  w = Math.max(12, w); h = Math.max(12, h);
  for (const r of DATA) {
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    r.w = w; r.h = h;
    r.x = cx - w / 2; r.y = cy - h / 2;
  }
  document.querySelectorAll('.box').forEach((el) => place(el, DATA[+el.dataset.i]));
  gwInput.value = Math.round(w); ghInput.value = Math.round(h);
  sizeTouched = true; refreshSteps();
}

// ---- "Am Rahmen einrasten" ----
// Place every box at the SAME spot relative to its own cell frame as the hand-placed
// models (★, the selected box always counts as one). A shared offset drifts across a
// wide row (cells are not spaced in whole pixels), so each box is fitted to its own cell.
// Each cell's frame corner (top-left) is found in the captured panel: the frame is a long
// straight edge, so the column/row with the strongest line along a cell-long run is the
// frame line, where icon art (short, curved edges) is not.
//
// Guards (reported: a second F pulled boxes away that already sat perfectly):
//  - the cell's frame is a double line, and the NEIGHBOUR cell's frame runs ~15 px
//    further out, nearly as strong (measured 7586 vs 6815) - within a wide search range
//    the strongest line can be the wrong one (a range of 25 px moved perfectly placed
//    boxes 31 px off). So every clear line is a candidate and the one whose light/dark
//    pattern is most like the model's wins, ties to the one nearest the predicted spot -
//    a box that already sits right stays exactly where it is.
//  - "Suchbereich": how far a box may jump at all.
//  - "Sicherheit": the lowest of three measures - vertical line strength and horizontal
//    line strength (each against the model's own frame line) and pattern similarity -
//    must reach it. Below, the box stays, is dashed, and shows the value it would need
//    plus a preview of where it would have gone.
// (An edge-PROFILE match over the whole surroundings was tried as well: less exact on a
// real 1456 px panel - two of 13 boxes landed a frame-line spacing off - so not used.)
let GRAY = null;
function gray(){
  if (GRAY) return GRAY;
  const img = $('panel');
  const c = document.createElement('canvas'); c.width = WIDTH; c.height = HEIGHT;
  const g = c.getContext('2d'); g.drawImage(img, 0, 0, WIDTH, HEIGHT);
  const d = g.getImageData(0, 0, WIDTH, HEIGHT).data;
  GRAY = new Float32Array(WIDTH * HEIGHT);
  for (let i = 0, p = 0; i < GRAY.length; i++, p += 4) GRAY[i] = (d[p] + d[p + 1] + d[p + 2]) / 3;
  return GRAY;
}
const px = (x, y) => GRAY[Math.min(HEIGHT - 1, Math.max(0, y | 0)) * WIDTH + Math.min(WIDTH - 1, Math.max(0, x | 0))];
// Line strength along a run, counted only where the line is there along (nearly) all of
// it: the run is cut into SEGS pieces and the second-weakest piece counts, times SEGS.
// A frame line runs the whole cell; a digit's straight stroke ("1") only part of it -
// summed plainly, that "1" beat the frame line 6318 to 3985 and pulled its box 24 px right.
const SEGS = 6;
function lineStrength(len, at){
  const seg = new Array(SEGS).fill(0);
  for (let k = 0; k < len; k++) seg[Math.min(SEGS - 1, Math.floor(k * SEGS / len))] += at(k);
  seg.sort((p, q) => p - q);
  return seg[1] * SEGS;
}
function colEdge(x, y0, len){ return lineStrength(len, (k) => Math.abs(px(x + 1, y0 + k) - px(x - 1, y0 + k))); }
function rowEdge(y, x0, len){ return lineStrength(len, (k) => Math.abs(px(x0 + k, y + 1) - px(x0 + k, y - 1))); }
// signed edge pattern a few px around a line (which side is brighter, the double line):
// the cell's OWN frame and the neighbour's frame ~15 px away are equally strong but not
// alike - this is what tells them apart
const PAT = 6;
function colPat(x, y0, len){ const o = []; for (let d = -PAT; d <= PAT; d++) { let s = 0; for (let k = 0; k < len; k += 2) s += px(x + d + 1, y0 + k) - px(x + d - 1, y0 + k); o.push(s); } return o; }
function rowPat(y, x0, len){ const o = []; for (let d = -PAT; d <= PAT; d++) { let s = 0; for (let k = 0; k < len; k += 2) s += px(x0 + k, y + d + 1) - px(x0 + k, y + d - 1); o.push(s); } return o; }
function ncc(a, b){
  const n = a.length; let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < n; i++) { const u = a[i] - ma, v = b[i] - mb; sab += u * v; saa += u * u; sbb += v * v; }
  return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
}
// strongest vertical + horizontal frame line near (gx, gy), refined twice. With "like"
// (a model's patterns and line strengths): every clear line - a local peak at least half
// as strong as the MODEL's frame line, not half the strongest line around: a gilded
// ornament three times the frame's strength would otherwise push the real frame line out
// of the running - is a candidate, and the one whose pattern is most like the model's
// wins; ties (within 0.05) go to the one nearest the predicted spot.
function findCorner(gx, gy, R, len, like){
  const x0 = Math.round(gx), y0 = Math.round(gy);
  const pick = (c0, edge, pat, ref, refS) => {
    const v = []; let best = -1, bi = 0;
    for (let k = -R; k <= R; k++) { const e = edge(c0 + k); v.push(e); if (e > best) { best = e; bi = k; } }
    if (!ref) return { c: c0 + bi, s: best };
    const floor = 0.5 * Math.min(best, refS > 0 ? refS : best);
    let win = null, winSim = -2;
    for (let k = -R; k <= R; k++) {
      const e = v[k + R];
      if (e < floor) continue;
      if (!((k === -R || e >= v[k + R - 1]) && (k === R || e >= v[k + R + 1]))) continue;
      const sim = ncc(ref, pat(c0 + k));
      if (win == null || sim > winSim + 0.05 || (sim > winSim - 0.05 && Math.abs(k) < Math.abs(win))) { win = k; winSim = Math.max(sim, winSim); }
    }
    if (win == null) { win = bi; winSim = 0; }
    return { c: c0 + win, s: v[win + R], sim: winSim };
  };
  let cx = x0, cy = y0, sx = 0, sy = 0, simX = 1, simY = 1;
  for (let pass = 0; pass < 2; pass++) {
    const a = pick(x0, (x) => colEdge(x, cy, len), (x) => colPat(x, cy, len), like && like.col, like && like.sx); cx = a.c; sx = a.s; if (a.sim != null) simX = a.sim;
    const b = pick(y0, (y) => rowEdge(y, cx, len), (y) => rowPat(y, cx, len), like && like.row, like && like.sy); cy = b.c; sy = b.s; if (b.sim != null) simY = b.sim;
  }
  return { x: cx, y: cy, sx, sy, simX, simY };
}
// a model: its frame corner (up/left of the number box), offset and patterns
function modelFor(i, len){
  const a = DATA[i];
  const c = findCorner(a.x - a.h * 0.2, a.y - a.h * 0.2, Math.round(a.h * 0.5), len, null);
  return { i, ox: a.x - c.x, oy: a.y - c.y, sx: c.sx, sy: c.sy, like: { col: colPat(c.x, c.y, len), row: rowPat(c.y, c.x, len), sx: c.sx, sy: c.sy } };
}
const MAX_MODELS = 8;

// unsure boxes: dashed, the certainty they would need, and a preview of the spot
const ghosts = new Map(); // i -> { el, x, y }
function clearSnapFail(i){
  const el = boxEl(i); if (el) { el.classList.remove('snapfail'); el.title = ''; }
  const g = ghosts.get(i); if (g) { g.el.remove(); ghosts.delete(i); }
}
function clearAllSnapFail(){ for (const i of [...ghosts.keys()]) clearSnapFail(i); document.querySelectorAll('.box.snapfail').forEach((el) => el.classList.remove('snapfail')); }
const pct = (v) => Math.max(0, Math.floor(v * 100));
function whyText(m){
  const parts = [];
  if (m.why === 'odd') {
    parts.push('Die Rahmenlinien wären deutlich genug, aber dieses Kästchen würde ' + arrowText(m.dx, m.dy) + ' px springen, die übrigen typischerweise ' + arrowText(m.odd.mdx, m.odd.mdy) + ' px – es hat sich vermutlich an etwas anderem festgehalten (verzierter Rahmen, Kante im Item-Bild).');
    parts.push('Die dünne Vorschau zeigt, wo es hinspringen würde. Passt sie: „Unsichere trotzdem einrasten“. Sonst: von Hand setzen und nochmal F.');
    return parts.join('\n');
  }
  if (m.why === 'x') parts.push('Die senkrechte Rahmenlinie ist nur ' + pct(m.need) + ' % so deutlich wie beim Vorbild.');
  else if (m.why === 'y') parts.push('Die waagerechte Rahmenlinie ist nur ' + pct(m.need) + ' % so deutlich wie beim Vorbild.');
  else parts.push('Der Rahmen sieht anders aus als bei jedem Vorbild (' + pct(m.need) + ' % ähnlich) – z. B. ein verzierter Rahmen einer höheren Stufe.');
  parts.push('Mit Sicherheit ≤ ' + pct(m.need) + ' % würde es einrasten.');
  parts.push('Oder: dieses Kästchen von Hand setzen und nochmal F – es wird Vorbild für alle gleichen Rahmen.');
  return parts.join('\n');
}
function arrowText(dx, dy){
  const h = dx ? (dx > 0 ? '→' : '←') + Math.abs(Math.round(dx)) : '';
  const v = dy ? (dy > 0 ? '↓' : '↑') + Math.abs(Math.round(dy)) : '';
  return (h + ' ' + v).trim() || '±0';
}

let snapRuns = 0;
function snapToFrames(){
  if (!selected && !leaders.size) return;
  gray();
  snapshot();
  clearAllSnapFail();
  if (selected) makeLeader(+selected.dataset.i);
  const size = DATA[+(selected ? selected.dataset.i : [...leaders][0])];
  // run length ~ a cell (about three box heights), so a frame line is told from a digit
  const len = Math.round(3 * size.h);
  const R = Math.max(1, Math.round(+rangeEl.value || 10));
  const minShare = (+minEl.value || 0) / 100;
  const models = [...leaders].slice(-MAX_MODELS).map((i) => modelFor(i, len));
  const targets = marked.size ? [...marked] : DATA.map((_, i) => i);
  // pass 1: for every box the best proposal over all models
  const props = [];
  for (const i of targets) {
    if (leaders.has(i)) continue; // hand-placed boxes are never moved by snapping
    const r = DATA[i];
    let best = null;
    for (const m of models) {
      const c = findCorner(r.x - m.ox, r.y - m.oy, R, len, m.like);
      const qx = m.sx > 0 ? c.sx / m.sx : 0, qy = m.sy > 0 ? c.sy / m.sy : 0, qs = Math.min(c.simX, c.simY);
      const need = Math.min(qx, qy, qs);
      const why = need === qs ? 'sim' : need === qx ? 'x' : 'y';
      if (!best || need > best.need) best = { need, why, x: c.x + m.ox, y: c.y + m.oy };
    }
    if (best) props.push(Object.assign(best, { i, dx: best.x - r.x, dy: best.y - r.y }));
  }
  // pass 2: plausibility. A tab is shifted as a whole (calibration slightly off, a
  // different UI scale), so the boxes' jumps are alike; a box jumping clearly differently
  // latched onto something else - a gilded ornament, an item's straight edge. Measured on
  // a test panel with painted-on ornate frames: three boxes snapped 8-26 px wrong while
  // their lines looked certain - only their odd jump gave them away. Such a box is not
  // moved but shown as unsure, with its jump next to the typical one.
  const confident = props.filter((q) => q.need >= minShare);
  const med = (arr) => { const a = arr.slice().sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0; };
  const mdx = med(confident.map((q) => q.dx)), mdy = med(confident.map((q) => q.dy));
  const tol = Math.max(6, size.h * 0.15);
  // ...but only when the jumps really ARE alike. Boxes placed by hand one by one are each
  // off by a different amount, their jumps differ legitimately - checked there, 8 of 13
  // correct snaps were held back. Spread = median distance of a jump from the median jump.
  const spread = med(confident.map((q) => Math.hypot(q.dx - mdx, q.dy - mdy)));
  const uniform = confident.length >= 3 && spread <= tol / 2;
  for (const q of props) {
    if (uniform && q.need >= minShare && Math.hypot(q.dx - mdx, q.dy - mdy) > tol) {
      q.odd = { mdx, mdy }; q.why = 'odd';
    }
  }
  let moved = 0, kept = 0, failed = 0, lowestNeed = 1, odd = 0;
  for (const q of props) {
    const i = q.i, r = DATA[i], el = boxEl(i);
    if (q.need < minShare || q.odd) {
      failed++;
      if (q.odd) odd++; else lowestNeed = Math.min(lowestNeed, q.need);
      if (el) { el.classList.add('snapfail'); el.title = whyText(q); el.querySelector('.need').textContent = q.odd ? 'Sprung?' : pct(q.need) + ' %'; }
      if (Math.abs(q.dx) >= 0.5 || Math.abs(q.dy) >= 0.5) {
        const g = document.createElement('div');
        g.className = 'ghost';
        place(g, { x: q.x, y: q.y, w: r.w, h: r.h });
        const lab = document.createElement('span'); lab.textContent = arrowText(q.dx, q.dy);
        g.appendChild(lab);
        wrap.appendChild(g);
        ghosts.set(i, { el: g, x: q.x, y: q.y });
      } else ghosts.set(i, { el: document.createElement('div'), x: r.x, y: r.y });
      continue;
    }
    if (Math.abs(q.dx) < 0.5 && Math.abs(q.dy) < 0.5) { kept++; continue; }
    r.x = q.x; r.y = q.y; moved++;
    if (el) place(el, r);
  }
  snapRuns++;
  let txt = moved + ' eingerastet · ' + kept + ' saßen schon · ' + failed + ' unsicher (gestrichelt)';
  txt += ' · Vorbilder: ' + models.length;
  if (failed > odd) txt += ' — bei Sicherheit ≤ ' + pct(lowestNeed) + ' % würden die zu unsicheren einrasten';
  if (odd) txt += (failed > odd ? ';' : ' —') + ' ' + odd + '× „Sprung?“: springt anders als die übrigen';
  if (failed) txt += ' (Maus auf ein gestricheltes Kästchen: warum).';
  $('snapinfo').textContent = txt;
  $('forcesnap').hidden = !failed;
  $('forcesnap').textContent = 'Unsichere trotzdem einrasten (' + failed + ')';
  updateGuide(); refreshSteps();
}
// deliberately take the previewed spot for every unsure box
function forceSnap(){
  if (!ghosts.size) return;
  snapshot();
  let n = 0;
  for (const [i, g] of ghosts) {
    const r = DATA[i]; r.x = g.x; r.y = g.y; n++;
    const el = boxEl(i); if (el) place(el, r);
  }
  clearAllSnapFail();
  $('forcesnap').hidden = true;
  $('snapinfo').textContent = n + ' unsichere Kästchen gesetzt – bitte prüfen (Strg+Z macht es rückgängig).';
  refreshSteps();
}

// ---- steps: what to do next, one short tip at a time ----
const STEP_TIPS = {
  1: 'Breite/Höhe so einstellen, dass die längste Zahl (auch zweistellig) ganz hineinpasst, aber wenig vom Item-Bild. Zu klein schneidet Ziffern ab, zu groß stören Bildkanten.',
  2: 'Ein Kästchen genau auf seine Zahl ziehen (oder Pfeiltasten). Es wird Vorbild (★). Die Zeile unten zeigt, wie weit es verschoben wurde, und den passenden Suchbereich.',
  3: 'F drücken: alle anderen übernehmen die Lage des Vorbilds in ihrem eigenen Rahmen. Was schon passt, bleibt stehen.',
  4: 'Gestrichelte Kästchen waren zu unsicher – Maus darauf zeigt warum. Eins davon von Hand setzen und nochmal F, oder die Sicherheit senken, oder „trotzdem einrasten“.',
  5: 'Alles eingerastet. Prüfen, dann „Speichern & übernehmen“ und den Tab neu scannen.',
};
let step1Ok = false;
function currentStep(){
  if (!sizeTouched && !step1Ok) return 1;
  if (!leaders.size) return 2;
  if (!snapRuns) return 3;
  if (document.querySelector('.box.snapfail')) return 4;
  return 5;
}
function refreshSteps(){
  const cur = currentStep();
  document.querySelectorAll('.step').forEach((s) => {
    const n = +s.dataset.step;
    s.classList.toggle('cur', n === cur);
    s.classList.toggle('done', n < cur);
  });
  const tip = $('tipline');
  tip.textContent = STEP_TIPS[cur];
  if (cur === 1) {
    const b = document.createElement('button');
    b.textContent = '✓ Größe passt';
    b.onclick = () => { step1Ok = true; refreshSteps(); };
    tip.appendChild(b);
  }
}

// ---- help popup ----
function toggleHelp(on){ $('help').classList.toggle('open', on == null ? !$('help').classList.contains('open') : on); }

// ---- setup, once main has handed over the capture and the boxes ----
function init(d){
  REF_BOX = d.refBox; WIDTH = d.width; HEIGHT = d.height; TAB = d.tab; DATA = d.rows;
  KX = WIDTH / REF_BOX.w; KY = HEIGHT / REF_BOX.h;
  ROW_TOL = 10 * KY; COL_TOL = 25 * KX;
  ORIG = DATA.map((r) => ({ x: r.x, y: r.y }));
  wrap.style.width = WIDTH + 'px'; wrap.style.height = HEIGHT + 'px';
  const img = $('panel');
  img.style.width = WIDTH + 'px'; img.style.height = HEIGHT + 'px';
  img.src = 'data:image/png;base64,' + d.panelBase64;

  DATA.forEach((r, i) => {
    const el = document.createElement('div');
    el.className = 'box ' + r.cls;
    el.dataset.i = i;
    const t = document.createElement('div'); t.className = 't'; t.textContent = r.label; el.appendChild(t);
    const need = document.createElement('div'); need.className = 'need'; el.appendChild(need);
    place(el, r);
    el.addEventListener('pointerdown', (ev) => {
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      if (ev.ctrlKey || ev.metaKey) { setMarked(i, !marked.has(i)); select(el); ev.preventDefault(); ev.stopPropagation(); return; }
      snapshot();
      select(el); el.setPointerCapture(ev.pointerId);
      drag = { i, sx: ev.clientX, sy: ev.clientY, x: r.x, y: r.y, lx: r.x, ly: r.y, moved: false };
      ev.preventDefault();
    });
    el.addEventListener('pointermove', (ev) => {
      if (!drag || drag.i !== i) return;
      r.x = drag.x + (ev.clientX - drag.sx);
      r.y = drag.y + (ev.clientY - drag.sy);
      { const f = followers(i); if (f === null || f.size) shiftAll(r.x - drag.lx, r.y - drag.ly, i, f); }
      if (r.x !== drag.lx || r.y !== drag.ly) drag.moved = true;
      drag.lx = r.x; drag.ly = r.y;
      place(el, r); updateGuide(); updateMoveInfo();
    });
    el.addEventListener('pointerup', () => {
      if (drag && drag.i === i && drag.moved) makeLeader(i);
      drag = null;
    });
    wrap.appendChild(el);
  });

  gwInput.value = DATA.length ? Math.round(DATA[0].w) : 0;
  ghInput.value = DATA.length ? Math.round(DATA[0].h) : 0;
  gwInput.addEventListener('input', () => setGlobalSize(+gwInput.value || DATA[0].w, DATA[0].h));
  ghInput.addEventListener('input', () => setGlobalSize(DATA[0].w, +ghInput.value || DATA[0].h));

  // snap settings: remembered per tab; default range ~ a third of a box height
  rangeEl.value = loadSetting('adjSnapRange', DATA.length ? Math.max(4, Math.round(DATA[0].h * 0.35)) : 10);
  minEl.value = loadSetting('adjSnapMin', 50);
  rangeEl.addEventListener('input', () => { saveSetting('adjSnapRange', rangeEl.value); updateMoveInfo(); });
  minEl.addEventListener('input', () => saveSetting('adjSnapMin', minEl.value));

  // grid on/off and spacing are remembered for the next time the tool opens
  try { gridStep.value = localStorage.getItem('adjGridStep') || Math.max(4, Math.round(10 * KX)); } catch { gridStep.value = Math.max(4, Math.round(10 * KX)); }
  let gridOn = false; try { gridOn = localStorage.getItem('adjGridOn') === '1'; } catch {}
  $('showgrid').checked = gridOn; wrap.classList.toggle('show-grid', gridOn); drawGrid();
  // All boxes shown by default: players ticked "show all" every time - a box fine for a
  // one-digit count can sit off once it has two. Hiding the green ones stays an option.
  let onlyBad = false; try { onlyBad = localStorage.getItem('adjOnlyBad') === '1'; } catch {}
  $('onlybad').checked = onlyBad; wrap.classList.toggle('hide-ok', onlyBad);

  if (DATA.length) select(document.querySelector('.box:not(.ok):not(.none)') || document.querySelector('.box'));
  refreshSteps();
}

// ---- controls ----
$('showgrid').addEventListener('change', (ev) => {
  wrap.classList.toggle('show-grid', ev.target.checked);
  try { localStorage.setItem('adjGridOn', ev.target.checked ? '1' : '0'); } catch {}
});
gridStep.addEventListener('input', () => { drawGrid(); try { localStorage.setItem('adjGridStep', gridStep.value); } catch {} });
$('onlybad').addEventListener('change', (ev) => {
  wrap.classList.toggle('hide-ok', ev.target.checked);
  try { localStorage.setItem('adjOnlyBad', ev.target.checked ? '1' : '0'); } catch {}
});
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(JSON.stringify(deltas(), null, 2)); } catch {} };
$('cancel').onclick = () => window.adjustApi.close();
$('save').onclick = () => window.adjustApi.save({ tab: TAB, deltas: deltas() });
$('rowalign').onclick = () => alignRow();
$('colalign').onclick = () => alignCol();
$('undo').onclick = () => undo();
$('unmark').onclick = () => clearMarked();
$('snapframe').onclick = () => snapToFrames();
$('forcesnap').onclick = () => forceSnap();
$('helpbtn').onclick = () => toggleHelp(true);
$('helpclose').onclick = () => toggleHelp(false);
$('help').addEventListener('click', (ev) => { if (ev.target === $('help')) toggleHelp(false); });
document.querySelectorAll('.step').forEach((s) => { s.onclick = () => { if (+s.dataset.step === 1) { step1Ok = true; refreshSteps(); } else toggleHelp(true); }; });

document.addEventListener('keydown', (ev) => {
  // In a size/grid/snap field (not a checkbox - after clicking one the focus stays on it,
  // and ignoring keys there let the arrows scroll the window): digits, arrows etc. belong
  // to the field, Enter leaves it. Letter shortcuts still work - the fields are numeric,
  // and after typing a new certainty the next thing you press is F.
  if (ev.target && ev.target.tagName === 'INPUT' && ev.target.type !== 'checkbox') {
    if (ev.key === 'Enter') { ev.target.blur(); ev.preventDefault(); return; }
    if (ev.ctrlKey || ev.metaKey || !/^[a-zA-Z?]$/.test(ev.key)) { if (ev.key !== 'Escape') return; }
    ev.target.blur();
  }
  if (ev.key === 'Escape' && $('help').classList.contains('open')) { toggleHelp(false); ev.preventDefault(); return; }
  if (ev.key === 'h' || ev.key === 'H' || ev.key === '?') { toggleHelp(); ev.preventDefault(); return; }
  if (!selected) return;
  if ((ev.ctrlKey || ev.metaKey) && (ev.key === 'z' || ev.key === 'Z')) { undo(); ev.preventDefault(); return; }
  if (ev.key === 'r' || ev.key === 'R') { alignRow(); ev.preventDefault(); return; }
  if (ev.key === 's' || ev.key === 'S') { alignCol(); ev.preventDefault(); return; }
  if (ev.key === 'f' || ev.key === 'F') { snapToFrames(); ev.preventDefault(); return; }
  if (ev.key === 'Escape') { clearMarked(); ev.preventDefault(); return; }
  if (ev.key === 'a' || ev.key === 'A') { if (moveAllEl) moveAllEl.checked = !moveAllEl.checked; ev.preventDefault(); return; }
  const i = +selected.dataset.i, r = DATA[i];
  const n = ev.shiftKey ? 5 : 1;
  let dx = 0, dy = 0;
  if (ev.key === 'ArrowLeft') dx = -n;
  else if (ev.key === 'ArrowRight') dx = n;
  else if (ev.key === 'ArrowUp') dy = -n;
  else if (ev.key === 'ArrowDown') dy = n;
  else return;
  if (!ev.repeat) snapshot(); // one undo step per key press, not per auto-repeat
  r.x += dx; r.y += dy;
  { const f = followers(i); if (f === null || f.size) shiftAll(dx, dy, i, f); }
  place(selected, r); updateGuide(); updateMoveInfo(); makeLeader(i); ev.preventDefault();
});

// Lasso: drag on an empty spot to mark every visible box whose centre is inside (Ctrl
// keeps the current marking and adds to it).
const lassoEl = $('lasso');
let lasso = null;
wrap.addEventListener('pointerdown', (ev) => {
  // preventDefault below keeps the browser from moving focus, so a click on the picture
  // would not take it away from a size/grid field - do it here
  if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
  if (ev.target.closest && ev.target.closest('.box')) return;
  const rc = wrap.getBoundingClientRect();
  lasso = { x0: ev.clientX - rc.left, y0: ev.clientY - rc.top, add: ev.ctrlKey || ev.metaKey };
  wrap.setPointerCapture(ev.pointerId);
  Object.assign(lassoEl.style, { display: 'block', left: lasso.x0 + 'px', top: lasso.y0 + 'px', width: '0px', height: '0px' });
  ev.preventDefault();
});
wrap.addEventListener('pointermove', (ev) => {
  if (!lasso) return;
  const rc = wrap.getBoundingClientRect();
  const x = ev.clientX - rc.left, y = ev.clientY - rc.top;
  lasso.x1 = x; lasso.y1 = y;
  Object.assign(lassoEl.style, { left: Math.min(x, lasso.x0) + 'px', top: Math.min(y, lasso.y0) + 'px',
    width: Math.abs(x - lasso.x0) + 'px', height: Math.abs(y - lasso.y0) + 'px' });
});
wrap.addEventListener('pointerup', () => {
  if (!lasso) return;
  lassoEl.style.display = 'none';
  const { x0, y0 } = lasso, x1 = lasso.x1 == null ? x0 : lasso.x1, y1 = lasso.y1 == null ? y0 : lasso.y1;
  const L = Math.min(x0, x1), R = Math.max(x0, x1), T = Math.min(y0, y1), B = Math.max(y0, y1);
  if (!lasso.add) clearMarked();
  if (R - L > 3 || B - T > 3) {
    document.querySelectorAll('.box').forEach((el) => {
      if (el.offsetParent === null) return; // hidden (good slots not shown)
      const r = DATA[+el.dataset.i], cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      if (cx >= L && cx <= R && cy >= T && cy <= B) setMarked(+el.dataset.i, true);
    });
  }
  lasso = null;
});

window.adjustApi.getData().then((d) => { if (d) init(d); });
