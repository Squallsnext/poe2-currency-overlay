'use strict';
// cell-calibrate.js - find the stash panel box from the currency tab's cells.
// Given a rough box (dragged by hand, or found) and the grey capture, every cell's inner
// frame corner is looked for (frame-snap.js innerCorners) and one scale + position is
// fitted to them (least squares, one scale for x and y - the panel is not stretched).
// Near cells first, then farther ones: a rough box off by a few % in size is off by that
// much times the distance at the far cells, more than a cell's search range - so the
// scale is learned from the near cells before the far ones are looked for.
// Returns { box: {x,y,w,h} (content box, capture px), cells, rms } or { error }.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./frame-snap.js'), require('./currency-cells.js'));
  else root.CellCalibrate = factory(root.FrameSnap, root.Stash.currencyCells);
})(typeof self !== 'undefined' ? self : this, function (FrameSnap, Cells) {
  const REF = { x: 18, y: 168, w: 582, h: 606 };
  const K5 = 2.849; // capture px per reference px at 5120x2880 - innerCorners' scale 1

  // gray: Float32Array of a window (ox, oy, gw, gh) of the capture
  function fit(gray, ox, oy, gw, gh, rough) {
    const snap = FrameSnap.create(gray, gw, gh);
    const C = Cells.CORNERS;
    let a = rough.w / REF.w, bx = rough.x, by = rough.y; // capture = a * (ref - REF.xy) + b
    const P = C[0];
    const dist = (c) => Math.hypot(c.x - P.x, c.y - P.y);
    const stages = [
      { upTo: 170, shift: 25, range: 8, fitScale: false },
      { upTo: 330, shift: 6, range: 10, fitScale: true },
      { upTo: 1e9, shift: 6, range: 10, fitScale: true },
      { upTo: 1e9, shift: 3, range: 6, fitScale: true },
    ];
    let used = [];
    for (const st of stages) {
      const cells = C.filter((c) => dist(c) <= st.upTo);
      const guesses = cells.map((c) => ({ x: a * (c.x - REF.x) + bx - ox, y: a * (c.y - REF.y) + by - oy }));
      const found = snap.innerCorners(guesses, { scale: a / K5, shiftRange: st.shift * a, range: st.range * a });
      let pts = found.map((f, i) => ({ X: cells[i].x - REF.x, Y: cells[i].y - REF.y, x: f.x + ox, y: f.y + oy, ok: f.ok })).filter((q) => q.ok);
      if (pts.length < (st.fitScale ? 8 : 4)) return { error: 'few-cells', cells: pts.length };
      for (let round = 0; round < 3; round++) {
        if (st.fitScale) {
          const n = pts.length;
          const Xm = pts.reduce((s, q) => s + q.X, 0) / n, Ym = pts.reduce((s, q) => s + q.Y, 0) / n;
          const xm = pts.reduce((s, q) => s + q.x, 0) / n, ym = pts.reduce((s, q) => s + q.y, 0) / n;
          let num = 0, den = 0;
          for (const q of pts) { num += (q.X - Xm) * (q.x - xm) + (q.Y - Ym) * (q.y - ym); den += (q.X - Xm) ** 2 + (q.Y - Ym) ** 2; }
          if (den > 0) a = num / den;
          bx = xm - a * Xm; by = ym - a * Ym;
        } else {
          const med = (v) => { v = v.slice().sort((p, q) => p - q); return v[Math.floor(v.length / 2)]; };
          bx = med(pts.map((q) => q.x - a * q.X)); by = med(pts.map((q) => q.y - a * q.Y));
        }
        // drop what latched onto something else (> 2 reference px off), fit again
        const keep = pts.filter((q) => Math.hypot(a * q.X + bx - q.x, a * q.Y + by - q.y) <= 2 * a);
        if (keep.length === pts.length || keep.length < 4) break;
        pts = keep;
      }
      used = pts;
    }
    const rms = Math.sqrt(used.reduce((s, q) => s + (a * q.X + bx - q.x) ** 2 + (a * q.Y + by - q.y) ** 2, 0) / used.length) / a;
    // a grid-like tab (runes, essences) lets ~15 of the 38 corners "fit" - the currency tab finds nearly all
    if (used.length < Math.ceil(0.6 * C.length)) return { error: 'few-cells', cells: used.length };
    return { box: { x: Math.round(bx), y: Math.round(by), w: Math.round(a * REF.w), h: Math.round(a * REF.h) }, cells: used.length, of: C.length, rms: +rms.toFixed(2), scale: +a.toFixed(4) };
  }

  // buf: BGRA/RGBA capture W x H; rough: content box in capture px
  function fromCapture(buf, W, H, rough) {
    const m = 0.15;
    const ox = Math.max(0, Math.floor(rough.x - rough.w * m)), oy = Math.max(0, Math.floor(rough.y - rough.h * m));
    const gw = Math.min(W - ox, Math.ceil(rough.w * (1 + 2 * m))), gh = Math.min(H - oy, Math.ceil(rough.h * (1 + 2 * m)));
    if (!(gw > 50 && gh > 50)) return { error: 'no-box' };
    return fit(FrameSnap.grayFromRGBA(buf, W, ox, oy, gw, gh), ox, oy, gw, gh, rough);
  }
  // ---- finding the currency tab anywhere on the screen (no box given) ----
  // Quick tries first (hints: the last calibration, the panel found by its coloured border):
  // where the stash has not moved that is all it takes. Otherwise the whole capture,
  // shrunk to 1080 px high (the reference height - there a panel at UI scale u is u
  // reference px per px): every inner-corner-like spot is found once (bright frame left of
  // / above it, dark right of / below it along a short run - means via running sums, so
  // one pass), and for each UI scale every such spot "votes" for where the panel would be
  // if it were one of the 38 currency corners. Only the currency tab gets many votes at
  // one place; each candidate is then checked by fromCapture (>= 60 % of the corners at
  // their exact spot), which is what decides - the vote only proposes.
  function shrinkGray(buf, W, H, q) {
    const w = Math.max(1, Math.round(W * q)), h = Math.max(1, Math.round(H * q));
    const g = new Float32Array(w * h), inv = 1 / q;
    for (let y = 0; y < h; y++) {
      const y0 = Math.floor(y * inv), y1 = Math.max(y0 + 1, Math.min(H, Math.floor((y + 1) * inv)));
      for (let x = 0; x < w; x++) {
        const x0 = Math.floor(x * inv), x1 = Math.max(x0 + 1, Math.min(W, Math.floor((x + 1) * inv)));
        let s = 0, n = 0;
        for (let yy = y0; yy < y1; yy++) { let p = (yy * W + x0) * 4; for (let xx = x0; xx < x1; xx++, p += 4) { s += buf[p] + buf[p + 1] + buf[p + 2]; n++; } }
        g[y * w + x] = s / (3 * n);
      }
    }
    return { g, w, h };
  }
  function cornerSpots(g, w, h) {
    // per pixel: frame (2 px before) minus the brightest of the 3 px after, both ways
    const col = new Float32Array(w * h), row = new Float32Array(w * h);
    for (let y = 2; y < h - 3; y++) for (let x = 2; x < w - 3; x++) {
      const i = y * w + x;
      col[i] = (g[i - 1] + g[i - 2]) / 2 - Math.max(g[i], g[i + 1], g[i + 2]);
      row[i] = (g[i - w] + g[i - 2 * w]) / 2 - Math.max(g[i], g[i + w], g[i + 2 * w]);
    }
    // running sums: down each column (for vertical lines), along each row (horizontal)
    const cc = new Float32Array(w * (h + 1)), rc = new Float32Array((w + 1) * h);
    for (let x = 0; x < w; x++) for (let y = 0; y < h; y++) cc[(y + 1) * w + x] = cc[y * w + x] + col[y * w + x];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) rc[y * (w + 1) + x + 1] = rc[y * (w + 1) + x] + row[y * w + x];
    const len = 28, m = 4;
    const S = new Float32Array(w * h);
    for (let y = 2; y < h - len - m - 1; y++) for (let x = 2; x < w - len - m - 1; x++) {
      const v = (cc[(y + m + len) * w + x] - cc[(y + m) * w + x]) / len;
      const r = (rc[y * (w + 1) + x + m + len] - rc[y * (w + 1) + x + m]) / len;
      S[y * w + x] = Math.min(v, r);
    }
    const spots = [];
    for (let y = 3; y < h - 3; y++) for (let x = 3; x < w - 3; x++) {
      const v = S[y * w + x]; if (v < 12) continue;
      let peak = true;
      for (let dy = -2; dy <= 2 && peak; dy++) for (let dx = -2; dx <= 2; dx++) if ((dx || dy) && S[(y + dy) * w + x + dx] > v) { peak = false; break; }
      if (peak) spots.push({ x, y, v });
    }
    spots.sort((p, q) => q.v - p.v);
    return spots.slice(0, 2500);
  }
  function search(buf, W, H, hints) {
    const t0 = Date.now();
    for (const hb of hints || []) {
      if (!hb || !(hb.w > 50) || !(hb.h > 50)) continue;
      const r = fromCapture(buf, W, H, hb);
      if (r.box) return Object.assign(r, { via: 'hint', ms: Date.now() - t0 });
    }
    const q = H > 1080 ? 1080 / H : 1;
    const { g, w, h } = shrinkGray(buf, W, H, q);
    const spots = cornerSpots(g, w, h);
    const C = Cells.CORNERS, BIN = 6;
    const cands = [];
    for (let u = 0.6; u <= 1.5; u += 0.03) {
      const votes = new Map();
      for (const d of spots) for (const c of C) {
        const ox = d.x - u * (c.x - REF.x), oy = d.y - u * (c.y - REF.y);
        if (ox < -50 || oy < -50) continue;
        const k = Math.round(ox / BIN) * 100000 + Math.round(oy / BIN);
        votes.set(k, (votes.get(k) || 0) + 1);
      }
      // a spot sits between two bins as often as in one: count each bin with its 8
      // neighbours (a scale step off, the far corners also spread over a few bins)
      for (const [k] of votes) {
        const bx = Math.floor(k / 100000), by = k % 100000;
        let n = 0;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) n += votes.get((bx + dx) * 100000 + by + dy) || 0;
        if (n >= 14) cands.push({ n, u, ox: bx * BIN, oy: by * BIN });
      }
    }
    cands.sort((p, q2) => q2.n - p.n);
    const tried = [];
    for (const c of cands) {
      if (tried.length >= 12 || c.n < 0.5 * cands[0].n) break; // far fewer votes than the best: not it
      if (tried.some((t) => Math.abs(t.ox - c.ox) < 20 && Math.abs(t.oy - c.oy) < 20 && Math.abs(t.u - c.u) < 0.07)) continue;
      tried.push(c);
      const rough = { x: c.ox / q, y: c.oy / q, w: REF.w * c.u / q, h: REF.h * c.u / q };
      const r = fromCapture(buf, W, H, rough);
      if (r.box) return Object.assign(r, { via: 'search', votes: c.n, ms: Date.now() - t0 });
    }
    return { error: 'not-found', spots: spots.length, tried: tried.length, ms: Date.now() - t0 };
  }

  return { fit, fromCapture, search, REF };
});
