'use strict';
// learned-audit.js - is a learned digit really the digit it was learned as?
//
// Reported: a count read as "6" at 90 % was really "61" (the thin 1 lost), and the player
// only noticed right before pressing learn. A digit taught under the wrong value stays in
// the pool and pulls later reads towards the same mistake. The referee here is the SHIPPED
// digit set only (base + baked variants, upscaled for high-res sets) - independent of
// anything learned, so a bad exemplar cannot vouch for itself. A glyph is suspicious when
// another digit fits it clearly better than the one it was learned as.
(function (root, factory) {
  const api = factory(require('./digit-reader'), require('./read-pipeline'));
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(this, function (DR, RP) {
  const MARGIN = 0.08;   // another digit this much better ...
  const MIN_OTHER = 0.6; // ... and a real fit on its own
  const referees = new Map(); // matchScale -> { bank, unmap }
  function referee(raw, ms) {
    if (!referees.has(ms)) referees.set(ms, RP.buildBank(raw, null, ms));
    return referees.get(ms);
  }
  // best IoU per digit for one glyph mask ({w,h,data} 0/1), against the referee
  function digitScores(mask, raw, ms) {
    const ref = referee(raw, ms);
    const S = ms > 1 ? ms : 1;
    let maxTh = mask.h;
    for (const k of Object.keys(ref.bank)) maxTh = Math.max(maxTh, ref.bank[k].h);
    const padX = 4 * S, W = mask.w + 2 * padX, H = maxTh + 8 * S;
    const data = new Uint8Array(W * H);
    const y0 = ((H / 2) | 0) - ((mask.h / 2) | 0);
    for (let y = 0; y < mask.h; y++) for (let x = 0; x < mask.w; x++) data[(y0 + y) * W + padX + x] = mask.data[y * mask.w + x] ? 1 : 0;
    const strip = { data, w: W, h: H };
    const out = {};
    for (const k of Object.keys(ref.bank)) {
      const t = ref.bank[k];
      if (t.w > W) continue;
      const hits = DR.slideMatch(strip, t, -3 * S, 3 * S, 0.3);
      let best = 0;
      for (const h of hits) if (h.score > best) best = h.score;
      const d = ref.unmap(k);
      if (!(d in out) || best > out[d]) out[d] = best;
    }
    return out;
  }
  // The glyph's ink box laid onto a template's ink box (area-sampled to its size), IoU,
  // times how well their widths-to-heights agree. digitScores above slides the template
  // over the glyph and scores only the window it covers: a thin "1" template sat inside
  // the left stroke of a 1080p "6" and scored it 0.77 as "1" - more than as "6" - so a
  // 6 filed under 1 passed (reported: 136 read 131 at 100 %). Scale-free, so a glyph
  // grown by the edge rescue or cut at another resolution compares all the same; on the
  // player's 1080p currency tab (69 glyphs) every one scored its own digit highest.
  function inkBox(m) {
    let x0 = m.w, x1 = -1, y0 = m.h, y1 = -1;
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    return x1 < 0 ? null : { x0, y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function shapeScore(g, t) {
    const a = inkBox(g), b = inkBox(t);
    if (!a || !b) return 0;
    let I = 0, U = 0;
    for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
      const gx0 = a.x0 + x * a.w / b.w, gx1 = a.x0 + (x + 1) * a.w / b.w, gy0 = a.y0 + y * a.h / b.h, gy1 = a.y0 + (y + 1) * a.h / b.h;
      let on = 0, n = 0;
      for (let yy = Math.floor(gy0); yy < Math.ceil(gy1); yy++) for (let xx = Math.floor(gx0); xx < Math.ceil(gx1); xx++) { on += g.data[yy * g.w + xx] ? 1 : 0; n++; }
      const G = n && on / n >= 0.5, T = t.data[(b.y0 + y) * t.w + b.x0 + x];
      if (G && T) I++; if (G || T) U++;
    }
    const ar = (a.w / a.h) / (b.w / b.h);
    return (U ? I / U : 0) * Math.min(ar, 1 / ar);
  }
  function shapeScores(mask, raw, ms) {
    const ref = referee(raw, ms);
    const out = {};
    for (const k of Object.keys(ref.bank)) {
      const v = shapeScore(mask, ref.bank[k]), d = ref.unmap(k);
      if (!(d in out) || v > out[d]) out[d] = v;
    }
    return out;
  }
  // { ok, own, other, otherScore } for a glyph said to be `digit`
  function check(mask, digit, raw, ms) {
    const sc = shapeScores(mask, raw, ms);
    const own = sc[digit] || 0;
    let other = null, otherScore = 0;
    for (const [d, v] of Object.entries(sc)) if (d !== digit && v > otherScore) { other = d; otherScore = v; }
    const ok = !(otherScore >= MIN_OTHER && otherScore > own + MARGIN);
    return { ok, own: +own.toFixed(3), other, otherScore: +otherScore.toFixed(3) };
  }
  // every learned exemplar: [{ ms, digit, index, own, other, otherScore }] of the suspicious
  function audit(learned, raw) {
    const sets = [];
    for (const [grow, root] of [[false, learned], [true, learned && learned.grow]]) {
      if (!root) continue;
      sets.push({ ms: 1, set: root, grow });
      for (const k of Object.keys(root.byScale || {})) sets.push({ ms: +k, set: root.byScale[k], grow });
    }
    const bad = [];
    let checked = 0;
    for (const { ms, set, grow } of sets) {
      for (const [digit, list] of Object.entries((set && set.exemplars) || {})) {
        (list || []).forEach((e, index) => {
          checked++;
          const r = check({ w: e.w, h: e.h, data: e.data }, digit, raw, ms);
          if (!r.ok) bad.push({ ms, grow, digit, index, own: r.own, other: r.other, otherScore: r.otherScore });
        });
      }
    }
    return { checked, bad };
  }
  // two glyph masks ({w,h,data} 0/1) laid on each other at the best small shift: the
  // share of their white pixels that agree (the reader's own measure, IoU)
  function maskIoU(a, b, S) {
    const R = 2 * (S || 1);
    let best = 0;
    for (let sy = -R; sy <= R; sy++) for (let sx = -R; sx <= R; sx++) {
      let I = 0, U = 0;
      const x0 = Math.min(0, sx), y0 = Math.min(0, sy), x1 = Math.max(a.w, b.w + sx), y1 = Math.max(a.h, b.h + sy);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const A = x >= 0 && y >= 0 && x < a.w && y < a.h ? a.data[y * a.w + x] : 0;
        const bx = x - sx, by = y - sy;
        const B = bx >= 0 && by >= 0 && bx < b.w && by < b.h ? b.data[by * b.w + bx] : 0;
        if (A && B) I++; if (A || B) U++;
      }
      if (U && I / U > best) best = I / U;
    }
    return best;
  }
  // Pixel cleaning before a glyph goes into the gallery (asked: "Ausreißer-Pixel weg,
  // z. B. bei der 4 und der 1, bevor die Ziffer in die Tafel kommt"). Seen in the
  // player's learned 5K digits: a lone pixel right of the 4's bar ("####....####..#."),
  // one under the 1's flag (".#..###") - the cut's noise, not the font, and every
  // exemplar approved from the gallery carried it into matching. Two steps:
  // - loose pieces: an 8-connected piece under 12 % of the largest goes (any resolution;
  //   every digit of this font is one piece);
  // - bumps: a pixel sitting alone on a flat edge - in no fully inked 2x2 block, and
  //   its inked neighbours are exactly the 3 cells of one side (the edge it sits on).
  //   A stroke's tapering tip (the 1's flag) has 2 of 3 there and stays. Outside the
  //   frame counts as a copy of the frame's edge, so a stroke cut by the frame (the 2's
  //   base row, the 9's tail) is not taken for a bump. Only at high-res (x2) or strokes
  //   4 px and wider: at 1080p the 1's whole flag IS one pixel on a flat edge.
  // First tried: every pixel outside a 2x2 block with <= 3 neighbours. On the player's
  // 117 learned exemplars that cut the 1's flag tip and the frame-cut base rows (10 px
  // off a 2) - the rule above changes only single pixels.
  // Returns the mask unchanged (same object) when nothing was touched.
  function strokeWidth(m) {
    const runs = [];
    for (let y = 0; y < m.h; y++) {
      let r = 0;
      for (let x = 0; x <= m.w; x++) {
        if (x < m.w && m.data[y * m.w + x]) r++;
        else if (r) { runs.push(r); r = 0; }
      }
    }
    if (!runs.length) return 0;
    runs.sort((a, b) => a - b);
    return runs[runs.length >> 1];
  }
  function cleanGlyph(m, S) {
    const { w, h } = m;
    const d = Uint8Array.from(m.data, (v) => (v ? 1 : 0));
    // clamped: outside the frame repeats its edge
    const at = (x, y) => d[Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))];
    let removed = 0;
    // loose pieces
    const lab = new Int32Array(w * h).fill(-1), sizes = [];
    for (let i = 0; i < w * h; i++) {
      if (!d[i] || lab[i] >= 0) continue;
      const id = sizes.length; let n = 0; const st = [i]; lab[i] = id;
      while (st.length) {
        const j = st.pop(); n++;
        const x = j % w, y = (j / w) | 0;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const X = x + dx, Y = y + dy;
          if (X < 0 || Y < 0 || X >= w || Y >= h) continue;
          const k = Y * w + X;
          if (d[k] && lab[k] < 0) { lab[k] = id; st.push(k); }
        }
      }
      sizes.push(n);
    }
    if (sizes.length > 1) {
      const big = Math.max(...sizes);
      for (let i = 0; i < w * h; i++) if (d[i] && sizes[lab[i]] < big * 0.12) { d[i] = 0; removed++; }
    }
    if ((S || 1) >= 2 || strokeWidth({ w, h, data: d }) >= 4) {
      const SIDES = [[[-1, -1], [0, -1], [1, -1]], [[-1, 1], [0, 1], [1, 1]], [[-1, -1], [-1, 0], [-1, 1]], [[1, -1], [1, 0], [1, 1]]];
      for (let pass = 0; pass < 2; pass++) {
        const drop = [];
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
          if (!d[y * w + x]) continue;
          let inBlock = false;
          for (let oy = -1; oy <= 0 && !inBlock; oy++) for (let ox = -1; ox <= 0 && !inBlock; ox++) {
            if (at(x + ox, y + oy) && at(x + ox + 1, y + oy) && at(x + ox, y + oy + 1) && at(x + ox + 1, y + oy + 1)) inBlock = true;
          }
          if (inBlock) continue;
          let nb = 0;
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && at(x + dx, y + dy)) nb++;
          if (nb === 3 && SIDES.some((side) => side.every(([dx, dy]) => at(x + dx, y + dy)))) drop.push(y * w + x);
        }
        if (!drop.length) break;
        for (const i of drop) d[i] = 0;
        removed += drop.length;
      }
    }
    if (!removed) return m;
    // never clean a glyph away: more than a tenth gone means the test misjudged it
    const ink = m.data.reduce((a, v) => a + (v ? 1 : 0), 0);
    if (removed > ink * 0.1) return m;
    return { w, h, data: d, cleaned: removed };
  }
  return { MARGIN, MIN_OTHER, digitScores, shapeScore, shapeScores, check, audit, maskIoU, cleanGlyph, strokeWidth };
});
