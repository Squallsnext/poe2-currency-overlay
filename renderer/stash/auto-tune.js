'use strict';
// auto-tune.js - "Automatisch einstellen": find the read filters for a tab by trying them.
//
// Asked for by a player who tuned every unsure count by hand, always the same way:
// saturation up, colour limit down to nothing, contrast up until the item art in the
// middle picture falls apart into specks, the speck filter takes those - and then the
// next "5" in the tab needed the same again, because each had its own settings. This
// does that walk itself, over the counts it KNOWS are right (the player confirmed them,
// or the reader is sure of them already), and looks for ONE setting that makes all their
// pictures clean - so the same digit looks the same in every slot; main.js then learns
// the digits from those clean pictures and checks every known count still reads right.
//
// Search: the player's recipe as the start, then coordinate descent - one slider at a
// time over a handful of stops, keep the best, twice through. A slot scores how clean its
// picture is (see slotScore) and -0.5 when the picture does not show exactly the digits
// of its count. The tab setting is only used if it beats the tab as it is now. Slots
// still weak under it get their own search (their previous settings are a candidate too,
// so a slot tuned by hand keeps its settings unless something beats them).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).autoTune = api;
})(typeof self !== 'undefined' ? self : this, function () {
  // the filter keys a tuned setting sets; floor null = the adaptive floor sweep
  const KEYS = ['satPct', 'desatSat', 'contrast', 'minBlob', 'bright', 'gain', 'floor', 'localThr'];
  // The goal is the player's: a CLEAN black/white picture - every digit whole and on its
  // own, nothing else left - and then learning from it. Scoring by the reader's own
  // confidence (the first version) kept the dirty pictures the digits had been learned
  // from: a clean "20" read "0" at 80 % because only one clean 2 had ever been learned
  // (reported with pictures: auto-tune on the Abyss tab made the Jawbone's picture worse).
  // Fixed as the player sets them ("Sättigung max, Farb-Grenze 5, Helligkeit -20 - dann ist
  // das Bild in der Mitte schon so wie es der Leser herstellt"); searched: specks up to
  // 20 px, contrast, floor, and a little brightness / picture contrast.
  const RECIPE = { satPct: 200, desatSat: 5, bright: -20, gain: 100, contrast: 0, minBlob: 11, floor: null, localThr: 0 };
  const PARAMS = [
    ['minBlob', [5, 8, 11, 15, 20]],
    ['contrast', [0, 25, 50, 75, 100]],
    ['floor', [null, 65, 80, 95, 110, 130]],
    ['bright', [-40, -20, 0]],
    ['gain', [90, 100, 120]],
  ];
  const WRONG = -0.5;
  const MIN_GAIN = 0.03; // a tab setting must beat the tab as it is by this much (mean); a slot's own by twice that
  const WEAK = 0.85; // cleaner than this is fine; below, the slot gets its own search
  // A slot: the picture must show exactly the digits of the known count (a thin 1 at
  // 1080p that a speck filter eats, or a 7 left of a lost 1, fails here - asked for: "eine
  // 1 zu erkennen ist schwer, vor allem bei 1080p") - then the cleaner the better; a read
  // that already gives the right count gets a small bonus, a wrong read none.
  const slotScore = (read, want) => {
    if (!read || read.digits !== String(want).length) return WRONG;
    return 1 - Math.min(1, read.junk || 0) + (read.count === want ? 0.05 : 0);
  };
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
    for (const start of [RECIPE]) {
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
    const base = best;
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
    if (best < base + 2 * MIN_GAIN) return { score: base, settings: null }; // not worth a change
    return { score: best, settings: bestS }; // settings null = keep the slot's previous ones
  }

  // evaluations per tab run, for the progress bar (upper bound)
  const TAB_EVALS = 1 + 1 + 2 * PARAMS.reduce((a, [, s]) => a + s.length - 1, 0);

  return { KEYS, PARAMS, RECIPE, WRONG, WEAK, MIN_GAIN, slotScore, summarize, tuneTab, tuneSlot, TAB_EVALS };
});
