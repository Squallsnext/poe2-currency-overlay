'use strict';
// currency-cells.js - where each cell's INNER frame corner sits in the currency tab, in
// reference coordinates (the 1920x1080 space of the tab maps; REF_BOX = 18,168 582x606).
// Used to calibrate the stash panel from the cells themselves (main.js fitCalBoxByCells):
// with a controller the panel has no coloured border to snap to, and a box dragged by
// hand is only as exact as the drag. The currency tab is the measure because its cells
// are spread over the whole panel and every player has it.
//
// Measured with frame-snap.js innerCorners on a real 5120x2880 capture (panel 1658x1727)
// and checked against a hand-aligned setup of the same capture: the player's boxes sit
// at these corners + (1.75, 2.1) (= their 5 px / 6 px rule) within +-1 reference px, and
// currency-tab-map.js's count centres at these corners + (25.8, 12.1) within +-0.6 - so
// the corners agree with the tab maps. The last two are cells of the empty row under the
// exalted stacks (there in every currency tab).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).currencyCells = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const CORNERS = [
    ["transmute", 29.93, 198.53],
    ["greater-orb-of-transmutation", 86.80, 198.53],
    ["perfect-orb-of-transmutation", 143.67, 198.53],
    ["alch", 219.49, 198.53],
    ["vaal", 282.67, 198.53],
    ["annul", 345.86, 198.53],
    ["lesser-jewellers-orb", 421.68, 198.53],
    ["greater-jewellers-orb", 478.55, 198.53],
    ["perfect-jewellers-orb", 535.41, 198.53],
    ["aug", 29.93, 261.69],
    ["greater-orb-of-augmentation", 86.80, 261.69],
    ["perfect-orb-of-augmentation", 143.67, 261.69],
    ["chance", 219.49, 261.69],
    ["fracturing-orb", 282.67, 261.69],
    ["divine", 345.86, 261.69],
    ["artificers", 535.41, 261.69],
    ["regal", 29.93, 324.85],
    ["greater-regal-orb", 86.80, 324.85],
    ["perfect-regal-orb", 143.67, 324.85],
    ["etcher", 409.04, 343.80],
    ["scrap", 472.23, 343.80],
    ["whetstone", 535.41, 343.80],
    ["exalted", 29.93, 388.01],
    ["greater-exalted-orb", 86.80, 388.01],
    ["perfect-exalted-orb", 143.67, 388.01],
    ["bauble", 472.23, 406.96],
    ["gcp", 535.41, 406.96],
    ["chaos", 29.93, 451.17],
    ["greater-chaos-orb", 86.80, 451.17],
    ["perfect-chaos-orb", 143.67, 451.17],
    ["wisdom", 535.41, 489.07],
    ["transmutation-shard", 187.90, 571.18],
    ["regal-shard", 251.08, 571.18],
    ["chance-shard", 314.27, 571.18],
    ["artificers-shard", 377.45, 571.18],
    ["exalted-2", 112.07, 640.66],
    ["empty-row-1", 112.07, 697.50],
    ["empty-row-2", 164.73, 697.50],
  ];
  return { CORNERS: CORNERS.map(([id, x, y]) => ({ id, x, y })) };
});
