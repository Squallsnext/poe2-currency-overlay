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
  return { MARGIN, MIN_OTHER, digitScores, shapeScore, shapeScores, check, audit, maskIoU };
});
