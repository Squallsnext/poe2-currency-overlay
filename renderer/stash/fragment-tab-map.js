'use strict';
// Static slot map for the PoE2 Fragment stash tab, sub-tab "Fragmente" (Patch 0.5). The
// other two sub-tabs are left out: "Tafeln" holds single tablets (no stack counts to
// read) and "Prüfungen" (reliquary keys) can follow the same way.
//
// Slot identities from the player (German client, 2026-09-27): icons of the empty cells
// matched against poe.ninja's item art, and every doubtful cell named from its in-game
// tooltip / item text - the red cell is the Breachstone ("Riss-Stein"), the "400" stack
// Breach Splinters, the two big round cells Shattered Triskelion (top) and The
// Triskelion Reforged (bottom), the gold-framed centre the Origin Cradle with the Origin
// Spark above it, the skull An Audience with the King next to the Head of the King, the
// three fates Deadly / Cowardly / Victorious left to right.
//
// Positions: measured on a (scaled) screenshot of the tab - cell interiors found as dark
// connected areas, scaled by the cell size every stash tab shares (small interior 51.5,
// pitch 56.6 reference px, from the 1080p ritual capture; 122.5 / 135 px here -> 2.382
// px per reference px) and anchored on the parchment's centre and bottom edge. Good to a
// few reference px: the first scan of the tab places the boxes on the real cell frames
// (rule placement searches around CELL_CORNERS), and "Ausrichten" fixes the rest.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).fragmentTabMap = api;
})(typeof self !== 'undefined' ? self : this, function () {

  // stack-count centre (reference coordinates), top-left of each cell like every tab
  const STATIC_SLOTS = [
    { cx: 244, cy: 293, apiId: 'ancient-crisis-fragment' },
    { cx: 300, cy: 293, apiId: 'weathered-crisis-fragment' },
    { cx: 357, cy: 293, apiId: 'faded-crisis-fragment' },
    { cx: 452, cy: 325, apiId: 'shattered-triskelion' },
    { cx: 95, cy: 375, apiId: 'breach-splinter' },
    { cx: 158, cy: 375, apiId: 'breachstone' },
    { cx: 301, cy: 374, apiId: 'origin-spark' },
    { cx: 102, cy: 438, apiId: 'breachlord-sac' },
    { cx: 277, cy: 437, apiId: 'origin-cradle' },
    { cx: 452, cy: 438, apiId: 'the-triskelion-reforged' },
    { cx: 68, cy: 581, apiId: 'an-audience-with-the-king' },
    { cx: 132, cy: 581, apiId: 'head-of-the-king' },
    { cx: 244, cy: 581, apiId: 'call-of-the-shadows' },
    { cx: 326, cy: 581, apiId: 'simulacrum-splinter' },
    { cx: 389, cy: 581, apiId: 'simulacrum' },
    { cx: 452, cy: 581, apiId: 'raven-s-reflection' },
    { cx: 534, cy: 581, apiId: 'kulemaks-invitation' },
    { cx: 245, cy: 676, apiId: 'deadly-fate' },
    { cx: 301, cy: 676, apiId: 'cowardly-fate' },
    { cx: 358, cy: 676, apiId: 'victorious-fate' },
  ];
  const EMPTY_STATIC_TODO = [];
  // inner frame corner of each slot's cell (reference coordinates), see above
  const CELL_CORNERS = {
    'ancient-crisis-fragment': [224.6, 281.7], 'weathered-crisis-fragment': [281.2, 281.7],
    'faded-crisis-fragment': [337.9, 281.7], 'shattered-triskelion': [432.8, 313.6],
    'breach-splinter': [75.5, 363.9], 'breachstone': [138.5, 363.9],
    'origin-spark': [282.1, 363.5], 'breachlord-sac': [82.7, 426.9],
    'origin-cradle': [257.7, 426.5], 'the-triskelion-reforged': [432.8, 426.9],
    'an-audience-with-the-king': [48.7, 570.5], 'head-of-the-king': [112.9, 570.5],
    'call-of-the-shadows': [225.0, 570.5], 'simulacrum-splinter': [306.8, 570.5],
    'simulacrum': [369.8, 570.5], 'raven-s-reflection': [432.8, 570.5],
    'kulemaks-invitation': [514.6, 570.5], 'deadly-fate': [225.4, 664.9],
    'cowardly-fate': [282.1, 664.9], 'victorious-fate': [338.7, 664.9],
  };
  return { CELL_CORNERS, tab: 'fragment', captureSize: { w: 1920, h: 1080 }, STATIC_SLOTS, EMPTY_STATIC_TODO };
});
