'use strict';
// Static slot -> currency map for the PoE2 Currency stash tab.
// The tab is fixed-layout: every slot always holds the same currency for every
// player (empty if you own 0). So identity is by POSITION, not pixels.
// Coords are the stack-count number center (cx,cy) at 1920x1032 native capture
// — the same anchor the digit reader uses. Verified against a live tab
// (POE2-VibeTools, Runes of Aldur, 2026-07-25).
//
// The 2 BOTTOM 7-wide rows are DYNAMIC (arbitrary contents) — not here; they
// need icon identification and are handled separately.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).currencyTabMap = api;
})(typeof self !== 'undefined' ? self : this, function () {

  // { cx, cy, apiId }  — apiId matches the poe2scout catalog slug.
  // Re-calibrated 2026-09-25 (second pass, after the in-game UI text size was increased)
  // from a live capture via the stash-debug-live adjust tool. Box size back to
  // digit-reader.js's DEFAULTS (stripWidth 17, up/dn 12) - this pass measured the same
  // size as the shared default, no per-tab override needed.
  const STATIC_SLOTS = [
    // top row — Transmutation (base/greater/perfect), Alchemy, Vaal, Annul, Jeweller's (lesser/greater/perfect)
    { cx: 55.62, cy: 211.11, apiId: 'transmute' },
    { cx: 112.57, cy: 210.05, apiId: 'greater-orb-of-transmutation' },
    { cx: 169.27, cy: 210.41, apiId: 'perfect-orb-of-transmutation' },
    { cx: 244.92, cy: 211.16, apiId: 'alch' },
    { cx: 308.73, cy: 211.11, apiId: 'vaal' },
    { cx: 371.69, cy: 211.11, apiId: 'annul' },
    { cx: 448.18, cy: 211.11, apiId: 'lesser-jewellers-orb' },
    { cx: 505.54, cy: 210.41, apiId: 'greater-jewellers-orb' },
    { cx: 560.54, cy: 210.46, apiId: 'perfect-jewellers-orb' },
    // 2nd row — Augmentation (b/g/p), Chance, Fracturing, Divine, Artificer's Orb
    { cx: 55.43, cy: 273.81, apiId: 'aug' },
    { cx: 111.56, cy: 274.16, apiId: 'greater-orb-of-augmentation' },
    { cx: 169.08, cy: 273.41, apiId: 'perfect-orb-of-augmentation' },
    { cx: 245.27, cy: 273.76, apiId: 'chance' },
    { cx: 308.43, cy: 273.41, apiId: 'fracturing-orb' },
    { cx: 370.81, cy: 273.11, apiId: 'divine' },
    { cx: 562.08, cy: 273.81, apiId: 'artificers' },
    // 3rd row — Regal (b/g/p). Mirror + Hinekora's Lock slots sit here too but were
    // empty in the reference tab; their coords are TODO (add on next capture that has them).
    { cx: 55.92, cy: 337.51, apiId: 'regal' },
    { cx: 112.78, cy: 336.81, apiId: 'greater-regal-orb' },
    { cx: 168.83, cy: 336.81, apiId: 'perfect-regal-orb' },
    // offset row — Arcanist's Etcher, Armourer's Scrap, Blacksmith's Whetstone
    { cx: 434.97, cy: 356.46, apiId: 'etcher' },
    { cx: 498.72, cy: 356.17, apiId: 'scrap' },
    { cx: 560.97, cy: 355.76, apiId: 'whetstone' },
    // 4th row — Exalted (b/g/p)
    { cx: 55.41, cy: 400.52, apiId: 'exalted' },
    { cx: 112.32, cy: 400.87, apiId: 'greater-exalted-orb' },
    { cx: 168.97, cy: 400.17, apiId: 'perfect-exalted-orb' },
    // offset row — Glassblower's Bauble, Gemcutter's Prism
    { cx: 497.78, cy: 419.51, apiId: 'bauble' },
    { cx: 561.62, cy: 419.86, apiId: 'gcp' },
    // 5th row — Chaos (b/g/p)
    { cx: 55.81, cy: 463.51, apiId: 'chaos' },
    { cx: 113.3, cy: 462.75, apiId: 'greater-chaos-orb' },
    { cx: 170.34, cy: 462.45, apiId: 'perfect-chaos-orb' },
    // offset row — Scroll of Wisdom
    { cx: 562.48, cy: 501.87, apiId: 'wisdom' },
    // shard row — Transmutation / Regal / Chance / Artificer's shards
    { cx: 213.69, cy: 583.1, apiId: 'transmutation-shard' },
    { cx: 276.99, cy: 582.81, apiId: 'regal-shard' },
    { cx: 339.94, cy: 582.76, apiId: 'chance-shard' },
    { cx: 403.34, cy: 582.76, apiId: 'artificers-shard' },
  ];

  // Known static slots that were empty in the reference tab (coords TBD via a
  // future capture that has them filled). Listed so we don't forget they exist.
  const EMPTY_STATIC_TODO = ['mirror', 'hinekoras-lock'];

  // The 2 dynamic bottom rows: contents are arbitrary -> icon match required.
  // Row anchors (y) known; per-cell identification deferred to the icon matcher.
  const DYNAMIC_ROWS = [
    { y: 650, xs: [127, 184, 241, 299, 353, 412, 468] },
    { y: 706, xs: [128, 181, 240, 297, 355, 413, 473] },
  ];

  // Per-slot reader reliability, measured against every ground-truthed capture we hold
  // (the 1920x1032 reference, a 3840x1078 ultrawide, and a community 1920x1080 at panel
  // scale 1.068). 'low' = wrong on every capture tested, 'mixed' = wrong on some. This is
  // evidence, not a guess, and it exists so the UI can TELL the user which numbers to
  // double-check rather than presenting every row with equal confidence. Re-measure with
  // dev/stash-matcher/ultrawide-eval.js whenever the reader changes.
  const SLOT_RELIABILITY = {
    // Measured leave-one-out across four ground-truthed captures (each read using only
    // the OTHER captures' baked exemplars, so nothing is scored against templates cut
    // from itself). Overall 113/131 = 86%.
    //
    // Nothing is 'low' any more: before the multi-rendering bank, seven slots were wrong
    // on every capture tested. None are now, so only 'mixed' remains - these read
    // correctly on some renderings and not others, which is worth a glance but not alarm.
    // RE-MEASURE after any reader or template change; a stale flag on a slot that now
    // reads fine is its own kind of lie.
    'greater-orb-of-transmutation': 'mixed', alch: 'mixed', annul: 'mixed',
    'lesser-jewellers-orb': 'mixed', chance: 'mixed', divine: 'mixed',
    artificers: 'mixed', 'perfect-regal-orb': 'mixed', scrap: 'mixed',
    exalted: 'mixed', 'greater-exalted-orb': 'mixed', bauble: 'mixed',
    gcp: 'mixed', chaos: 'mixed', wisdom: 'mixed',
    // Added from a submitted 1920x1080 currency tab, hand-read against the capture:
    // regal 1608 read as 160 and perfect-exalted-orb 9 read as 91. Both were wrong AND
    // unflagged, which is the one combination this table exists to prevent.
    regal: 'mixed', 'perfect-exalted-orb': 'mixed',
  };

  // Reverted 2026-09-25: a wider readParams override (22.82/12.29/12.29, from the
  // stash-debug-live adjust tool) made every slot come back unread, which sends EVERY
  // threshold in readCellAdaptive down the expensive grey-tophat fallback
  // (digit-reader.js's readCellEx) for EVERY slot - that combination is what turned a
  // few-second read into minutes. Back on digit-reader.js's DEFAULTS (stripWidth 17,
  // up/dn 12) until the box size is re-measured without also breaking recognition.

  return {
    tab: 'currency',
    SLOT_RELIABILITY,
    captureSize: { w: 1920, h: 1032 },
    STATIC_SLOTS,
    EMPTY_STATIC_TODO,
    DYNAMIC_ROWS,
  };
});
