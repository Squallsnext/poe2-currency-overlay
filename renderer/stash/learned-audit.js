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
  // { ok, own, other, otherScore } for a glyph said to be `digit`
  function check(mask, digit, raw, ms) {
    const sc = digitScores(mask, raw, ms);
    const own = sc[digit] || 0;
    let other = null, otherScore = 0;
    for (const [d, v] of Object.entries(sc)) if (d !== digit && v > otherScore) { other = d; otherScore = v; }
    const ok = !(otherScore >= MIN_OTHER && otherScore > own + MARGIN);
    return { ok, own: +own.toFixed(3), other, otherScore: +otherScore.toFixed(3) };
  }
  // every learned exemplar: [{ ms, digit, index, own, other, otherScore }] of the suspicious
  function audit(learned, raw) {
    const sets = [{ ms: 1, set: learned }];
    for (const k of Object.keys((learned && learned.byScale) || {})) sets.push({ ms: +k, set: learned.byScale[k] });
    const bad = [];
    let checked = 0;
    for (const { ms, set } of sets) {
      for (const [digit, list] of Object.entries((set && set.exemplars) || {})) {
        (list || []).forEach((e, index) => {
          checked++;
          const r = check({ w: e.w, h: e.h, data: e.data }, digit, raw, ms);
          if (!r.ok) bad.push({ ms, digit, index, own: r.own, other: r.other, otherScore: r.otherScore });
        });
      }
    }
    return { checked, bad };
  }
  return { MARGIN, MIN_OTHER, digitScores, check, audit };
});
