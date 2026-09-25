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
  function buildChannel(buf, W, H, box, refBox, sat, contrast) {
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
    let V = DR.valueChannelDesatMax(src, W2, H2, sat == null ? DR.DESAT_SAT : sat);
    if (contrast) V = DR.contrastGate(V, src, W2, H2, contrast, DR.CONTRAST_RADIUS * px);
    return { V, src, W2, H2, originX, originY, cellScale, px, scale };
  }

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
    if (!ov || (ov.stripWidth == null && ov.up == null && ov.dn == null && ov.stripLeft == null && ov.stripRight == null)) return P;
    return Object.assign({}, P, {
      stripWidth: ov.stripWidth != null ? ov.stripWidth : P.stripWidth,
      up: ov.up != null ? ov.up : P.up,
      dn: ov.dn != null ? ov.dn : P.dn,
      stripLeft: ov.stripLeft != null ? ov.stripLeft : undefined,
      stripRight: ov.stripRight != null ? ov.stripRight : undefined,
    });
  }

  // shipped multi-rendering bank, plus the user's learned corrections as one more variant
  function buildBank(rawTemplates, learned) {
    if (learned && learned.templates && Object.keys(learned.templates).length) {
      return DR.bankFromJSON({
        templates: rawTemplates.templates,
        variants: (rawTemplates.variants || []).concat([{ source: 'user-corrections', templates: learned.templates }]),
      });
    }
    return DR.bankFromJSON(rawTemplates);
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

  return { EXTREME_SCALE, MARGIN, buildChannel, slotPos, slotParams, paramsFor, paramsForScale, buildBank, readSlot };
});
