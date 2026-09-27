'use strict';
// Worker thread: runs the CPU-heavy stash OCR off the main process so the event loop
// (global hotkeys, IPC, window toggle) stays responsive during a capture.
//
// Detection is template-match (tab-detect.js): downsample the calibrated panel box to a
// fixed thumbnail, edge-correlate against a baked template per tab, pick the match. This
// is fill/darkness independent (no per-cell detection) and resolution-robust (the box is
// calibrated + downsampled). Reading then scales the matched tab's static slot positions
// into the live box and OCRs each count. Pricing stays in main (needs network/cache).
const { parentPort, Worker } = require('worker_threads');
const DR = require('./digit-reader');
const RP = require('./read-pipeline');
const TD = require('./tab-detect');
const PF = require('./panel-finder');
const SD = require('./slot-defaults');
const UTM = require('./user-tab-maps');
const TAB_TEMPLATES = require('./tab-templates.json'); // { box (reference), tw, th, templates }
const TABS = {
  currency: require('./currency-tab-map'),
  abyss: require('./abyss-tab-map'),
  essence: require('./essence-tab-map'),
  runes: require('./runes-tab-map'),
  'runes-kalguuran': require('./runes-kalguuran-tab-map'),
  ritual: require('./ritual-tab-map'),
  soulcore: require('./soulcore-tab-map'),
  idol: require('./idol-tab-map'),
  'ancient-augment': require('./ancient-augment-tab-map'),
  delirium: require('./delirium-tab-map'),
  breach: require('./breach-tab-map'),
  expedition: require('./expedition-tab-map'),
  fragment: require('./fragment-tab-map'),
};
// the player's own tabs (tab builder, main.js stashUserTabMaps) - sent with every read
function installUserTabs(defs) {
  for (const k of Object.keys(defs || {})) { const m = UTM.build(k, defs[k]); if (m) TABS[k] = m; }
}
// multi-rendering bank: the base exemplars plus one set per baked capture, so a digit
// drawn slightly differently on someone else's machine still has something to match
const RAW_DIGIT_TEMPLATES = require('./digit-templates.json');
const MIN_SCORE = 0.3; // below this the panel isn't a recognized stash tab

// EXTREME_SCALE regime (5K+ displays, see below): tried using ONE scale-tagged variant
// ALONE (no base, no other variants) for this regime first - it scored 25/30 on the
// capture it was baked from, then 4/30 on a second capture of the SAME numbers taken a
// few hours later. A single exemplar per digit, from a single screenshot, is fragile to
// the pixel-level jitter between two otherwise-identical-looking captures - exactly the
// failure the multi-rendering bank's whole design (many sources, not one) exists to
// avoid. Measured fix: keep ALL sources merged (this one's variant just joins the other
// 5, nothing is excluded) and instead only adjust the MATCHING behaviour for this
// regime - preferWideOnTie (see readCellEx) plus a moderately loosened IoU floor, so a
// correct wide template gets proposed as a candidate at all instead of only a thin "1"
// clearing the bar. Measured on both captures together: 22/30 and 22/30 (0.70), 24/30
// and 22/30 (0.66 - kept, best combined score without the wide night/morning gap that
// showed up again below 0.64). Normal-scale captures are completely unaffected.
// (paramsForScale lives in read-pipeline.js now, shared with the debug preview)

// One slot: its saved override (with the "high resolution" switch folded in), the pixel
// channel it is read from, the read, and the record the UI gets. Shared by the single
// reader and the helper threads below, so both read a slot exactly alike.
function readOneSlot(s, c) {
  // the player's own settings for this slot over the ones shipped for this resolution
  const ovSaved = SD.withDefaults(c.tabOverrides && c.tabOverrides[s.apiId], c.scale, c.tab, s.apiId);
  // global "high resolution" switch: matchScale 2 unless the slot chose its own
  const ov = c.hiRes && (!ovSaved || ovSaved.matchScale == null) ? Object.assign({}, ovSaved, { matchScale: 2 }) : ovSaved;
  let ch, pos;
  if (c.perSlot) {
    const cut = RP.cropAroundSlot(c.buf, c.W, c.H, c.box, c.refBox, s, ov);
    ch = RP.buildChannel(cut.buf, cut.W, cut.H, cut.box, c.refBox, RP.channelOpts(ov, c.grow));
    pos = RP.slotPos(ch, s, ov, c.refBox, cut.box);
  } else {
    ch = c.chFor(ov);
    pos = RP.slotPos(ch, s, ov, c.refBox, c.box);
  }
  // adaptive: pick the binarisation threshold per cell rather than trusting one
  // global floor, which only ever suited the capture the templates came from - UNLESS
  // a user saved a floor for this exact slot (see main.js's stash-slot-save-read-settings,
  // the OCR-debug panel's slider): background art bright enough to pass the same
  // near-white gate as the digits confuses the sweep's own "most confident" pick
  // (a noisier floor can score higher purely by having more ink to be confident
  // about), and no amount of sweeping fixes that - only a floor chosen by eye does.
  const Ps = RP.slotParams(c.map, c.scale, ov);
  const ms = RP.effectiveMatchScale(ch, Ps);
  const bk = c.bankFor(ms);
  const Pm = RP.paramsAtScale(Ps, ms);
  if (ch.G) Pm.growV = ch.G; // "save the digit's edge" (DR.cellBinary)
  const r = RP.readSlot(ch, pos, bk.bank, Pm, ov && ov.floor != null ? ov.floor : null);
  const raw = r.text === '?' ? '?' : bk.unmap(r.text); // alt keys back to digits
  // more digits in the picture than read: flagged, so the check asks about it whatever
  // the percentage (a dropped thin 1 still scores 90 % on the digits it did read)
  let short = null, pieces = null;
  if (raw !== '?') {
    const pic = RP.numberInPicture(ch, pos, Pm, r.floor);
    if (pic.digits > raw.length) short = pic.digits;
    // the digit gallery (main.js collectDigits): a sure read whose picture shows exactly
    // its digits hands them over, each with the digit the reader saw
    else if (pic.digits === raw.length && r.conf >= 0.5) pieces = { ms, masks: pic.masks().map((m, i) => Object.assign(m, { d: raw[i] })) }; // main decides (collectDigits)
  }
  // pass the measured reliability of this slot through, so the UI can flag the
  // rows our own testing says to distrust rather than showing them all alike
  const rel = (c.map.SLOT_RELIABILITY && c.map.SLOT_RELIABILITY[s.apiId]) || null;
  // DEBUG: which template each accepted glyph came from and at what score, so a
  // misread can be inspected instead of guessed at - see stash-debug-live's strips.svg.
  const glyphs = (r.glyphs || []).map((g) => ({
    ch: bk.unmap(g.ch), source: bk.sourceOf(g.ch), score: g.score, gapFilled: g.gapFilled,
  }));
  const rec = { apiId: s.apiId, priceAs: s.priceAs || null, suffix: s.suffix || null, count: raw === '?' ? null : parseInt(raw, 10), conf: raw === '?' ? null : r.conf, short, pieces, rel, glyphs };
  if (c.inspect) Object.assign(rec, RP.pictureQuality(ch, pos, Pm, r.floor)); // auto-tune: how clean
  return rec;
}
const makeBankFor = (learnedTemplates, grow, ownOnly) => {
  const cache = new Map();
  return (ms) => {
    if (!cache.has(ms)) cache.set(ms, RP.buildBank(RAW_DIGIT_TEMPLATES, learnedTemplates, ms > 1 ? ms : undefined, grow, ownOnly));
    return cache.get(ms);
  };
};

// Reading slots in parallel. At 5K with high-resolution matching each slot's threshold
// sweep takes 0.3-0.7 s - a currency tab 7 s on one core, while a 1080p scan is done in
// 1-2 s (reported: "why not at 5K"). Slots are independent, so where they are read from
// the native frame (per-slot windows) they are split over a few helper threads reading
// the SAME frame (shared memory, no copy each) with the same code - same results.
const HELPERS = Math.max(1, Math.min(6, (require('os').cpus() || []).length - 2)); // leave the game two cores
function readSlotsParallel(slots, c, msg) {
  const shared = new SharedArrayBuffer(c.buf.length);
  new Uint8Array(shared).set(c.buf);
  const groups = Array.from({ length: HELPERS }, () => []);
  slots.forEach((s, i) => groups[i % HELPERS].push(i)); // interleaved: rows cost alike
  const out = new Array(slots.length);
  return Promise.all(groups.map((idx) => new Promise((resolve, reject) => {
    const w = new Worker(__filename);
    w.once('message', (m) => { w.terminate(); if (m && m.reads) { m.reads.forEach((rec, k) => { out[idx[k]] = rec; }); resolve(); } else reject(new Error((m && m.error) || 'helper failed')); });
    w.once('error', (e) => { w.terminate(); reject(e); });
    w.postMessage({ mode: 'slots', shared, W: c.W, H: c.H, box: c.box, tab: c.tab, idx, learnedTemplates: msg.learnedTemplates, tabOverrides: c.tabOverrides, hiRes: c.hiRes, growDigits: !!c.grow, ownDigitsOnly: !!msg.ownDigitsOnly, userTabMaps: msg.userTabMaps || null });
  }))).then(() => out);
}

// ---- "Automatisch einstellen" (auto-tune.js): read chosen slots of a kept capture with
// candidate filter settings. The same readOneSlot as a scan, so what the search scores is
// what the next scan reads. Native-regime captures spread each try over helper threads
// that stay up for the whole run (a few dozen tries), the normalised regime reads here.
const AT = require('./auto-tune');
let tuneCtx = null;
function makeTuneCtx(m) {
  installUserTabs(m.userTabMaps);
  const map = TABS[m.tab], refBox = TAB_TEMPLATES.box;
  const buf = Buffer.from(m.shared);
  const perSlot = RP.cropAroundSlot(buf, m.W, m.H, m.box, refBox, map.STATIC_SLOTS[0], null).buf !== buf;
  const chCache = new Map();
  const chFor = (ov) => {
    const o = RP.channelOpts(ov, m.growDigits), key = RP.channelKey(o);
    if (!chCache.has(key)) { if (chCache.size > 6) chCache.clear(); chCache.set(key, RP.buildChannel(buf, m.W, m.H, m.box, refBox, o)); }
    return chCache.get(key);
  };
  return { tab: m.tab, buf, W: m.W, H: m.H, box: m.box, refBox, map, scale: m.box.h / refBox.h, hiRes: m.hiRes, grow: !!m.growDigits, base: m.tabOverrides || {}, perSlot, chFor, bankFor: makeBankFor(m.learnedTemplates, m.growDigits, m.ownDigitsOnly) };
}
// S = the filter keys to try on every slot in idxs (null = each slot as saved now)
function tuneRead(ctx, S, idxs) {
  let tabOverrides = ctx.base;
  if (S) {
    tabOverrides = Object.assign({}, ctx.base);
    for (const i of idxs) { const id = ctx.map.STATIC_SLOTS[i].apiId; tabOverrides[id] = Object.assign({}, ctx.base[id], S); }
  }
  const c = Object.assign({}, ctx, { tabOverrides, inspect: true });
  return idxs.map((i) => { const r = readOneSlot(ctx.map.STATIC_SLOTS[i], c); return { count: r.count, conf: r.conf, digits: r.digits, junk: r.junk }; });
}
async function runTune(msg) {
  const shared = new SharedArrayBuffer(msg.bitmap.byteLength);
  new Uint8Array(shared).set(new Uint8Array(msg.bitmap));
  const base = { shared, W: msg.W, H: msg.H, box: msg.box, tab: msg.tab, learnedTemplates: msg.learnedTemplates, hiRes: msg.hiRes, growDigits: !!msg.growDigits, ownDigitsOnly: !!msg.ownDigitsOnly, userTabMaps: msg.userTabMaps || null, tabOverrides: msg.tabOverrides || null };
  const ctx = makeTuneCtx(base);
  let helpers = [];
  if (ctx.perSlot && HELPERS > 1) {
    try {
      helpers = await Promise.all(Array.from({ length: HELPERS }, () => new Promise((resolve, reject) => {
        const w = new Worker(__filename);
        w.once('message', (m) => (m && m.ready ? resolve(w) : reject(new Error('helper failed'))));
        w.once('error', reject);
        w.postMessage(Object.assign({ mode: 'tune-init' }, base));
      })));
    } catch { helpers.forEach((w) => { try { w.terminate(); } catch {} }); helpers = []; }
  }
  let reqId = 0, rr = 0;
  const evaluate = async (S, idxs) => {
    if (!helpers.length) return tuneRead(ctx, S, idxs);
    const groups = helpers.map(() => []);
    // one slot (the per-slot search, several slots at once): the next helper in turn
    if (idxs.length === 1) groups[rr++ % helpers.length].push(0);
    else idxs.forEach((_i, k) => groups[k % helpers.length].push(k));
    const out = new Array(idxs.length);
    await Promise.all(groups.map((g, h) => (!g.length ? null : new Promise((resolve) => {
      const id = ++reqId, w = helpers[h];
      const on = (m) => { if (!m || m.id !== id) return; w.off('message', on); m.reads.forEach((r, j) => { out[g[j]] = r; }); resolve(); };
      w.on('message', on);
      w.postMessage({ mode: 'tune-eval', id, S, idxs: g.map((k) => idxs[k]) });
    }))));
    return out;
  };
  try {
    const truth = msg.truth;
    const t = await AT.tuneTab(truth, evaluate, (done) => parentPort.postMessage({ phase: 'tune', done, total: AT.TAB_EVALS }));
    const perSlot = {}, stillBad = [];
    // only a clear gain changes anything (reported: "96 % -> 96 %" and the Jawbone's
    // picture worse - a picture already clean has nothing to win, only learned digits to lose)
    const useTab = t.after.score > t.before.score + AT.MIN_GAIN;
    const final = truth.map((tr, k) => AT.slotScore((useTab ? t.after : t.before).reads[k], tr.value));
    // weak slots get their own search either way: from the tab setting when it won, and
    // with their own current settings as the one to beat (a hand-tuned tab often reads
    // better slot by slot than any single setting - measured on the player's currency tab)
    {
      const weak = truth.map((tr, k) => ({ tr, k })).filter((x) => final[x.k] < AT.WEAK)
        .sort((a, b) => final[a.k] - final[b.k]).slice(0, 10);
      let n = 0;
      // all weak slots at once: each one's tries go to the helpers in turn
      await Promise.all(weak.map(async ({ tr, k }) => {
        const r = await AT.tuneSlot(tr, t.settings, evaluate);
        // null = keep what it had (only matters when the tab setting is applied)
        if (r.settings !== (useTab ? t.settings : null)) perSlot[tr.apiId] = r.settings;
        final[k] = Math.max(final[k], r.score);
        parentPort.postMessage({ phase: 'tune-slot', done: ++n, total: weak.length });
      }));
    }
    truth.forEach((tr, k) => { if (final[k] < AT.WEAK) stillBad.push(tr.apiId); });
    // The tab setting goes only where it is safe: the known counts, and the other slots
    // that read the SAME count with it as without (just a cleaner picture). Measured on
    // the player's 1080p essence tab: the setting that cleaned all 17 known counts turned
    // other slots' "12" into "2" and "41" into "1" - those keep their own settings.
    const applyTo = [];
    if (useTab) {
      const known = new Set(truth.map((tr) => tr.i));
      const others = ctx.map.STATIC_SLOTS.map((_s, i) => i).filter((i) => !known.has(i));
      const now = others.length ? await evaluate(null, others) : [];
      const withS = others.length ? await evaluate(t.settings, others) : [];
      truth.forEach((tr) => { if (!(tr.apiId in perSlot)) applyTo.push(tr.apiId); });
      others.forEach((i, k) => {
        if (now[k] && withS[k] && now[k].count != null && now[k].count === withS[k].count) applyTo.push(ctx.map.STATIC_SLOTS[i].apiId);
      });
    }
    const right = final.filter((x) => x !== AT.WRONG);
    parentPort.postMessage({
      ok: true, useTab, settings: t.settings, applyTo, perSlot, stillBad,
      before: { right: t.before.right, n: t.before.n, meanConf: t.before.meanConf },
      after: { right: right.length, n: truth.length, meanConf: right.length ? right.reduce((a, b) => a + b, 0) / right.length : 0 },
    });
  } finally {
    helpers.forEach((w) => { try { w.terminate(); } catch {} });
  }
}

parentPort.on('message', (msg) => {
  if (msg && msg.mode === 'tune-init') {
    try { tuneCtx = makeTuneCtx(msg); parentPort.postMessage({ ready: true }); } catch (err) { parentPort.postMessage({ error: String(err && err.message || err) }); }
    return;
  }
  if (msg && msg.mode === 'tune-eval') {
    parentPort.postMessage({ id: msg.id, reads: tuneRead(tuneCtx, msg.S, msg.idxs) });
    return;
  }
  if (msg && msg.mode === 'tune') {
    runTune(msg).catch((err) => parentPort.postMessage({ ok: false, error: String(err && err.message || err) }));
    return;
  }
  if (msg && msg.mode === 'slots') { // a helper thread: read these slots, send them back
    try {
      installUserTabs(msg.userTabMaps);
      const map = TABS[msg.tab], refBox = TAB_TEMPLATES.box;
      const c = { tab: msg.tab, buf: Buffer.from(msg.shared), W: msg.W, H: msg.H, box: msg.box, refBox, map, scale: msg.box.h / refBox.h, hiRes: msg.hiRes, grow: !!msg.growDigits, tabOverrides: msg.tabOverrides, perSlot: true, bankFor: makeBankFor(msg.learnedTemplates, msg.growDigits, msg.ownDigitsOnly) };
      parentPort.postMessage({ reads: msg.idx.map((i) => readOneSlot(map.STATIC_SLOTS[i], c)) });
    } catch (err) { parentPort.postMessage({ error: String(err && err.message || err) }); }
    return;
  }
  readFrame(msg).catch((err) => parentPort.postMessage({ ok: false, error: String(err && err.message || err) }));
});
async function readFrame(msg) {
  try {
    const { bitmap, W, H, calBox, learnedTemplates, slotOverrides, hiRes, userTabSigs } = msg;
    const grow = !!msg.growDigits;
    installUserTabs(msg.userTabMaps);
    // baked fingerprints plus the ones the player taught via "wrong tab?" (main.js
    // stash-correct-tab), as extra keys "tab@u0".. that map back to their tab
    const DETECT = { tw: TAB_TEMPLATES.tw, th: TAB_TEMPLATES.th, templates: Object.assign({}, TAB_TEMPLATES.templates) };
    for (const tab of Object.keys(userTabSigs || {})) {
      (userTabSigs[tab] || []).forEach((sig, i) => { DETECT.templates[tab + '@u' + i] = sig; });
    }
    const baseTab = (t) => (t ? String(t).split('@')[0] : t);
    const detectTab = (box) => {
      const d = TD.detect(buf, W, H, box, DETECT);
      if (!d) return d;
      d.tab = baseTab(d.tab); d.runnerUp = baseTab(d.runnerUp);
      return d;
    };
    const buf = Buffer.from(bitmap);
    const refBox = TAB_TEMPLATES.box;
    // Corrections taught since the last read (see main.js's stash-teach-count) join the
    // bank for just this one read - a fresh Worker per capture means no caching to worry
    // about, so the very next F7 press already benefits from a correction made seconds
    // earlier.
    const ownOnly = !!msg.ownDigitsOnly;
    const liveBank = RP.buildBank(RAW_DIGIT_TEMPLATES, learnedTemplates, undefined, grow, ownOnly);
    // high-resolution slots (matchScale 2, see read-pipeline.js) need the bank at that
    // scale - built once per scale, only if some slot asks for it
    const bankCache = new Map([[1, liveBank]]);
    const bankFor = (ms) => {
      if (!bankCache.has(ms)) bankCache.set(ms, RP.buildBank(RAW_DIGIT_TEMPLATES, learnedTemplates, ms, grow, ownOnly));
      return bankCache.get(ms);
    };
    // Find the panel by its coloured frame, which is what makes calibration optional: the
    // frame is a saturated rectangle on an otherwise brown UI, so it can be located
    // outright rather than asked for.
    //
    // When the user HAS calibrated, both boxes are scored and the better one wins. Auto
    // must not silently override a box someone deliberately set - that turns Calibrate
    // into a button that eats your effort and changes nothing. But a saved box also goes
    // stale the moment the resolution or UI scale changes, and a stale box is exactly what
    // produces silent misreads, so it does not get to win on seniority either. Letting the
    // detector judge is the only version that is honest in both directions.
    let box = calBox || refBox;
    let boxSource = calBox ? 'calibration' : 'reference';
    let panelCoverage = null;
    let autoFound = false;
    try {
      let found = PF.findPanel(buf, W, H);
      // a coloured outline that is not the stash (too small / wrong shape) is no panel
      if (found && !PF.plausible(PF.frameToContent(found), W, H)) found = null;
      if (found) {
        const autoBox = PF.frameToContent(found);
        if (!calBox) {
          box = autoBox; boxSource = 'auto';
        } else {
          const autoDet = detectTab(autoBox);
          const calDet = detectTab(calBox);
          const autoScore = autoDet ? autoDet.score : 0;
          const calScore = calDet ? calDet.score : 0;
          // the saved box keeps the tie: if it is as good, the user's choice stands
          if (autoScore > calScore + 0.02) { box = autoBox; boxSource = 'auto'; }
        }
        panelCoverage = +found.coverage.toFixed(3);
        autoFound = true;
      }
    } catch (e) { /* fall back to whatever calBox gave us */ }

    // 1) which tab? (template correlation, fill/darkness independent)
    const det = detectTab(box);
    if (!det || det.score < MIN_SCORE) {
      parentPort.postMessage({
        ok: true, mismatch: true, autoFound, readCount: 0, slotCount: 0,
        boxSource, panelCoverage, box,
        detect: det ? { tab: det.tab, score: det.score, runnerUp: det.runnerUp, runnerScore: det.runnerScore } : null,
      });
      return;
    }
    const tab = det.tab;
    const map = TABS[tab];
    if (!map) {
      // recognized the tab (e.g. delirium/breach/expedition) but it has no read map yet
      parentPort.postMessage({
        ok: true, mismatch: true, detectedTab: tab, unsupported: true, readCount: 0, slotCount: 0,
        boxSource, panelCoverage, autoFound, box,
        detect: { tab: det.tab, score: det.score, runnerUp: det.runnerUp, runnerScore: det.runnerScore },
      });
      return;
    }
    parentPort.postMessage({ phase: 'detected', tab }); // let the UI pre-create the row

    // 2) read every slot at its reference position.
    // Above (or below) the reference resolution the PANEL is normalised back to
    // reference size ONCE, whole, and then every slot is read at scale 1. Rescaling
    // per cell instead - crop a scaled window, shrink that 40x32 window, threshold it -
    // measurably shredded the digits: on a 1.33x/1.5x panel (i.e. any 1440p or ultrawide
    // setup) multi-digit counts came back as confident nonsense, "1383" read as "8" and
    // "160" as "1", while normalising the whole panel first reads the same pixels
    // correctly. Anything left of the old per-cell path would just re-introduce that.
    const scale = box.h / refBox.h;
    // EXTREME_SCALE: past this, the panel is so much bigger than reference (5K/8K
    // displays: a 2.8x+ box) that squashing the WHOLE panel down in one resample throws
    // away far more detail than anything below has ever been measured against. Read
    // each cell straight from the native buffer instead - readCellEx already supports a
    // per-cell scaled crop (shrink just that small window, not the whole panel), it was
    // just never called with a real scale. NOTE: per-cell rescaling was tried and
    // rejected once already, at 1.33x/1.5x (see below) - it shredded digits there. This
    // is a different, much larger regime (untested either way), so it is gated behind
    // its own threshold rather than replacing the 1.15-1.5ish path that IS measured.
    // Threshold 0.15, not 0.005: measured on ground-truthed captures, the COUNT FONT
    // does not scale with the panel in the near-1 regime - a 1.07x panel (windowed
    // fullscreen, ultrawide, slightly-short game windows: the mass of real setups)
    // carries reference-size digits, and resampling the panel down "back to reference"
    // shrank those digits and cost trailing glyphs (556 read 56, 1084 read 108, at
    // conf 0.8+). Direct reads at scaled POSITIONS score 33/33 and 18/25 where the
    // normalize path scored garbage and 15/25. Beyond 1.15 nothing is measured, so the
    // normalize path stays for that regime rather than trading a known behaviour for
    // an unknown one. Rescaling PER CELL instead of normalizing the whole panel was
    // also tried in that range and rejected - crop a scaled window, shrink that 40x32
    // window, threshold it - measurably shredded the digits: on a 1.33x/1.5x panel
    // (1440p/ultrawide) multi-digit counts came back as confident nonsense, "1383" read
    // as "8" and "160" as "1", while normalising the whole panel first reads the same
    // pixels correctly.
    // (the regime switch itself lives in read-pipeline.js, shared with the debug
    // preview and the teach step so all three see the same pixels)
    // Where slots are read straight from the native frame (5K/4K, and near-1 setups),
    // each slot gets its channel built from a window around it only (RP.cropAroundSlot -
    // the same cut the OCR debug preview reads from, so both see the same pixels).
    // Building it over the whole frame cost ~1.5 s at 5K - and once more for every
    // distinct per-slot filter setting: a currency tab tuned slot by slot took 16-18 s
    // (reported: "1-2 s at 1080p, why not at 5K"). The normalised regime (1.15-1.5x)
    // resamples just the panel once and keeps the shared channel below.
    const perSlot = RP.cropAroundSlot(buf, W, H, box, refBox, map.STATIC_SLOTS[0], null).buf !== buf;
    const ch0 = perSlot ? null : RP.buildChannel(buf, W, H, box, refBox, RP.channelOpts(null, grow));
    // A per-slot override of the channel (saturation/contrast/brightness, see the OCR
    // debug panel) needs it built again - only paid for slots that have one, and shared
    // between slots with identical settings.
    const chCache = new Map([[RP.channelKey(RP.channelOpts(null, grow)), ch0]]);
    function chFor(ov) {
      const o = RP.channelOpts(ov, grow), key = RP.channelKey(o);
      if (!chCache.has(key)) chCache.set(key, RP.buildChannel(buf, W, H, box, refBox, o));
      return chCache.get(key);
    }
    // per-apiId {cx,cy,stripWidth,up,dn} from the in-app "align" tool (see main.js's
    // stash-adjust-save) - a user's own fix for a slot the shipped map misplaces on their
    // setup. Coordinates are reference-space, same system map.STATIC_SLOTS uses, so they
    // drop straight in ahead of the scale/origin math below.
    const tabOverrides = (slotOverrides && slotOverrides[tab]) || null;
    const c = { buf, W, H, box, refBox, map, scale, hiRes, grow, tabOverrides, perSlot, chFor, bankFor, tab };
    let reads = null;
    if (perSlot && HELPERS > 1 && map.STATIC_SLOTS.length >= 12) {
      try { reads = await readSlotsParallel(map.STATIC_SLOTS, c, msg); } catch { reads = null; } // helpers failed: read here
    }
    if (!reads) reads = map.STATIC_SLOTS.map((s) => readOneSlot(s, c));
    const readCount = reads.filter((r) => r.count != null).length;
    parentPort.postMessage({
      ok: true, tab, score: det.score, readCount, slotCount: map.STATIC_SLOTS.length, reads,
      boxSource, panelCoverage, autoFound, box,
      digitBank: liveBank.variantCount > (RAW_DIGIT_TEMPLATES.variants || []).length ? 'merged+learned' : 'merged', scale: +scale.toFixed(3),
      detect: { tab: det.tab, score: det.score, runnerUp: det.runnerUp, runnerScore: det.runnerScore },
    });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: String(err && err.message || err) });
  }
}
