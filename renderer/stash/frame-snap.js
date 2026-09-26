'use strict';
// frame-snap.js - place number boxes at the same spot inside their own cell frame as
// "model" boxes that are known to sit right. Shared by the align tool (adjust.js, models
// = boxes the player placed by hand) and the tab tour (main.js, models = boxes whose
// number was read with high confidence). Works on a grey image (one value per pixel),
// so it runs in the browser and in main alike.
//
// How a cell's frame corner is found, and the guards (all measured on real panels -
// see FORK-CHANGES.md, align tool):
//  - a frame line runs the whole cell, a digit's straight stroke only part of it, so a
//    line counts only where it is there along (nearly) all of a ~cell-long run;
//  - the neighbour cell's frame runs ~15 px further out, nearly as strong, so of all
//    clear lines the one whose light/dark pattern is most like the model's wins, ties to
//    the one nearest the predicted spot - a box that already sits right stays put;
//  - a candidate needs half the MODEL's line strength (a gilded ornament three times as
//    strong must not push the real frame line out of the running);
//  - when the boxes' jumps are alike (a whole tab shifted), one jumping clearly
//    differently latched onto something else and is held back ("odd").
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.FrameSnap = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const SEGS = 6;
  const PAT = 6;

  function ncc(a, b) {
    const n = a.length; let ma = 0, mb = 0;
    for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
    ma /= n; mb /= n;
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const u = a[i] - ma, v = b[i] - mb; sab += u * v; saa += u * u; sbb += v * v; }
    return saa > 0 && sbb > 0 ? sab / Math.sqrt(saa * sbb) : 0;
  }

  // gray: Float32Array (W*H), e.g. (r+g+b)/3 per pixel
  function create(gray, W, H) {
    const px = (x, y) => gray[Math.min(H - 1, Math.max(0, y | 0)) * W + Math.min(W - 1, Math.max(0, x | 0))];
    function lineStrength(len, at) {
      const seg = new Array(SEGS).fill(0);
      for (let k = 0; k < len; k++) seg[Math.min(SEGS - 1, Math.floor(k * SEGS / len))] += at(k);
      seg.sort((p, q) => p - q);
      return seg[1] * SEGS;
    }
    const colEdge = (x, y0, len) => lineStrength(len, (k) => Math.abs(px(x + 1, y0 + k) - px(x - 1, y0 + k)));
    const rowEdge = (y, x0, len) => lineStrength(len, (k) => Math.abs(px(x0 + k, y + 1) - px(x0 + k, y - 1)));
    function colPat(x, y0, len) { const o = []; for (let d = -PAT; d <= PAT; d++) { let s = 0; for (let k = 0; k < len; k += 2) s += px(x + d + 1, y0 + k) - px(x + d - 1, y0 + k); o.push(s); } return o; }
    function rowPat(y, x0, len) { const o = []; for (let d = -PAT; d <= PAT; d++) { let s = 0; for (let k = 0; k < len; k += 2) s += px(x0 + k, y + d + 1) - px(x0 + k, y + d - 1); o.push(s); } return o; }

    function findCorner(gx, gy, R, len, like) {
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
    // a model box {x,y,w,h}: its frame corner (up/left of the box), offset and patterns
    function model(box, len) {
      const c = findCorner(box.x - box.h * 0.2, box.y - box.h * 0.2, Math.round(box.h * 0.5), len, null);
      return { ox: box.x - c.x, oy: box.y - c.y, sx: c.sx, sy: c.sy, like: { col: colPat(c.x, c.y, len), row: rowPat(c.y, c.x, len), sx: c.sx, sy: c.sy } };
    }
    // proposals for `targets` (indexes into boxes) from `models` ({x,y,w,h} boxes):
    // [{ i, x, y, dx, dy, need, why: 'x'|'y'|'sim'|'odd', odd? }]
    // need = the certainty this box reaches (lowest of the two line strengths vs the
    // model's and the pattern similarity); below minShare, or "odd", it is not to be moved
    function propose(boxes, modelBoxes, targets, opts) {
      const size = modelBoxes[0];
      const len = Math.round(3 * size.h); // ~ a cell: tells a frame line from a digit stroke
      const R = Math.max(1, Math.round(opts.range));
      const minShare = opts.minShare;
      const models = modelBoxes.map((b) => model(b, len));
      const props = [];
      for (const i of targets) {
        const r = boxes[i];
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
      // plausibility - only boxes that actually jump count (already-right ones say
      // nothing about the shift), and only when those jumps really are alike
      const confident = props.filter((q) => q.need >= minShare && Math.hypot(q.dx, q.dy) >= 0.5);
      const med = (arr) => { const a = arr.slice().sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0; };
      const mdx = med(confident.map((q) => q.dx)), mdy = med(confident.map((q) => q.dy));
      const tol = Math.max(6, size.h * 0.15);
      const spread = med(confident.map((q) => Math.hypot(q.dx - mdx, q.dy - mdy)));
      const uniform = confident.length >= 3 && spread <= tol / 2;
      for (const q of props) {
        if (uniform && q.need >= minShare && Math.hypot(q.dx - mdx, q.dy - mdy) > tol) { q.odd = { mdx, mdy }; q.why = 'odd'; }
      }
      return props;
    }
    // ---- fixed rule: box = cell's INNER frame corner + offset ----
    // No model needed. The inner corner is where the (gold or grey) frame band ends and
    // the dark cell interior begins. Measured on 12 real 5K tabs (FORK-CHANGES.md,
    // "Regel"): along a cell-long run, the 4 px left of that line are the frame (bright),
    // the 7 px right of it are interior (dark) in nearly every row. Other lines around a
    // cell fail that: the frame's outer edge has the frame band to its RIGHT, the left
    // neighbour's inner edge goes dark -> bright, and at its outer edge the gap is only
    // 2-3 px before this cell's frame starts (the "right side dark for 7 px" part fails).
    // Score = frame minus the brightest interior pixel, 30th percentile over the run
    // (digits and icon art only cover part of the run). s = scale against a 5K capture.
    function innerColScore(x, y0, len, s) {
      const B = Math.max(2, Math.round(4 * s)), D = Math.max(3, Math.round(7 * s)); const v = [];
      for (let k = 0; k < len; k++) {
        const y = y0 + k; let l = 0; for (let i = 1; i <= B; i++) l += px(x - i, y); l /= B;
        let r = 0; for (let i = 0; i < D; i++) r = Math.max(r, px(x + i, y)); v.push(l - r);
      }
      v.sort((p, q) => p - q); return v[Math.floor(v.length * 0.3)];
    }
    function innerRowScore(y, x0, len, s) {
      const B = Math.max(2, Math.round(4 * s)), D = Math.max(3, Math.round(7 * s)); const v = [];
      for (let k = 0; k < len; k++) {
        const x = x0 + k; let l = 0; for (let i = 1; i <= B; i++) l += px(x, y - i); l /= B;
        let r = 0; for (let i = 0; i < D; i++) r = Math.max(r, px(x, y + i)); v.push(l - r);
      }
      v.sort((p, q) => p - q); return v[Math.floor(v.length * 0.3)];
    }
    const bestAlong = (c0, R, score) => {
      let best = -1e9, at = c0;
      for (let k = -R; k <= R; k++) {
        const e = score(c0 + k);
        if (e > best + 0.5 || (e > best - 0.5 && Math.abs(k) < Math.abs(at - c0))) { if (e > best) best = e; at = c0 + k; }
      }
      return { at, s: best, edge: Math.abs(at - c0) >= R };
    };
    // guesses: [{x, y}] = where each cell's inner corner is expected (from the tab map /
    // current boxes). Returns [{x, y, sx, sy, dx, dy, ok}] in the same order.
    // First one shift for the whole tab (the median of each cell's best over a wide
    // range - a whole tab sits off by up to ~25 px at 5K), then each cell on its own
    // (tab maps place their centres by digit, so single cells are off by up to ~20 px).
    // ok = both lines clear (score >= minScore) and not found at the edge of the range.
    function innerCorners(guesses, opts) {
      const s = opts && opts.scale > 0 ? opts.scale : 1;
      const len = Math.round(90 * s), m = Math.round(14 * s);
      const RB = Math.round((opts && opts.shiftRange) || 70 * s), R = Math.round((opts && opts.range) || 30 * s);
      const minScore = opts && opts.minScore != null ? opts.minScore : 15;
      const med = (a) => { a = a.slice().sort((p, q) => p - q); return a.length ? a[Math.floor(a.length / 2)] : 0; };
      // median jump of the cells whose line is clear (the rest says nothing)
      const shift = (found, key, old) => {
        const d = found.map((b, i) => ({ b, d: b.at - Math.round(guesses[i][key]) })).filter((o) => o.b.s >= minScore).map((o) => o.d);
        return d.length ? med(d) : old;
      };
      let dx = 0, dy = 0;
      for (let pass = 0; pass < 2 && guesses.length; pass++) {
        dx = shift(guesses.map((g) => bestAlong(Math.round(g.x), RB, (x) => innerColScore(x, Math.round(g.y + dy) + m, len, s))), 'x', dx);
        dy = shift(guesses.map((g) => bestAlong(Math.round(g.y), RB, (y) => innerRowScore(y, Math.round(g.x + dx) + m, len, s))), 'y', dy);
      }
      return guesses.map((g) => {
        const gx = Math.round(g.x + dx), gy = Math.round(g.y + dy);
        let x = gx, y = gy, a = null, b = null;
        for (let pass = 0; pass < 2; pass++) {
          a = bestAlong(gx, R, (xx) => innerColScore(xx, y + m, len, s)); x = a.at;
          b = bestAlong(gy, R, (yy) => innerRowScore(yy, x + m, len, s)); y = b.at;
        }
        return { x, y, sx: a.s, sy: b.s, dx: x - g.x, dy: y - g.y, ok: a.s >= minScore && b.s >= minScore && !a.edge && !b.edge };
      });
    }
    return { findCorner, model, propose, innerCorners };
  }

  // grey from an RGBA/BGRA buffer (channel order does not matter for (r+g+b)/3), for a
  // w*h window starting at (x0, y0) of a W-wide frame
  function grayFromRGBA(buf, W, x0, y0, w, h) {
    const g = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      let p = ((y0 + y) * W + x0) * 4;
      for (let x = 0; x < w; x++, p += 4) g[y * w + x] = (buf[p] + buf[p + 1] + buf[p + 2]) / 3;
    }
    return g;
  }

  return { create, grayFromRGBA, ncc };
});
