'use strict';
// Static slot -> item map for the PoE2 Expedition stash tab. Coords = stack-count number
// center in the LIVE 1920x1080 desktopCapturer frame. Identities Drew-verified 2026-07-27;
// owned counts OCR-confirmed at digit-reader DEFAULTS (31/31), empties read "?".
//
// The tab's items span several poe2scout categories (that's fine - getStashPriceMap merges
// all 17): sagas + fluxes are [expedition]; Verisium/Crests/Alloys are [verisium]; the two
// Triskelion items aren't in poe2scout at all and price off GGG's CX feed (see main.js
// CX_FALLBACK: shattered-triskelion, the-triskelion-reforged).
//
// Layout (top -> bottom):
//   top row (6) : Expedition Logbook + the 5 Sagas (Aldur's/Medved's/Vorana's/Uhtred's/Olroth's)
//   R2 (2)      : Shattered Triskelion + The Triskelion Reforged (large 2x2 slots; Reforged
//                 empty for Drew -> count position estimated, revisit when non-empty)
//   R3 (3)      : Verisium / Exceptional / Liquid Verisium
//   R4 (4)      : the 4 Crests (Medved's Circle, Vorana's Scythe, Uhtred's Chalice, Olroth's Sun)
//   R5 (7),R6(6): the 13 Alloys (R6 centered over R5)
//   R7 (4)      : the elemental Fluxes (Blazing/Chilling/Crackling/Void)
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).expeditionTabMap = api;
})(typeof self !== 'undefined' ? self : this, function () {

  const STATIC_SLOTS = [
    // top row: logbook + 5 sagas
    { cx: 139, cy: 233, apiId: 'expedition-logbook' },
    { cx: 212, cy: 233, apiId: 'aldurs-saga' },
    { cx: 275, cy: 233, apiId: 'medveds-saga' },
    { cx: 335, cy: 233, apiId: 'voranas-saga' },
    { cx: 397, cy: 233, apiId: 'uhtreds-saga' },
    { cx: 462, cy: 233, apiId: 'olroths-saga' },
    // R2: Triskelion pair (large 2x2 slots)
    { cx: 214, cy: 322, apiId: 'shattered-triskelion' },
    { cx: 327, cy: 322, apiId: 'the-triskelion-reforged' }, // count position verified live 2026-07-27
    // R3: Verisium tiers
    { cx: 209, cy: 441, apiId: 'verisium' },
    { cx: 270, cy: 441, apiId: 'exceptional-verisium' },
    { cx: 394, cy: 441, apiId: 'liquid-verisium' },
    // R4: Crests
    { cx: 212, cy: 503, apiId: 'medveds-crest-of-the-circle' },
    { cx: 266, cy: 503, apiId: 'voranas-crest-of-the-scythe' },
    { cx: 333, cy: 503, apiId: 'uhtreds-crest-of-the-chalice' },
    { cx: 396, cy: 503, apiId: 'olroths-crest-of-the-sun' },
    // R5: Alloys (7)
    { cx: 106, cy: 573, apiId: 'runic-alloy' },
    { cx: 168, cy: 573, apiId: 'adaptive-alloy' },
    { cx: 233, cy: 573, apiId: 'protective-alloy' },
    { cx: 298, cy: 573, apiId: 'expansive-alloy' },
    { cx: 360, cy: 573, apiId: 'swift-alloy' },
    { cx: 424, cy: 573, apiId: 'cyclonic-alloy' },
    { cx: 485, cy: 573, apiId: 'prismatic-alloy' },
    // R6: Alloys (6, centered over R5)
    { cx: 139, cy: 637, apiId: 'mystic-alloy' },
    { cx: 201, cy: 637, apiId: 'sovereign-alloy' },
    { cx: 262, cy: 637, apiId: 'celestial-alloy' },
    { cx: 327, cy: 637, apiId: 'transcendent-alloy' },
    { cx: 389, cy: 637, apiId: 'the-runebinders-alloy' },
    { cx: 452, cy: 637, apiId: 'the-runefathers-alloy' },
    // R7: elemental Fluxes
    { cx: 202, cy: 705, apiId: 'blazing-flux' },
    { cx: 275, cy: 705, apiId: 'chilling-flux' },
    { cx: 329, cy: 705, apiId: 'crackling-flux' },
    { cx: 390, cy: 705, apiId: 'void-flux' },
  ];
  const EMPTY_STATIC_TODO = [];
  // Inner frame corner of each slot's cell (reference coordinates), measured 2026-09-26
  // on a player's 1080p and 1440p captures (calibrated from the currency cells; both sizes
  // agree within ~1 reference px). The automatic box placement starts from these and only
  // searches a few px around them - from the count centres above it had to search wide,
  // and at some cells the neighbour's frame edge won (runes at 1080p, abyss omens at 1440p).
  const CELL_CORNERS = {
    'expedition-logbook': [125.2, 221.7], 'aldurs-saga': [188.1, 221.7], 'medveds-saga': [251.5,
    221.7], 'voranas-saga': [314.4, 221.7], 'uhtreds-saga': [377.8, 221.7], 'olroths-saga': [440.8,
    221.7], 'shattered-triskelion': [201.8, 311.2], 'the-triskelion-reforged': [314.4, 311.2],
    'verisium': [188.1, 430.2], 'exceptional-verisium': [251.5, 430.2], 'liquid-verisium': [377.8,
    430.2], 'medveds-crest-of-the-circle': [188.1, 493.6], 'voranas-crest-of-the-scythe': [251.5,
    493.6], 'uhtreds-crest-of-the-chalice': [314.4, 493.6], 'olroths-crest-of-the-sun': [377.8,
    493.6], 'runic-alloy': [93.5, 563.0], 'adaptive-alloy': [156.9, 563.0],
    'protective-alloy': [219.8, 563.0], 'expansive-alloy': [283.2, 563.0], 'swift-alloy': [346.1,
    563.0], 'cyclonic-alloy': [409.5, 563.0], 'prismatic-alloy': [472.5, 563.0],
    'mystic-alloy': [125.2, 625.9], 'sovereign-alloy': [188.1, 625.9], 'celestial-alloy': [251.5,
    625.9], 'transcendent-alloy': [314.4, 625.9], 'the-runebinders-alloy': [377.8, 625.9],
    'the-runefathers-alloy': [440.8, 625.9], 'blazing-flux': [188.1, 695.8], 'chilling-flux': [251.5,
    695.8], 'crackling-flux': [314.4, 695.8], 'void-flux': [377.8, 695.8]
  };
  return { CELL_CORNERS, tab: 'expedition', captureSize: { w: 1920, h: 1080 }, STATIC_SLOTS, EMPTY_STATIC_TODO };
});
