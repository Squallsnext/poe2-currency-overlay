'use strict';
// Static slot -> omen map for the PoE2 Ritual stash tab (fixed, irregular twin-cluster layout).
// Coords = stack-count number center, LIVE 1920x1080 desktopCapturer frame. Identities
// Drew-verified 2026-07-26; positions read cluster-by-cluster (auto-detect misses cells here).
// Omens are grouped into "buckets", each with a small marker icon in the top-left corner of the
// leftmost omen (Drew's insight); the number is layered on top. All owned cells read clean here.
// sinistral-crystallisation's "41" (rune art fused to the "1") is fixed by the digit-reader's
// 1px kerning-overlap tolerance (see digit-reader overlaps()). chance @(258,520) is tuned to read
// "?" on the empty cell past its bucket marker.
// TODO: 2 unowned/unknown empties still not mapped (R2 slot1, R4 slot1). R1 slot3 is now
// call-of-the-shadows (2026-09-25, position extrapolated not drop-verified).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).ritualTabMap = api;
})(typeof self !== 'undefined' ? self : this, function () {

  const STATIC_SLOTS = [
    { cx: 208, cy: 209, apiId: 'an-audience-with-the-king' },
    { cx: 269, cy: 209, apiId: 'head-of-the-king' },
    // R1 slot3 - was one of the 3 unmapped TODO empties below; position extrapolated from
    // the row's own ~61px spacing (208 -> 269), not yet drop-verified. Use the in-app
    // "Ausrichten" tool to nudge it if it doesn't land exactly on the count.
    { cx: 330, cy: 209, apiId: 'call-of-the-shadows' },
    { cx: 337, cy: 304, apiId: 'omen-of-gambling' },
    { cx: 394, cy: 304, apiId: 'omen-of-bartering' },
    { cx: 110, cy: 385, apiId: 'omen-of-sinistral-exaltation' },
    { cx: 173, cy: 385, apiId: 'omen-of-dextral-exaltation' },
    { cx: 228, cy: 385, apiId: 'omen-of-greater-exaltation' },
    { cx: 313, cy: 385, apiId: 'omen-of-sinistral-erasure' },
    { cx: 364, cy: 385, apiId: 'omen-of-dextral-erasure' },
    { cx: 427, cy: 385, apiId: 'omen-of-whittling' },
    { cx: 202, cy: 442, apiId: 'omen-of-catalysing-exaltation' },
    { cx: 312, cy: 442, apiId: 'omen-of-chaotic-rarity' },
    { cx: 368, cy: 442, apiId: 'omen-of-chaotic-quantity' },
    { cx: 426, cy: 442, apiId: 'omen-of-chaotic-monsters' },
    { cx: 488, cy: 442, apiId: 'omen-of-chaotic-effectiveness' },
    { cx: 137, cy: 525, apiId: 'omen-of-sinistral-annulment' },
    { cx: 194, cy: 525, apiId: 'omen-of-dextral-annulment' },
    { cx: 333, cy: 525, apiId: 'omen-of-the-ancients' },
    { cx: 410, cy: 525, apiId: 'omen-of-the-blessed' },
    { cx: 468, cy: 525, apiId: 'omen-of-sanctification' },
    { cx: 258, cy: 520, apiId: 'omen-of-chance' },
    { cx: 132, cy: 606, apiId: 'omen-of-dextral-crystallisation' },
    { cx: 186, cy: 606, apiId: 'omen-of-sinistral-crystallisation' },
    { cx: 110, cy: 700, apiId: 'omen-of-resurgence' },
    { cx: 166, cy: 700, apiId: 'omen-of-amelioration' },
    { cx: 222, cy: 700, apiId: 'omen-of-refreshment' },
    { cx: 300, cy: 700, apiId: 'omen-of-the-hunt' },
    { cx: 356, cy: 700, apiId: 'omen-of-answered-prayers' },
    { cx: 412, cy: 700, apiId: 'omen-of-secret-compartments' },
    { cx: 468, cy: 700, apiId: 'omen-of-reinforcements' },
  ];
  const EMPTY_STATIC_TODO = [];
  // Inner frame corner of each slot's cell (reference coordinates), measured 2026-09-26
  // on a player's 1080p and 1440p captures (calibrated from the currency cells; both sizes
  // agree within ~1 reference px). The automatic box placement starts from these and only
  // searches a few px around them - from the count centres above it had to search wide,
  // and at some cells the neighbour's frame edge won (runes at 1080p, abyss omens at 1440p).
  const CELL_CORNERS = {
    'an-audience-with-the-king': [188.9, 198.1], 'head-of-the-king': [258.3, 198.1],
    'omen-of-gambling': [324.9, 293.2], 'omen-of-bartering': [381.8, 293.2],
    'omen-of-sinistral-exaltation': [99.9, 374.9], 'omen-of-dextral-exaltation': [156.4, 374.9],
    'omen-of-greater-exaltation': [213.4, 374.9], 'omen-of-sinistral-erasure': [295.6, 374.9],
    'omen-of-dextral-erasure': [352.6, 374.9], 'omen-of-whittling': [409.1, 374.9],
    'omen-of-catalysing-exaltation': [185.3, 431.9], 'omen-of-chaotic-rarity': [295.6, 431.9],
    'omen-of-chaotic-quantity': [352.6, 431.9], 'omen-of-chaotic-monsters': [409.1, 431.9],
    'omen-of-chaotic-effectiveness': [466.1, 431.9], 'omen-of-sinistral-annulment': [115.4, 514.1],
    'omen-of-dextral-annulment': [172.4, 514.1], 'omen-of-the-ancients': [311.6, 514.1],
    'omen-of-the-blessed': [393.4, 514.1], 'omen-of-sanctification': [450.4, 514.1],
    'omen-of-chance': [254.7, 514.1], 'omen-of-dextral-crystallisation': [115.4, 596.3],
    'omen-of-sinistral-crystallisation': [172.4, 596.3], 'omen-of-resurgence': [99.9, 691.0],
    'omen-of-amelioration': [156.4, 691.0], 'omen-of-refreshment': [213.4, 691.0],
    'omen-of-the-hunt': [295.6, 691.0], 'omen-of-answered-prayers': [352.6, 691.0],
    'omen-of-secret-compartments': [409.1, 691.0], 'omen-of-reinforcements': [464.2, 691.0]
  };
  return { CELL_CORNERS, tab: 'ritual', captureSize: { w: 1920, h: 1080 }, STATIC_SLOTS, EMPTY_STATIC_TODO };
});
