'use strict';
// Worker thread: runs the CPU-heavy stash OCR off the main process so the event loop
// (global hotkeys, IPC, window toggle) stays responsive during a capture.
//
// Detection is template-match (tab-detect.js): downsample the calibrated panel box to a
// fixed thumbnail, edge-correlate against a baked template per tab, pick the match. This
// is fill/darkness independent (no per-cell detection) and resolution-robust (the box is
// calibrated + downsampled). Reading then scales the matched tab's static slot positions
// into the live box and OCRs each count. Pricing stays in main (needs network/cache).
const { parentPort } = require('worker_threads');
const DR = require('./digit-reader');
const TD = require('./tab-detect');
const PF = require('./panel-finder');
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
};
// multi-rendering bank: the base exemplars plus one set per baked capture, so a digit
// drawn slightly differently on someone else's machine still has something to match
const RAW_DIGIT_TEMPLATES = require('./digit-templates.json');
const { bank: DIGITS, unmap: UNMAP, sourceOf: SOURCE_OF } = DR.bankFromJSON(RAW_DIGIT_TEMPLATES);
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
function paramsForScale(basedOn, scale) {
  const P = Object.assign({}, basedOn);
  if (Math.abs(scale - 1) > 0.3) { P.preferWideOnTie = true; P.iouThresh = 0.66; }
  return P;
}

// per-tab OCR params: DEFAULTS with any map.readParams override (e.g. Kalguuran runes
// bleed art flush against the count -> tighter stripWidth).
function paramsFor(m) { return m && m.readParams ? Object.assign({}, DR.DEFAULTS, m.readParams) : DR.DEFAULTS; }

parentPort.on('message', (msg) => {
  try {
    const { bitmap, W, H, calBox, learnedTemplates, slotOverrides } = msg;
    const buf = Buffer.from(bitmap);
    const refBox = TAB_TEMPLATES.box;
    // Corrections taught since the last read (see main.js's stash-teach-count) join the
    // bank for just this one read - a fresh Worker per capture means no caching to worry
    // about, so the very next F7 press already benefits from a correction made seconds
    // earlier.
    let DIGITS_LIVE = DIGITS, UNMAP_LIVE = UNMAP, SOURCE_OF_LIVE = SOURCE_OF;
    if (learnedTemplates && learnedTemplates.templates && Object.keys(learnedTemplates.templates).length) {
      const combined = {
        templates: RAW_DIGIT_TEMPLATES.templates,
        variants: (RAW_DIGIT_TEMPLATES.variants || []).concat([{ source: 'user-corrections', templates: learnedTemplates.templates }]),
      };
      const built = DR.bankFromJSON(combined);
      DIGITS_LIVE = built.bank; UNMAP_LIVE = built.unmap; SOURCE_OF_LIVE = built.sourceOf;
    }
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
      const found = PF.findPanel(buf, W, H);
      if (found) {
        const autoBox = PF.frameToContent(found);
        if (!calBox) {
          box = autoBox; boxSource = 'auto';
        } else {
          const autoDet = TD.detect(buf, W, H, autoBox, TAB_TEMPLATES);
          const calDet = TD.detect(buf, W, H, calBox, TAB_TEMPLATES);
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
    const det = TD.detect(buf, W, H, box, TAB_TEMPLATES);
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
    const M = 24; // reference-px margin, so a slot's read strip never sits on the edge
    let V, W2, H2, originX, originY, cellScale = 1;
    // EXTREME_SCALE: past this, the panel is so much bigger than reference (5K/8K
    // displays: a 2.8x+ box) that squashing the WHOLE panel down in one resample throws
    // away far more detail than anything below has ever been measured against. Read
    // each cell straight from the native buffer instead - readCellEx already supports a
    // per-cell scaled crop (shrink just that small window, not the whole panel), it was
    // just never called with a real scale. NOTE: per-cell rescaling was tried and
    // rejected once already, at 1.33x/1.5x (see below) - it shredded digits there. This
    // is a different, much larger regime (untested either way), so it is gated behind
    // its own threshold rather than replacing the 1.15-1.5ish path that IS measured.
    const EXTREME_SCALE = 1.5;
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
    if (scale > EXTREME_SCALE || scale < 1 / EXTREME_SCALE) {
      V = DR.valueChannelDesatMax(buf, W, H); W2 = W; H2 = H;
      originX = 0; originY = 0; cellScale = scale;
    } else if (Math.abs(scale - 1) > 0.15) {
      const kx = box.w / refBox.w, ky = box.h / refBox.h;
      W2 = Math.round(refBox.w + 2 * M); H2 = Math.round(refBox.h + 2 * M);
      const norm = DR.resampleRGBA(buf, W, H, box.x - M * kx, box.y - M * ky, (refBox.w + 2 * M) * kx, (refBox.h + 2 * M) * ky, W2, H2);
      V = DR.valueChannelDesatMax(norm, W2, H2);
      // reference-space slot coords -> normalised-panel coords
      originX = refBox.x - M; originY = refBox.y - M;
    } else {
      V = DR.valueChannelDesatMax(buf, W, H); W2 = W; H2 = H;
      originX = 0; originY = 0;
    }
    // A per-slot saturation/contrast override (see the OCR debug panel) needs the SAME
    // channel built again with different cutoffs - cheap to recompute (one pass, same
    // regime logic as above) and only paid for slots that actually have one pinned.
    // Keyed "sat|contrast"; contrast 0 is the default channel with no gate.
    const vCache = new Map([[DR.DESAT_SAT + '|0', V]]);
    function vFor(sat, contrast) {
      const key = sat + '|' + (contrast || 0);
      if (vCache.has(key)) return vCache.get(key);
      // src: the buffer this regime reads from; px: how many buffer px one reference px
      // is, so the contrast gate's neighbourhood covers the same outline at any scale
      let src = buf, sw = W, sh = H, px = scale;
      if (!(scale > EXTREME_SCALE || scale < 1 / EXTREME_SCALE) && Math.abs(scale - 1) > 0.15) {
        const kx = box.w / refBox.w, ky = box.h / refBox.h;
        src = DR.resampleRGBA(buf, W, H, box.x - M * kx, box.y - M * ky, (refBox.w + 2 * M) * kx, (refBox.h + 2 * M) * ky, W2, H2);
        sw = W2; sh = H2; px = 1;
      }
      let Vx = DR.valueChannelDesatMax(src, sw, sh, sat);
      if (contrast) Vx = DR.contrastGate(Vx, src, sw, sh, contrast, DR.CONTRAST_RADIUS * px);
      vCache.set(key, Vx);
      return Vx;
    }
    const P = paramsForScale(paramsFor(map), scale);
    // per-apiId {cx,cy,stripWidth,up,dn} from the in-app "align" tool (see main.js's
    // stash-adjust-save) - a user's own fix for a slot the shipped map misplaces on their
    // setup. Coordinates are reference-space, same system map.STATIC_SLOTS uses, so they
    // drop straight in ahead of the scale/origin math below.
    const tabOverrides = (slotOverrides && slotOverrides[tab]) || null;
    const reads = []; let readCount = 0;
    for (const s of map.STATIC_SLOTS) {
      const ov = tabOverrides && tabOverrides[s.apiId];
      // != null, not a bare `ov`: a floor/edge/saturation/contrast pin saves an override
      // with NO position, and `ov.cx` would then put the read at NaN
      const sx = ov && ov.cx != null ? ov.cx : s.cx, sy = ov && ov.cy != null ? ov.cy : s.cy;
      const pos = (originX || originY)
        ? { cx: sx - originX, cy: sy - originY }
        : TD.scalePos(sx, sy, refBox, box);
      const Ps = ov && (ov.stripWidth != null || ov.up != null || ov.dn != null || ov.stripLeft != null || ov.stripRight != null)
        ? Object.assign({}, P, {
          stripWidth: ov.stripWidth != null ? ov.stripWidth : P.stripWidth,
          up: ov.up != null ? ov.up : P.up,
          dn: ov.dn != null ? ov.dn : P.dn,
          // asymmetric override: a number is left-anchored and an item's icon sits to
          // its right, so trimming the right edge alone removes that art from the
          // search without shrinking how many digits the left side can still hold
          stripLeft: ov.stripLeft != null ? ov.stripLeft : undefined,
          stripRight: ov.stripRight != null ? ov.stripRight : undefined,
        })
        : P;
      // adaptive: pick the binarisation threshold per cell rather than trusting one
      // global floor, which only ever suited the capture the templates came from - UNLESS
      // a user pinned a floor for this exact slot (see main.js's stash-slot-set-floor,
      // the OCR-debug panel's slider): background art bright enough to pass the same
      // near-white gate as the digits confuses the sweep's own "most confident" pick
      // (a noisier floor can score higher purely by having more ink to be confident
      // about), and no amount of sweeping fixes that - only a floor chosen by eye does.
      const Vs = ov && (ov.desatSat != null || ov.contrast)
        ? vFor(ov.desatSat != null ? ov.desatSat : DR.DESAT_SAT, ov.contrast || 0) : V;
      const r = ov && ov.floor != null
        ? DR.readCellEx(Vs, W2, H2, pos.cx, pos.cy, DIGITS_LIVE, Object.assign({}, Ps, { floor: ov.floor }), cellScale)
        : DR.readCellAdaptive(Vs, W2, H2, pos.cx, pos.cy, DIGITS_LIVE, Ps, cellScale);
      const raw = r.text === '?' ? '?' : UNMAP_LIVE(r.text); // alt keys back to digits
      const conf = r.conf;
      if (raw !== '?') readCount++;
      // pass the measured reliability of this slot through, so the UI can flag the
      // rows our own testing says to distrust rather than showing them all alike
      const rel = (map.SLOT_RELIABILITY && map.SLOT_RELIABILITY[s.apiId]) || null;
      // DEBUG: which template each accepted glyph came from and at what score, so a
      // misread can be inspected instead of guessed at - see stash-debug-live's strips.svg.
      const glyphs = (r.glyphs || []).map((g) => ({
        ch: UNMAP_LIVE(g.ch), source: SOURCE_OF_LIVE(g.ch), score: g.score, gapFilled: g.gapFilled,
      }));
      reads.push({ apiId: s.apiId, count: raw === '?' ? null : parseInt(raw, 10), conf: raw === '?' ? null : conf, rel, glyphs });
    }
    parentPort.postMessage({
      ok: true, tab, score: det.score, readCount, slotCount: map.STATIC_SLOTS.length, reads,
      boxSource, panelCoverage, autoFound, box,
      digitBank: DIGITS_LIVE === DIGITS ? 'merged' : 'merged+learned', scale: +scale.toFixed(3),
      detect: { tab: det.tab, score: det.score, runnerUp: det.runnerUp, runnerScore: det.runnerScore },
    });
  } catch (err) {
    parentPort.postMessage({ ok: false, error: String(err && err.message || err) });
  }
});
