'use strict';
// Static slot -> currency map for the PoE2 Abyss stash tab (fixed layout).
// Top diamond = abyss drops (Kulemak's Invitation, Cranium, Jawbones, Collarbones,
// Ribs); bottom row = abyss Omens. Coords are the stack-count number center at
// 1920x1032 native capture. Verified against a live tab (Runes of Aldur, 2026-07).
//
// TODO: the 4 Gazes (kurgals/tecrods/ulamans/amanamus) and the empty diamond slot
// below the ribs weren't owned in the reference capture - add their coords from a
// future capture that has them. Pricing spans all categories, so apiIds from
// abyss/ritual/fragments all resolve.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).abyssTabMap = api;
})(typeof self !== 'undefined' ? self : this, function () {

  const STATIC_SLOTS = [
    // top: Kulemak's Invitation
    { cx: 295, cy: 239, apiId: 'kulemaks-invitation' },
    // Preserved Cranium
    { cx: 293, cy: 331, apiId: 'preserved-cranium' },
    // Jawbones: gnawed / preserved / ancient
    { cx: 232, cy: 392, apiId: 'gnawed-jawbone' },
    { cx: 300, cy: 392, apiId: 'preserved-jawbone' },
    { cx: 361, cy: 393, apiId: 'ancient-jawbone' },
    // Collarbones: gnawed / preserved / ancient / altered
    { cx: 201, cy: 454, apiId: 'gnawed-collarbone' },
    { cx: 268, cy: 454, apiId: 'preserved-collarbone' },
    { cx: 325, cy: 454, apiId: 'ancient-collarbone' },
    { cx: 387, cy: 454, apiId: 'altered-collarbone' },
    // Ribs: gnawed / preserved / ancient
    { cx: 234, cy: 517, apiId: 'gnawed-rib' },
    { cx: 304, cy: 517, apiId: 'preserved-rib' },
    { cx: 363, cy: 516, apiId: 'ancient-rib' },
    // Preserved Vertebrae (empty in ref; not on market yet -> flags "no price")
    { cx: 304, cy: 580, apiId: 'preserved-vertebrae' },
    // bottom row: Omens
    { cx: 85, cy: 670, apiId: 'omen-of-abyssal-echoes' },
    { cx: 140, cy: 671, apiId: 'omen-of-the-sovereign' },
    { cx: 204, cy: 671, apiId: 'omen-of-the-liege' },
    { cx: 270, cy: 670, apiId: 'omen-of-the-blackblooded' },
    { cx: 332, cy: 671, apiId: 'omen-of-putrefaction' },
    { cx: 391, cy: 671, apiId: 'omen-of-light' },
    { cx: 454, cy: 671, apiId: 'omen-of-sinistral-necromancy' },
    { cx: 515, cy: 671, apiId: 'omen-of-dextral-necromancy' },
  ];

  const EMPTY_STATIC_TODO = ['kurgals-gaze', 'tecrods-gaze', 'ulamans-gaze', 'amanamus-gaze'];

  // Inner frame corner of each slot's cell (reference coordinates), measured 2026-09-26
  // on a player's 1080p and 1440p captures (calibrated from the currency cells; both sizes
  // agree within ~1 reference px). The automatic box placement starts from these and only
  // searches a few px around them - from the count centres above it had to search wide,
  // and at some cells the neighbour's frame edge won (runes at 1080p, abyss omens at 1440p).
  const CELL_CORNERS = {
    'kulemaks-invitation': [282.7, 227.0], 'preserved-cranium': [282.7, 320.4],
    'gnawed-jawbone': [221.0, 382.2], 'preserved-jawbone': [282.7, 382.2], 'ancient-jawbone': [343.7,
    382.2], 'gnawed-collarbone': [190.1, 443.9], 'preserved-collarbone': [252.3, 443.9],
    'ancient-collarbone': [314.4, 443.9], 'altered-collarbone': [376.2, 443.9], 'gnawed-rib': [221.0,
    506.0], 'preserved-rib': [282.7, 506.0], 'ancient-rib': [343.7, 506.0],
    'preserved-vertebrae': [282.7, 567.8], 'omen-of-abyssal-echoes': [66.5, 660.1],
    'omen-of-the-sovereign': [128.3, 660.1], 'omen-of-the-liege': [190.3, 660.1],
    'omen-of-the-blackblooded': [252.3, 660.1], 'omen-of-putrefaction': [314.4, 660.1],
    'omen-of-light': [376.2, 660.1], 'omen-of-sinistral-necromancy': [438.0, 660.1],
    'omen-of-dextral-necromancy': [499.7, 660.1]
  };
  return { CELL_CORNERS, tab: 'abyss', captureSize: { w: 1920, h: 1032 }, STATIC_SLOTS, EMPTY_STATIC_TODO };
});
