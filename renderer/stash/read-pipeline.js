'use strict';
// The ONE path from a captured frame to "what does this slot read", shared by the live
// reader (reader-worker.js), the OCR-debug preview and the teach/learn step (main.js).
//
// These used to be three hand-copied variants that had drifted apart: the preview read
// native pixels where the live reader first normalised the panel to reference size, and
// matched only the shipped templates where the live reader also used the learned ones -
// so the debug panel could say "would read 211" for a slot the live scan read as 261,
// and every slider tweak was judged against a reader that isn't the one being tuned.
// Teaching cut its templates from yet another variant (per-cell rescale, no overrides),
// i.e. from a different image than the one the templates are later matched against.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./digit-reader'), require('./tab-detect'));
  else root.ReadPipeline = factory(root.DigitReader, root.TabDetect);
})(typeof self !== 'undefined' ? self : this, function (DR, TD) {
  // EXTREME_SCALE / near-1 thresholds and the normalisation margin: see the long notes
  // in reader-worker.js for the measurements behind each regime.
  const EXTREME_SCALE = 1.5;
  const NEAR_ONE = 0.15;
  const MARGIN = 24; // reference-px margin, so a slot's read strip never sits on the edge

  // Which pixels the reader works from for this frame. Returns the channel V plus
  // everything needed to place a slot in it:
  //   src       the RGBA/BGRA buffer V was built from (normalised panel or native frame)
  //   W2, H2    its size
  //   originX/Y reference-space origin of a normalised panel (0 = native frame)
  //   cellScale per-cell rescale readCellEx must apply (extreme regime only)
  //   px        buffer px per reference px (for size-dependent filters)
  //   orig      the unadjusted source (raw view), src has brightness/contrast applied
  // `o` = { sat, contrast, bright, gain, satPct } - see channelOpts(); all optional.
  function buildChannel(buf, W, H, box, refBox, o) {
    o = o || {};
    const scale = box.h / refBox.h;
    let src = buf, W2 = W, H2 = H, originX = 0, originY = 0, cellScale = 1, px = scale;
    if (scale > EXTREME_SCALE || scale < 1 / EXTREME_SCALE) {
      cellScale = scale;
    } else if (Math.abs(scale - 1) > NEAR_ONE) {
      const kx = box.w / refBox.w, ky = box.h / refBox.h;
      W2 = Math.round(refBox.w + 2 * MARGIN); H2 = Math.round(refBox.h + 2 * MARGIN);
      src = DR.resampleRGBA(buf, W, H, box.x - MARGIN * kx, box.y - MARGIN * ky, (refBox.w + 2 * MARGIN) * kx, (refBox.h + 2 * MARGIN) * ky, W2, H2);
      originX = refBox.x - MARGIN; originY = refBox.y - MARGIN; px = 1;
    }
    const orig = src;
    src = DR.adjustRGBA(src, W2, H2, o.bright, o.gain, o.satPct);
    let V = DR.valueChannelDesatMax(src, W2, H2, o.sat == null ? DR.DESAT_SAT : o.sat);
    if (o.contrast) V = DR.contrastGate(V, src, W2, H2, o.contrast, DR.CONTRAST_RADIUS * px);
    return { V, src, orig, W2, H2, originX, originY, cellScale, px, scale };
  }

  // The channel options a slot's saved override asks for (defaults where it has none),
  // and a cache key for them - slots that share settings share one channel.
  function channelOpts(ov) {
    return {
      sat: ov && ov.desatSat != null ? ov.desatSat : DR.DESAT_SAT,
      contrast: ov && ov.contrast ? ov.contrast : 0,
      bright: ov && ov.bright ? ov.bright : 0,
      gain: ov && ov.gain != null ? ov.gain : 100,
      satPct: ov && ov.satPct != null ? ov.satPct : 100,
    };
  }
  function channelKey(o) { return [o.sat, o.contrast || 0, o.bright || 0, o.gain == null ? 100 : o.gain, o.satPct == null ? 100 : o.satPct].join('|'); }

  // A slot's centre in channel coordinates. `ov` is the slot's saved override (may be
  // null, and may carry only floor/saturation/contrast with no position).
  function slotPos(ch, slot, ov, refBox, box) {
    const sx = ov && ov.cx != null ? ov.cx : slot.cx, sy = ov && ov.cy != null ? ov.cy : slot.cy;
    return (ch.originX || ch.originY)
      ? { cx: sx - ch.originX, cy: sy - ch.originY }
      : TD.scalePos(sx, sy, refBox, box);
  }

  // see reader-worker.js's note on the EXTREME_SCALE regime for the measurements
  function paramsForScale(basedOn, scale) {
    const P = Object.assign({}, basedOn);
    if (Math.abs(scale - 1) > 0.3) { P.preferWideOnTie = true; P.iouThresh = 0.66; }
    return P;
  }
  function paramsFor(map) { return map && map.readParams ? Object.assign({}, DR.DEFAULTS, map.readParams) : DR.DEFAULTS; }

  // Read params for one slot: tab defaults, scale tweaks, then the slot's own box override.
  function slotParams(map, scale, ov) {
    const P = paramsForScale(paramsFor(map), scale);
    if (ov && ov.minBlob != null) P.minBlob = ov.minBlob;
    if (ov && ov.localThr) P.localThr = ov.localThr;
    if (ov && ov.matchScale > 1) P.matchScale = ov.matchScale;
    if (!ov || (ov.stripWidth == null && ov.up == null && ov.dn == null && ov.stripLeft == null && ov.stripRight == null)) return P;
    return Object.assign({}, P, {
      stripWidth: ov.stripWidth != null ? ov.stripWidth : P.stripWidth,
      up: ov.up != null ? ov.up : P.up,
      dn: ov.dn != null ? ov.dn : P.dn,
      stripLeft: ov.stripLeft != null ? ov.stripLeft : undefined,
      stripRight: ov.stripRight != null ? ov.stripRight : undefined,
    });
  }

  // shipped multi-rendering bank, plus the user's learned corrections as one more variant.
  // matchScale > 1 (high-resolution matching, see effectiveMatchScale): every reference-
  // size template is blown up by that factor to fit the bigger cell, and templates the
  // user taught AT that scale (learned.byScale[ms]) join as-is - those carry the real
  // detail a blown-up 9px template can't.
  function buildBank(rawTemplates, learned, matchScale) {
    const ms = matchScale > 1 ? Math.round(matchScale) : 1;
    const variants = (rawTemplates.variants || []).slice();
    if (learned && learned.templates && Object.keys(learned.templates).length) {
      variants.push({ source: 'user-corrections', templates: learned.templates });
    }
    const scaled = ms > 1 && learned && learned.byScale && learned.byScale[ms] && learned.byScale[ms].templates;
    const scaledSrc = 'user-corrections@x' + ms;
    if (scaled && Object.keys(scaled).length) variants.push({ source: scaledSrc, templates: scaled });
    const built = DR.bankFromJSON({ templates: rawTemplates.templates, variants });
    if (ms > 1) {
      for (const key of Object.keys(built.bank)) {
        if (built.sourceOf(key) !== scaledSrc) built.bank[key] = DR.upscaleTemplate(built.bank[key], ms);
      }
    }
    return built;
  }

  // High-resolution matching only exists where the reader crops the NATIVE frame per
  // cell (the extreme-scale regime, e.g. 5K: cellScale ~2.7) - there it can shrink the
  // cell to 2x reference instead of 1x and keep twice the detail. Elsewhere the frame is
  // already at (or normalised to) reference size, so there is nothing to gain: 1.
  // Capped so the cell is never blown UP past its native pixels.
  function effectiveMatchScale(ch, P) {
    const ms = P.matchScale > 1 ? Math.round(P.matchScale) : 1;
    if (ms === 1 || ch.cellScale <= 1) return 1;
    return Math.max(1, Math.min(ms, Math.floor(ch.cellScale)));
  }

  // P adjusted for the matching scale: everything the reader measures in cell px
  // (vertical search window, speck area) grows with the cell
  function paramsAtScale(P, ms) {
    if (ms === 1) return Object.assign({}, P, { matchScale: 1 });
    return Object.assign({}, P, {
      matchScale: ms,
      dyLo: Math.round((P.dyLo || 0) * ms), dyHi: Math.round((P.dyHi || 0) * ms),
      minBlob: (P.minBlob || 0) * ms * ms,
    });
  }

  // The read itself: a pinned floor reads at exactly that floor, otherwise the adaptive
  // sweep picks one per cell. Returns readCellEx/readCellAdaptive's result plus the floor
  // that was actually used.
  function readSlot(ch, pos, bank, P, floor) {
    if (floor != null) {
      const r = DR.readCellEx(ch.V, ch.W2, ch.H2, pos.cx, pos.cy, bank, Object.assign({}, P, { floor }), ch.cellScale);
      return Object.assign({}, r, { floor });
    }
    const r = DR.readCellAdaptive(ch.V, ch.W2, ch.H2, pos.cx, pos.cy, bank, P, ch.cellScale);
    return Object.assign({}, r, { floor: r.floor != null ? r.floor : P.floor });
  }

  return { EXTREME_SCALE, MARGIN, effectiveMatchScale, paramsAtScale, buildChannel, channelOpts, channelKey, slotPos, slotParams, paramsFor, paramsForScale, buildBank, readSlot };
});
