'use strict';
// auto-tune.js - "Automatisch einstellen": find the read filters for a tab by trying them.
//
// Asked for by a player who tuned every unsure count by hand, always the same way:
// saturation up, colour limit down to nothing, contrast up until the item art in the
// middle picture falls apart into specks, the speck filter takes those - and then the
// next "5" in the tab needed the same again, because each had its own settings. This
// does that walk itself, over the counts it KNOWS are right (the player confirmed them,
// or the reader is sure of them already), and looks for ONE setting that reads them all
// right and as sure as possible - so the same digit looks the same in every slot.
//
// Search: a few starting points (the player's recipe, the reader's defaults), then
// coordinate descent - one slider at a time over a handful of stops, keep the best,
// twice through. A slot's score is its confidence when the read is right and -0.5 when
// it is wrong or unread (a wrong number must never pay for a higher percentage
// elsewhere). The tab setting is only used if it beats the tab as it reads now.
// Slots still weak under it get their own search (their previous settings are a
// candidate too, so a slot tuned by hand keeps its settings unless something beats them).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).autoTune = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // the filter keys a tuned setting sets; floor null = the adaptive floor sweep
  const KEYS = ['satPct', 'desatSat', 'contrast', 'minBlob', 'bright', 'gain', 'floor', 'localThr'];
  // stops per slider: the player's usual moves first in line (saturation, colour limit,
  // contrast, specks), then brightness, picture contrast and the floor
  const PARAMS = [
    ['satPct', [100, 150, 200]],
    ['desatSat', [5, 20, 40]],
    ['contrast', [0, 50, 75, 100, 125]],
    ['minBlob', [5, 8, 11, 15]],
    ['bright', [-40, -20, 0, 20]],
    ['gain', [90, 100, 120, 140]],
    ['floor', [null, 70, 90, 110, 130]],
  ];
  // the player's recipe (sat 200 %, colour limit 5, contrast 75, specks under 11 px)
  const RECIPE = { satPct: 200, desatSat: 5, contrast: 75, minBlob: 11, bright: 0, gain: 100, floor: null, localThr: 0 };
  // the reader's own defaults (digit-reader.js DEFAULTS / DESAT_SAT)
  const PLAIN = { satPct: 100, desatSat: 40, contrast: 0, minBlob: 5, bright: 0, gain: 100, floor: null, localThr: 0 };
  const WRONG = -0.5;
  const WEAK = 0.88; // a slot under this after the tab setting gets its own search

  const slotScore = (read, want) => (read && read.count === want ? (read.conf || 0) : WRONG);
  // truth: [{ i, apiId, value }]; reads: same order
  function summarize(truth, reads) {
    let sum = 0, right = 0, confSum = 0;
    truth.forEach((t, k) => {
      const s = slotScore(reads[k], t.value);
      sum += s;
      if (s !== WRONG) { right++; confSum += s; }
    });
    return { score: truth.length ? sum / truth.length : 0, right, n: truth.length, meanConf: right ? confSum / right : 0 };
  }

  // evaluate(settings | null, idxs) -> Promise<reads[]> (null = each slot as saved now)
  async function tuneTab(truth, evaluate, onProgress) {
    let done = 0;
    const tick = () => { done++; if (onProgress) onProgress(done); };
    const all = truth.map((t) => t.i);
    const cache = new Map();
    const evalS = async (S) => {
      const key = JSON.stringify(S);
      if (cache.has(key)) return cache.get(key);
      const reads = await evaluate(S, all);
      tick();
      const r = Object.assign(summarize(truth, reads), { reads });
      cache.set(key, r);
      return r;
    };
    const beforeReads = await evaluate(null, all);
    const before = Object.assign(summarize(truth, beforeReads), { reads: beforeReads });
    tick();
    let best = null, bestS = null;
    for (const start of [RECIPE, PLAIN]) {
      const r = await evalS(start);
      if (!best || r.score > best.score) { best = r; bestS = Object.assign({}, start); }
    }
    for (let pass = 0; pass < 2; pass++) {
      let moved = false;
      for (const [key, stops] of PARAMS) {
        for (const v of stops) {
          if (bestS[key] === v) continue;
          const S = Object.assign({}, bestS, { [key]: v });
          const r = await evalS(S);
          if (r.score > best.score + 1e-4) { best = r; bestS = S; moved = true; }
        }
      }
      if (!moved) break;
    }
    return { before, after: best, settings: bestS };
  }

  // one slot: its previous settings (null) and a descent from the tab setting
  async function tuneSlot(t, tabS, evaluate) {
    const one = async (S) => slotScore((await evaluate(S, [t.i]))[0], t.value);
    let bestS = null, best = await one(null); // as saved before
    const fromTab = await one(tabS);
    if (fromTab > best) { best = fromTab; bestS = tabS; }
    let cur = Object.assign({}, tabS), curScore = fromTab;
    for (const [key, stops] of PARAMS) {
      for (const v of stops) {
        if (cur[key] === v) continue;
        const S = Object.assign({}, cur, { [key]: v });
        const s = await one(S);
        if (s > curScore + 1e-4) { cur = S; curScore = s; }
      }
    }
    if (curScore > best) { best = curScore; bestS = cur; }
    return { score: best, settings: bestS }; // settings null = keep the slot's previous ones
  }

  // evaluations per tab run, for the progress bar (upper bound)
  const TAB_EVALS = 1 + 2 + 2 * PARAMS.reduce((a, [, s]) => a + s.length - 1, 0);

  return { KEYS, PARAMS, RECIPE, PLAIN, WRONG, WEAK, slotScore, summarize, tuneTab, tuneSlot, TAB_EVALS };
});
