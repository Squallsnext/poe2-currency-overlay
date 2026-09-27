'use strict';
// cell-finder.js - the cells of a stash tab on a capture, without knowing the tab.
// The tab builder numbers them so the player only has to name each one.
//
// Every special stash tab draws its cells as dark squares on a lighter parchment: a small
// cell's interior is 51.5 reference px (the 1080p ritual capture), wide cells 2x1, big
// ones 2x2. Measured on the player's Fragment tab screenshot this found all 20 cells:
// pixels darker than 0.8 x the panel's median brightness, joined into areas; an area
// counts when it is at least 0.6 of a small cell each way and at least 45 % filled
// (owned cells are partly bright from the item art - 62 % filled in that test).
// Brightness is the plain channel mean, so RGBA and BGRA captures behave the same.
const CELL_REF = 51.5;

function findCells(buf, W, H, box, refBox, stride) {
  const ch = stride || 4;
  const x0 = Math.max(0, Math.round(box.x)), y0 = Math.max(0, Math.round(box.y));
  const bw = Math.min(W - x0, Math.round(box.w)), bh = Math.min(H - y0, Math.round(box.h));
  if (bw < 20 || bh < 20) return [];
  const k = bw / refBox.w; // capture px per reference px
  const L = new Uint8Array(bw * bh);
  const hist = new Uint32Array(256);
  for (let y = 0; y < bh; y++) {
    for (let x = 0; x < bw; x++) {
      const i = ((y0 + y) * W + (x0 + x)) * ch;
      const v = ((buf[i] + buf[i + 1] + buf[i + 2]) / 3) | 0;
      L[y * bw + x] = v; hist[v]++;
    }
  }
  let acc = 0, median = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= bw * bh / 2) { median = v; break; } }
  const out = [];
  const stack = new Int32Array(bw * bh);
  const areas = (T, minFill, strict) => {
    const seen = new Uint8Array(bw * bh);
    const minSide = CELL_REF * 0.6 * k, maxSide = CELL_REF * 5 * k;
    const res = [];
    for (let s = 0; s < bw * bh; s++) {
      if (seen[s] || L[s] >= T) continue;
      let sp = 0; stack[sp++] = s; seen[s] = 1;
      let minX = bw, maxX = 0, minY = bh, maxY = 0, n = 0;
      while (sp) {
        const j = stack[--sp]; n++;
        const jx = j % bw, jy = (j / bw) | 0;
        if (jx < minX) minX = jx; if (jx > maxX) maxX = jx; if (jy < minY) minY = jy; if (jy > maxY) maxY = jy;
        if (jx > 0 && !seen[j - 1] && L[j - 1] < T) { seen[j - 1] = 1; stack[sp++] = j - 1; }
        if (jx < bw - 1 && !seen[j + 1] && L[j + 1] < T) { seen[j + 1] = 1; stack[sp++] = j + 1; }
        if (jy > 0 && !seen[j - bw] && L[j - bw] < T) { seen[j - bw] = 1; stack[sp++] = j - bw; }
        if (jy < bh - 1 && !seen[j + bw] && L[j + bw] < T) { seen[j + bw] = 1; stack[sp++] = j + bw; }
      }
      const w = maxX - minX + 1, h = maxY - minY + 1;
      if (w < minSide || h < minSide || w > maxSide || h > maxSide) continue;
      if (n < minFill * w * h) continue;
      // a long thin area is a frame or a shadow, not a cell (cells are 1x1, 2x1, 1x2, 2x2)
      if (w > 2.6 * h || h > 2.6 * w) continue;
      const c = { x: +(refBox.x + minX / k).toFixed(1), y: +(refBox.y + minY / k).toFixed(1), w: +(w / k).toFixed(1), h: +(h / k).toFixed(1) };
      // second pass: only areas of a real cell size (1 or 2 cells each way, +-15 %)
      if (strict && !([1, 2].some((m) => Math.abs(c.w / (CELL_REF * m) - 1) < 0.15) && [1, 2].some((m) => Math.abs(c.h / (CELL_REF * m) - 1) < 0.15))) continue;
      res.push(c);
    }
    return res;
  };
  const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  out.push(...areas(Math.max(6, median * 0.8), 0.45, false));
  // An OWNED cell can be too bright for the first pass - the item art fills it (the
  // Fragment tab's one owned Crisis Fragment was missed). A looser threshold finds it;
  // only true cell sizes that overlap nothing already found are taken from it.
  for (const T of [median * 0.9, median]) {
    for (const c of areas(Math.max(6, T), 0.35, true)) if (!out.some((o) => overlaps(o, c))) out.push(c);
  }
  // reading order: rows top to bottom (cells whose tops are within half a cell share a
  // row), left to right
  out.sort((a, b) => (Math.abs(a.y - b.y) < CELL_REF / 2 ? a.x - b.x : a.y - b.y));
  return out;
}

module.exports = { findCells, CELL_REF };
