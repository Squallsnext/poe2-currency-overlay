'use strict';
// Static slot -> item map for the PoE2 Delirium stash tab. Fixed, symmetric left/right
// block layout; coords = stack-count number center in the LIVE 1920x1080 desktopCapturer
// frame. Identities Drew-verified 2026-07-27; counts auto-located via desat-max blob
// centroids then OCR-confirmed (all read clean at digit-reader DEFAULTS).
//
// Layout (top->bottom, left->right = reading order = slot index, drives the layout sort):
//   top pair  : Simulacrum Splinter, Simulacrum   (Map Fragments, priced via [fragments])
//   center    : Raven's Reflection (Map Fragment; trades via Ange but NOT indexed by
//               poe2scout -> currently no price. apiId is the poe2scout convention so it
//               auto-prices if they ever add it).
//   L/R blocks: the Liquid Emotions. Emotions only exist at the tiers the game grants them:
//               Ire/Guilt/Greed -> Diluted (+ Ancient Diluted); Disgust/Despair -> Liquid
//               (+ Ancient Liquid); Fear/Suffering/Isolation -> Concentrated (+ Ancient
//               Concentrated); Melancholy/Ferocity/Contempt -> Potent (+ Ancient Potent).
// Short rows are centered (half-cell offset) per the standard currency-tab layout.
// The 3 recessed center slots are the Simulacrum assembly slots, not item cells (unmapped).
// Ancient Potent Liquid Contempt (bottom-right corner) is the priciest item in the tab and
// is currently empty for Drew -> mapped so it auto-counts when acquired; reads "?" (flagged)
// while empty. 94's number center sits at cy 240 (art bleeds 2px lower than the rest).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).deliriumTabMap = api;
})(typeof self !== 'undefined' ? self : this, function () {

  const STATIC_SLOTS = [
    // top pair + center fragment
    { cx: 271, cy: 238, apiId: 'simulacrum-splinter' },
    { cx: 342, cy: 240, apiId: 'simulacrum' },
    { cx: 296, cy: 300, apiId: 'raven-s-reflection' },
    // R3: Diluted (Ire/Guilt/Greed) | Liquid Disgust/Despair, Concentrated Fear
    { cx: 95, cy: 369, apiId: 'diluted-liquid-ire' },
    { cx: 157, cy: 370, apiId: 'diluted-liquid-guilt' },
    { cx: 218, cy: 369, apiId: 'diluted-liquid-greed' },
    { cx: 381, cy: 370, apiId: 'liquid-disgust' },
    { cx: 445, cy: 369, apiId: 'liquid-despair' },
    { cx: 506, cy: 370, apiId: 'concentrated-liquid-fear' },
    // R4: Liquid Paranoia/Envy | Concentrated Suffering/Isolation
    { cx: 123, cy: 433, apiId: 'liquid-paranoia' },
    { cx: 187, cy: 433, apiId: 'liquid-envy' },
    { cx: 412, cy: 432, apiId: 'concentrated-liquid-suffering' },
    { cx: 473, cy: 432, apiId: 'concentrated-liquid-isolation' },
    // R5: Ancient Diluted (Ire/Guilt/Greed) | Ancient Liquid Disgust/Despair, Ancient Concentrated Fear
    { cx: 95, cy: 511, apiId: 'ancient-diluted-liquid-ire' },
    { cx: 158, cy: 512, apiId: 'ancient-diluted-liquid-guilt' },
    { cx: 218, cy: 511, apiId: 'ancient-diluted-liquid-greed' },
    { cx: 382, cy: 511, apiId: 'ancient-liquid-disgust' },
    { cx: 445, cy: 512, apiId: 'ancient-liquid-despair' },
    { cx: 506, cy: 512, apiId: 'ancient-concentrated-liquid-fear' },
    // R6: Ancient Liquid Paranoia/Envy | Ancient Concentrated Suffering/Isolation
    { cx: 122, cy: 575, apiId: 'ancient-liquid-paranoia' },
    { cx: 185, cy: 575, apiId: 'ancient-liquid-envy' },
    { cx: 410, cy: 574, apiId: 'ancient-concentrated-liquid-suffering' },
    { cx: 473, cy: 574, apiId: 'ancient-concentrated-liquid-isolation' },
    // R7: Potent (Melancholy/Ferocity/Contempt) | Ancient Potent (Melancholy/Ferocity/Contempt)
    { cx: 104, cy: 656, apiId: 'potent-liquid-melancholy' },
    { cx: 168, cy: 657, apiId: 'potent-liquid-ferocity' },
    { cx: 233, cy: 656, apiId: 'potent-liquid-contempt' },
    { cx: 361, cy: 656, apiId: 'ancient-potent-liquid-melancholy' },
    { cx: 424, cy: 656, apiId: 'ancient-potent-liquid-ferocity' },
    { cx: 487, cy: 656, apiId: 'ancient-potent-liquid-contempt' }, // empty for Drew -> reads "?"
  ];
  const EMPTY_STATIC_TODO = [];
  // Inner frame corner of each slot's cell (reference coordinates), measured 2026-09-26
  // on a player's 1080p and 1440p captures (calibrated from the currency cells; both sizes
  // agree within ~1 reference px). The automatic box placement starts from these and only
  // searches a few px around them - from the count centres above it had to search wide,
  // and at some cells the neighbour's frame edge won (runes at 1080p, abyss omens at 1440p).
  const CELL_CORNERS = {
    'simulacrum-splinter': [247.1, 227.0], 'simulacrum': [322.9, 227.0],
    'raven-s-reflection': [283.6, 289.9], 'diluted-liquid-ire': [75.0, 359.2],
    'diluted-liquid-guilt': [138.4, 359.2], 'diluted-liquid-greed': [201.3, 359.2],
    'liquid-disgust': [365.8, 359.2], 'liquid-despair': [428.7, 359.2],
    'concentrated-liquid-fear': [492.1, 359.2], 'liquid-paranoia': [106.7, 422.6],
    'liquid-envy': [169.6, 422.6], 'concentrated-liquid-suffering': [397.5, 422.6],
    'concentrated-liquid-isolation': [460.4, 422.6], 'ancient-diluted-liquid-ire': [75.0, 501.2],
    'ancient-diluted-liquid-guilt': [138.4, 501.2], 'ancient-diluted-liquid-greed': [201.3, 501.2],
    'ancient-liquid-disgust': [365.8, 501.2], 'ancient-liquid-despair': [428.7, 501.2],
    'ancient-concentrated-liquid-fear': [492.1, 501.2], 'ancient-liquid-paranoia': [106.7, 564.6],
    'ancient-liquid-envy': [169.6, 564.6], 'ancient-concentrated-liquid-suffering': [397.5, 564.6],
    'ancient-concentrated-liquid-isolation': [460.4, 564.6], 'potent-liquid-melancholy': [87.8,
    646.9], 'potent-liquid-ferocity': [153.2, 646.9], 'potent-liquid-contempt': [218.2, 646.9],
    'ancient-potent-liquid-melancholy': [346.1, 646.9], 'ancient-potent-liquid-ferocity': [411.5,
    646.9], 'ancient-potent-liquid-contempt': [476.5, 646.9]
  };
  return { CELL_CORNERS, tab: 'delirium', captureSize: { w: 1920, h: 1080 }, STATIC_SLOTS, EMPTY_STATIC_TODO };
});
