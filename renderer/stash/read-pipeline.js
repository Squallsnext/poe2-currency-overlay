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
    // "save the digit's edge" (DR.cellBinary): the ORIGINAL's light, nearly colourless
    // pixels the grown digit may take - independent of the sliders, so the edge comes from
    // the real picture, not from how hard the filters cut it
    const G = o.grow ? DR.valueChannelDesatMax(orig, W2, H2, o.growSat != null ? o.growSat : GROW_SAT) : null;
    return { V, G, src, orig, W2, H2, originX, originY, cellScale, px, scale };
  }

  // The channel options a slot's saved override asks for (defaults where it has none),
  // and a cache key for them - slots that share settings share one channel.
  const GROW_SAT = 60; // colour spread (max-min of R,G,B) still counted as the digit's white edge
  function channelOpts(ov, grow) {
    return {
      grow: !!grow,
      growSat: grow && ov && ov.growSat != null ? ov.growSat : GROW_SAT,
      sat: ov && ov.desatSat != null ? ov.desatSat : DR.DESAT_SAT,
      contrast: ov && ov.contrast ? ov.contrast : 0,
      bright: ov && ov.bright ? ov.bright : 0,
      gain: ov && ov.gain != null ? ov.gain : 100,
      satPct: ov && ov.satPct != null ? ov.satPct : 100,
    };
  }
  function channelKey(o) { return [o.sat, o.contrast || 0, o.bright || 0, o.gain == null ? 100 : o.gain, o.satPct == null ? 100 : o.satPct, o.grow ? 'g' + o.growSat : 0].join('|'); }

  // For ONE slot (debug preview, teach): cut the frame down to a window around that slot
  // before building the channel. buildChannel filters the whole buffer, which on a native-
  // regime capture (near-1 or 4K/5K) is the entire screen - ~15M pixels at 5K, per slider
  // move. The window is generous (64 reference px each way, the read strip is <=~40) so
  // every neighbourhood filter sees the same pixels it would in the full frame. The
  // normalised regime resamples the whole PANEL and is left alone (already small).
  // Returns { buf, W, H, box } with box shifted into the cut's coordinates.
  function cropAroundSlot(buf, W, H, box, refBox, slot, ov) {
    const scale = box.h / refBox.h;
    const native = scale > EXTREME_SCALE || scale < 1 / EXTREME_SCALE || Math.abs(scale - 1) <= NEAR_ONE;
    if (!native) return { buf, W, H, box };
    const sx = ov && ov.cx != null ? ov.cx : slot.cx, sy = ov && ov.cy != null ? ov.cy : slot.cy;
    const c = TD.scalePos(sx, sy, refBox, box);
    const R = Math.ceil(64 * Math.max(1, scale));
    const x0 = Math.max(0, c.cx - R), y0 = Math.max(0, c.cy - R);
    const x1 = Math.min(W, c.cx + R), y1 = Math.min(H, c.cy + R);
    const w = Math.max(1, x1 - x0), h = Math.max(1, y1 - y0);
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) buf.copy(out, y * w * 4, ((y0 + y) * W + x0) * 4, ((y0 + y) * W + x0 + w) * 4);
    return { buf: out, W: w, H: h, box: { x: box.x - x0, y: box.y - y0, w: box.w, h: box.h } };
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
    if (ov && ov.minBlob != null) P.minBlob = ov.minBlob;
    if (ov && ov.localThr) P.localThr = ov.localThr;
    if (ov && ov.matchScale > 1) P.matchScale = ov.matchScale;
    if (ov && ov.growFloor != null) P.growFloor = ov.growFloor; // "save the edge" (DR.cellBinary)
    if (ov && ov.growDepth != null) P.growDepth = ov.growDepth;
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
  // The player's taught glyphs as up to LEARNED_GROUPS variants per digit instead of ONE:
  // exemplars are grouped by size (a digit from another tab, filter setting or
  // resolution comes out a different size), each group's median-ink exemplar is one
  // template. With a single representative - the median over ALL exemplars - teaching a
  // digit in one tab shifted it and the same digit elsewhere matched worse (reported:
  // currency tuned to > 80 %, then ritual taught, and currency dropped again; abyss
  // added, everything ~70 %). Sets without exemplars keep their single template.
  const LEARNED_GROUPS = 4;
  function learnedVariants(set, source) {
    if (!set) return [];
    const ex = set.exemplars || {};
    if (!Object.keys(ex).some((d) => (ex[d] || []).length)) {
      return set.templates && Object.keys(set.templates).length ? [{ source, templates: set.templates }] : [];
    }
    // the median over all exemplars (the one template this was before) stays in, the
    // size groups come on top - so nothing that matched before can get lost
    const out = set.templates && Object.keys(set.templates).length ? [{ source: source + '#all', templates: set.templates }] : [];
    const base = out.length;
    for (const d of Object.keys(ex)) {
      const groups = new Map();
      for (const g of ex[d] || []) { const k = g.w + 'x' + g.h; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(g); }
      [...groups.values()].sort((a, b) => b.length - a.length).slice(0, LEARNED_GROUPS).forEach((list, i) => {
        const inks = list.map((g, j) => ({ ink: g.data.reduce((a, b) => a + b, 0), j })).sort((a, b) => (a.ink - b.ink) || (a.j - b.j));
        out[base + i] = out[base + i] || { source: source + '#' + i, templates: {} };
        out[base + i].templates[d] = list[inks[Math.floor(inks.length / 2)].j];
      });
    }
    return out.filter(Boolean);
  }
  // grow: the learned digits of the "save the edge" mode, kept apart (learned.grow) - a
  // grown digit is fuller than a hard-cut one, the two sets must not mix
  // ownOnly (setting "only my own digits"): for every digit the player has own templates
  // of at this resolution, the shipped ones of that digit are left out - asked for: "die
  // 2 wird gerade mit was Schlechterem verglichen" (a shipped 2, 70 %). Digits without
  // own templates keep the shipped ones, or they could not be read at all.
  function buildBank(rawTemplates, learnedAll, matchScale, grow, ownOnly) {
    const learned = grow ? (learnedAll && learnedAll.grow) || null : learnedAll;
    const ms = matchScale > 1 ? Math.round(matchScale) : 1;
    const variants = (rawTemplates.variants || []).slice();
    variants.push(...learnedVariants(learned, 'user-corrections'));
    const scaledSrc = 'user-corrections@x' + ms;
    if (ms > 1 && learned && learned.byScale) variants.push(...learnedVariants(learned.byScale[ms], scaledSrc));
    const built = DR.bankFromJSON({ templates: rawTemplates.templates, variants });
    if (ms > 1) {
      for (const key of Object.keys(built.bank)) {
        if (!String(built.sourceOf(key)).startsWith(scaledSrc)) built.bank[key] = DR.upscaleTemplate(built.bank[key], ms);
      }
    }
    if (ownOnly && learned) {
      const set = ms > 1 ? learned.byScale && learned.byScale[ms] : learned;
      const ex = (set && set.exemplars) || {};
      const own = new Set(Object.keys(ex).filter((d) => (ex[d] || []).length));
      const ownSrc = ms > 1 ? scaledSrc : 'user-corrections';
      for (const key of Object.keys(built.bank)) {
        if (own.has(built.unmap(key)) && !String(built.sourceOf(key)).startsWith(ownSrc)) delete built.bank[key];
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

  // The black/white cut a confirmed count is LEARNED from (main.js stash-teach-count).
  // It used to be binarised at the slot's saved floor or else the fixed default (122) -
  // while the live read sweeps its floors (readCellAdaptive) and matches at whichever
  // wins. So ✓ on a read taken at floor 80 learned from a different, often broken, image
  // (reported: "lernt nicht", and after nudging a slider it suddenly did - and a digit
  // learned that way still did not fit the next scan). Now: a floor the player set is
  // used as is; otherwise the live read's own winning floor first, then the other sweep
  // floors nearest to it, until the picture splits into exactly one piece per digit.
  // One piece per digit: plain, else with diagonal neighbours joined (thin strokes at
  // 1080p), else without pieces much shorter than the tallest (a speck or item art).
  function segmentDigits(binarized, ms, want) {
    const dropShort = (list) => { const top = Math.max(0, ...list.map((c) => c.mask.h)); return list.filter((c) => c.mask.h >= top * 0.7); };
    const tries = [DR.components(binarized, ms), DR.components(binarized, ms, true)];
    tries.push(dropShort(tries[0]), dropShort(tries[1]));
    const hit = tries.find((list) => list.length === want);
    const out = (hit || tries[0]).sort((a, b) => a.x - b.x);
    // how many digits the picture really shows: the number's chain of pieces from the
    // left - a piece joins when it sits tight to the one before (<= 4 px gap), is digit-
    // wide (<= 10 px) and digit-tall (0.8-1.25 x the chain's height). Item art next to a
    // short number sits further off or is wider/taller; a digit the reader dropped (the
    // thin 1 of "61", the 3 of "13") sits right against the others. Measured on the
    // captures we hold: every "extra digit" this finds on a sure read is a slot the other
    // resolution's capture reads with that digit.
    out.tall = chainLength(tries[0], ms);
    return out;
  }
  function chainLength(pieces, S) { return chainPieces(pieces, S).length; }
  function chainPieces(pieces, S) { return DR.numberPieces(pieces, S); } // one rule, shared with the edge growing
  function teachCut(ch, pos, P, bank, value, fixedFloor) {
    let floors;
    let liveFloor = null;
    if (fixedFloor != null) floors = [fixedFloor];
    else {
      liveFloor = readSlot(ch, pos, bank, P, null).floor;
      floors = [liveFloor].concat(DR.ADAPTIVE_FLOORS.filter((f) => f !== liveFloor).sort((a, b) => Math.abs(a - liveFloor) - Math.abs(b - liveFloor)));
    }
    let first = null;
    for (const floor of floors) {
      const { binarized } = DR.debugShrunkCell(ch.V, ch.W2, ch.H2, pos.cx, pos.cy, Object.assign({}, P, { floor }), ch.cellScale);
      const comps = segmentDigits(binarized, P.matchScale > 1 ? P.matchScale : 1, value.length);
      const r = { floor, binarized, comps, liveFloor, tried: floors.indexOf(floor) + 1 };
      // the picture the reader uses shows MORE digit-tall pieces than digits typed: do not
      // go looking for a floor where the extra one vanishes - reported: "61" read as "6"
      // at 90 %, and a higher floor that loses the thin 1 would have taught it as a 6
      if (!first && comps.tall > value.length) return Object.assign(r, { more: true });
      if (comps.length === value.length) return r;
      if (!first) first = r;
    }
    return first;
  }

  // digits the picture shows at a read's floor (the chain above) - a read shorter than
  // this likely dropped one (reported: "61" read as "6" at 90 %)
  // How clean the black/white picture is (auto-tune, asked for: "das Bild in der Mitte"
  // must show the number and nothing else): the number's chain of pieces, and the ink
  // left OUTSIDE it relative to the ink of the digits (0 = nothing but the number).
  function pictureQuality(ch, pos, P, floor) {
    const { binarized } = DR.debugShrunkCell(ch.V, ch.W2, ch.H2, pos.cx, pos.cy, Object.assign({}, P, { floor }), ch.cellScale);
    const S = P.matchScale > 1 ? P.matchScale : 1;
    const comps = DR.components(binarized, S);
    const chain = chainPieces(comps, S);
    let all = 0; for (let i = 0; i < binarized.data.length; i++) all += binarized.data[i] ? 1 : 0;
    let own = 0; for (const c of chain) for (let i = 0; i < c.mask.data.length; i++) own += c.mask.data[i] ? 1 : 0;
    return { digits: chain.length, junk: own ? (all - own) / own : 1 };
  }
  // One digit cut for a template: a frame centred on the strip's middle (so the template
  // lines up with dy=0 in the reader's search - see stash-teach-count) but tall enough
  // for the WHOLE digit wherever it sits. It used to be exactly the digit's height,
  // centred - a digit a few px above or below the middle lost its top or bottom
  // (reported with the gallery: "die Rahmen sind zu klein ... die Schriften wandern
  // in px hoch und runter"). Only the digit's own pixels go in, no art beside it.
  function glyphFrame(c, Hd) {
    const mid = Hd >> 1;
    const half = Math.max(mid - c.y, c.y + c.mask.h - mid, (c.mask.h + 1) >> 1);
    const top = mid - half, h = 2 * half, w = c.mask.w;
    const data = new Uint8Array(w * h);
    for (let y = 0; y < c.mask.h; y++) {
      const ty = c.y - top + y; if (ty < 0 || ty >= h) continue;
      for (let x = 0; x < w; x++) data[ty * w + x] = c.mask.data[y * w + x];
    }
    return { w, h, data };
  }
  function digitsInPicture(ch, pos, P, floor) { return numberInPicture(ch, pos, P, floor).digits; }
  // The number's digits as the picture shows them (for the digit gallery): each piece cut
  // the way teaching cuts it - full strip height, centred on the strip's middle, so it
  // lines up with dy=0 in the reader's search (see stash-teach-count).
  function numberInPicture(ch, pos, P, floor) {
    const { binarized } = DR.debugShrunkCell(ch.V, ch.W2, ch.H2, pos.cx, pos.cy, Object.assign({}, P, { floor }), ch.cellScale);
    const S = P.matchScale > 1 ? P.matchScale : 1;
    const pieces = chainPieces(DR.components(binarized, S), S);
    const Hd = binarized.h;
    const masks = () => pieces.map((c) => glyphFrame(c, Hd));
    return { digits: pieces.length, masks };
  }

  return { EXTREME_SCALE, MARGIN, GROW_SAT, glyphFrame, teachCut, segmentDigits, digitsInPicture, numberInPicture, pictureQuality, cropAroundSlot, effectiveMatchScale, paramsAtScale, buildChannel, channelOpts, channelKey, slotPos, slotParams, paramsFor, paramsForScale, buildBank, readSlot };
});
