'use strict';
// Static slot -> idol map for the PoE2 Augment tab, subtab 4 "Idols" (fixed grid).
// Coords = stack-count number center, LIVE 1920x1080 frame. Identities Drew-verified 2026-07-26.
// Two size groups: small animal idols "<type> Idol" (rows 1-2, y276/351) + larger "Idol of
// <type>" (rows 3-4, y458/566) and "Idol of the <type>" (row 5, y673). Row2 is 6 cells indented
// to the 8-col grid's cols 2-7; rows 3-5 are their own 7-col grid (x106..484). panther/stoat/
// hawk-idol have no poe2scout price (untradeable) -> they read counts but flag "no price".
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).idolTabMap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const STATIC_SLOTS = [
    { cx: 77, cy: 276, apiId: 'snake-idol' },
    { cx: 141, cy: 276, apiId: 'primate-idol' },
    { cx: 204, cy: 276, apiId: 'owl-idol' },
    { cx: 269, cy: 276, apiId: 'cat-idol' },
    { cx: 329, cy: 276, apiId: 'wolf-idol' },
    { cx: 397, cy: 276, apiId: 'boar-idol' },
    { cx: 459, cy: 276, apiId: 'bear-idol' },
    { cx: 523, cy: 276, apiId: 'ox-idol' },
    { cx: 141, cy: 351, apiId: 'stag-idol' },
    { cx: 204, cy: 351, apiId: 'rabbit-idol' },
    { cx: 269, cy: 351, apiId: 'fox-idol' },
    { cx: 329, cy: 351, apiId: 'panther-idol' },
    { cx: 397, cy: 351, apiId: 'stoat-idol' },
    { cx: 459, cy: 351, apiId: 'hawk-idol' },
    { cx: 106, cy: 458, apiId: 'idol-of-sirrius' },
    { cx: 169, cy: 458, apiId: 'idol-of-thruldana' },
    { cx: 232, cy: 458, apiId: 'idol-of-grold' },
    { cx: 295, cy: 458, apiId: 'idol-of-eeshta' },
    { cx: 358, cy: 458, apiId: 'idol-of-egrin' },
    { cx: 421, cy: 458, apiId: 'idol-of-maxarius' },
    { cx: 484, cy: 458, apiId: 'idol-of-ralakesh' },
    { cx: 106, cy: 566, apiId: 'idol-of-greust' },
    { cx: 169, cy: 566, apiId: 'idol-of-yeena' },
    { cx: 232, cy: 566, apiId: 'idol-of-eramir' },
    { cx: 295, cy: 566, apiId: 'idol-of-oak' },
    { cx: 358, cy: 566, apiId: 'idol-of-alira' },
    { cx: 421, cy: 566, apiId: 'idol-of-kraityn' },
    { cx: 484, cy: 566, apiId: 'idol-of-silk' },
    { cx: 232, cy: 673, apiId: 'idol-of-the-sycophant' },
    { cx: 295, cy: 673, apiId: 'idol-of-the-martyr' },
    { cx: 358, cy: 673, apiId: 'idol-of-the-pharisee' },
  ];
  const EMPTY_STATIC_TODO = [];
  // Inner frame corner of each slot's cell (reference coordinates), measured 2026-09-26
  // on a player's 1080p and 1440p captures (calibrated from the currency cells; both sizes
  // agree within ~1 reference px). The automatic box placement starts from these and only
  // searches a few px around them - from the count centres above it had to search wide,
  // and at some cells the neighbour's frame edge won (runes at 1080p, abyss omens at 1440p).
  const CELL_CORNERS = {
    'snake-idol': [61.8, 265.4], 'primate-idol': [125.2, 265.4], 'owl-idol': [188.1, 265.4],
    'cat-idol': [251.5, 265.4], 'wolf-idol': [314.4, 265.4], 'boar-idol': [377.8, 265.4],
    'bear-idol': [440.8, 265.4], 'ox-idol': [504.2, 265.4], 'stag-idol': [125.2, 341.2],
    'rabbit-idol': [188.1, 341.2], 'fox-idol': [251.5, 341.2], 'panther-idol': [314.4, 341.2],
    'stoat-idol': [377.8, 341.2], 'hawk-idol': [440.8, 341.2], 'idol-of-sirrius': [93.5, 448.7],
    'idol-of-thruldana': [156.4, 448.7], 'idol-of-grold': [219.8, 448.7], 'idol-of-eeshta': [282.7,
    448.7], 'idol-of-egrin': [346.1, 448.7], 'idol-of-maxarius': [409.1, 448.7],
    'idol-of-ralakesh': [472.5, 448.7], 'idol-of-greust': [93.5, 555.7], 'idol-of-yeena': [156.9,
    555.7], 'idol-of-eramir': [219.8, 555.7], 'idol-of-oak': [283.2, 555.7], 'idol-of-alira': [346.1,
    555.7], 'idol-of-kraityn': [409.5, 555.7], 'idol-of-silk': [472.5, 555.7],
    'idol-of-the-sycophant': [219.8, 663.2], 'idol-of-the-martyr': [283.2, 663.2],
    'idol-of-the-pharisee': [346.1, 663.2]
  };
  return { CELL_CORNERS, tab: 'idol', captureSize: { w: 1920, h: 1080 }, STATIC_SLOTS, EMPTY_STATIC_TODO };
});
