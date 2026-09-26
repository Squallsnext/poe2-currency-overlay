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
  return { fit, fromCapture, REF };
});
