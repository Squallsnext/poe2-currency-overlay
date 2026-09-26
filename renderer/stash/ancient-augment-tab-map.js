'use strict';
// Static slot -> item map for the PoE2 Augment tab, subtab 5 "Ancient Augments".
// Coords = stack-count number center, LIVE 1920x1080 frame. Identities Drew-verified 2026-07-26.
// 4 rows x 4 (cols x200/263/326/389) + a central slot (294,486). Row1 Gazes [abyss], row2 Theses
// [incursion], center Raven-Touched Shard [ritual], row3 Emergent [expedition], row4 Carved
// [expedition] - all price via the full catalog. NOTE: Drew owns only the center, so the outer
// 16 left-to-right ORDER is a visual best-guess (unverified by counts) - flip a row's order if a
// future owned capture disagrees. Value-sensitive (Kurgal 39k, Jiquani thesis 242k, Majesty 82k).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).ancientAugmentTabMap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const STATIC_SLOTS = [
    { cx: 200, cy: 272, apiId: 'amanamus-gaze' },
    { cx: 263, cy: 272, apiId: 'tecrods-gaze' },
    { cx: 326, cy: 272, apiId: 'kurgals-gaze' },
    { cx: 389, cy: 272, apiId: 'ulamans-gaze' },
    { cx: 200, cy: 377, apiId: 'guatelitzis-thesis' },
    { cx: 263, cy: 377, apiId: 'citaqualotls-thesis' },
    { cx: 326, cy: 377, apiId: 'jiquanis-thesis' },
    { cx: 389, cy: 377, apiId: 'quipolatls-thesis' },
    { cx: 294, cy: 478, apiId: 'raven-touched-shard' },
    { cx: 200, cy: 597, apiId: 'emergent-vigour' },
    { cx: 263, cy: 597, apiId: 'emergent-possibility' },
    { cx: 326, cy: 597, apiId: 'emergent-protection' },
    { cx: 389, cy: 597, apiId: 'emergent-instinct' },
    { cx: 200, cy: 707, apiId: 'carved-cunning' },
    { cx: 263, cy: 707, apiId: 'carved-majesty' },
    { cx: 326, cy: 707, apiId: 'carved-mischief' },
    { cx: 389, cy: 707, apiId: 'carved-tenacity' },
  ];
  const EMPTY_STATIC_TODO = [];
  // Inner frame corner of each slot's cell (reference coordinates), measured 2026-09-26
  // on a player's 1080p and 1440p captures (calibrated from the currency cells; both sizes
  // agree within ~1 reference px). The automatic box placement starts from these and only
  // searches a few px around them - from the count centres above it had to search wide,
  // and at some cells the neighbour's frame edge won (runes at 1080p, abyss omens at 1440p).
  const CELL_CORNERS = {
    'amanamus-gaze': [188.6, 255.8], 'tecrods-gaze': [251.5, 255.8], 'kurgals-gaze': [314.9, 255.8],
    'ulamans-gaze': [377.8, 255.8], 'guatelitzis-thesis': [188.6, 363.3],
    'citaqualotls-thesis': [251.5, 363.3], 'jiquanis-thesis': [314.9, 363.3],
    'quipolatls-thesis': [377.8, 363.3], 'raven-touched-shard': [283.2, 470.4],
    'emergent-vigour': [188.6, 577.8], 'emergent-possibility': [251.5, 577.8],
    'emergent-protection': [314.9, 577.8], 'emergent-instinct': [377.8, 577.8],
    'carved-cunning': [188.6, 685.3], 'carved-majesty': [251.5, 685.3], 'carved-mischief': [314.9,
    685.3], 'carved-tenacity': [377.8, 685.3]
  };
  return { CELL_CORNERS, tab: 'ancient-augment', captureSize: { w: 1920, h: 1080 }, STATIC_SLOTS, EMPTY_STATIC_TODO };
});
