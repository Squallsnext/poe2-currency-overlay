'use strict';
// Static slot -> soul core map for the PoE2 Rune tab, subtab 3 "Soul Cores" (fixed grid).
// Coords are REFERENCE-frame (REF_BOX in main.js), which is what TD.scalePos expects -
// it maps them into whatever box the finder locates live. Measuring in a live frame and
// storing THAT is the trap: the reads come out plausible but wrong (a 1 read as 11).
//
// RE-MEASURED for 0.5.5 (Forbidden Rites), which re-laid-out this tab: 30 slots in 4
// rows became 47 in 7, the whole grid moved up (~90px) and the cell pitch widened
// 63 -> 67.5. The stale map did not fail loudly - the panel signature stopped matching
// and detection fell through to OTHER tabs (ancient-augment, then idol), so the tab
// read 1 line instead of 30. Re-bake tab-templates.json alongside any change here:
//   dev/stash-matcher/bake-tab-template.js --tab soulcore --img <capture> --box 21,157,619,647
//
// Layout: 7 rows, 8/7/8/7/7/6/4. Odd rows of 8 start at x77; rows of 7 are CENTERED so
// they sit half a cell in (x111); row 6 (6 cells) and row 7 (4 cells) step in further.
// Groups: rows 1-2 = 15 base cores, rows 3-4 = 15 original named, rows 5-6 = 13
// Jiquani's (new in 0.5.5), row 7 = 4 Atziri's (new, socket-bound, gold-bordered tier).
//
// Rows 1-4 identities are the July 2026 Drew-verified order, unchanged (0.5.5 appended
// rather than reordered). Rows 5-7 identities Drew-verified 2026-09-17 by reading the
// tab left-to-right, top-to-bottom; that order matches GGG's own item ordering.
//
// Coords were FITTED, not eyeballed: cell centres came from connected-component
// detection of the slot interiors, then the count-badge offset was swept against a
// capture with known counts. 126 offsets read 47/47; (-20,-16) from cell centre is the
// centre of that plateau, so the map has ~10px horizontal and ~2px vertical slack.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).soulcoreTabMap = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const STATIC_SLOTS = [
    { cx: 71, cy: 262, apiId: 'soul-core-of-topotante' },
    { cx: 134, cy: 262, apiId: 'soul-core-of-tacati' },
    { cx: 198, cy: 262, apiId: 'soul-core-of-opiloti' },
    { cx: 261, cy: 262, apiId: 'soul-core-of-jiquani' },
    { cx: 325, cy: 262, apiId: 'soul-core-of-zalatl' },
    { cx: 388, cy: 262, apiId: 'soul-core-of-citaqualotl' },
    { cx: 451, cy: 262, apiId: 'soul-core-of-puhuarte' },
    { cx: 514, cy: 262, apiId: 'soul-core-of-tzamoto' },
    { cx: 103, cy: 325, apiId: 'soul-core-of-xopec' },
    { cx: 166, cy: 325, apiId: 'soul-core-of-quipolatl' },
    { cx: 230, cy: 325, apiId: 'soul-core-of-ticaba' },
    { cx: 293, cy: 325, apiId: 'soul-core-of-atmohua' },
    { cx: 356, cy: 325, apiId: 'soul-core-of-cholotl' },
    { cx: 419, cy: 325, apiId: 'soul-core-of-zantipi' },
    { cx: 483, cy: 325, apiId: 'soul-core-of-azcapa' },
    { cx: 71, cy: 407, apiId: 'atmohuas-soul-core-of-retreat' },
    { cx: 134, cy: 407, apiId: 'hayoxis-soul-core-of-heatproofing' },
    { cx: 198, cy: 407, apiId: 'zalatls-soul-core-of-insulation' },
    { cx: 261, cy: 407, apiId: 'topotantes-soul-core-of-dampening' },
    { cx: 325, cy: 407, apiId: 'cholotls-soul-core-of-war' },
    { cx: 388, cy: 407, apiId: 'quipolatls-soul-core-of-flow' },
    { cx: 451, cy: 407, apiId: 'tzamotos-soul-core-of-ferocity' },
    { cx: 514, cy: 407, apiId: 'uromotis-soul-core-of-attenuation' },
    { cx: 103, cy: 471, apiId: 'opilotis-soul-core-of-assault' },
    { cx: 166, cy: 471, apiId: 'guatelitzis-soul-core-of-endurance' },
    { cx: 230, cy: 471, apiId: 'xopecs-soul-core-of-power' },
    { cx: 293, cy: 471, apiId: 'estazuntis-soul-core-of-convalescence' },
    { cx: 356, cy: 471, apiId: 'tacatis-soul-core-of-affliction' },
    { cx: 419, cy: 471, apiId: 'xipocados-soul-core-of-dominion' },
    { cx: 483, cy: 471, apiId: 'citaqualotls-soul-core-of-foulness' },
    { cx: 103, cy: 553, apiId: 'jiquanis-soul-core-of-automation' },
    { cx: 166, cy: 553, apiId: 'jiquanis-soul-core-of-malediction' },
    { cx: 230, cy: 553, apiId: 'jiquanis-soul-core-of-targeting' },
    { cx: 293, cy: 553, apiId: 'jiquanis-soul-core-of-rallying' },
    { cx: 356, cy: 553, apiId: 'jiquanis-soul-core-of-radiance' },
    { cx: 419, cy: 553, apiId: 'jiquanis-soul-core-of-severing' },
    { cx: 483, cy: 553, apiId: 'jiquanis-soul-core-of-rippling' },
    { cx: 134, cy: 616, apiId: 'jiquanis-soul-core-of-quaking' },
    { cx: 198, cy: 616, apiId: 'jiquanis-soul-core-of-munitions' },
    { cx: 261, cy: 616, apiId: 'jiquanis-soul-core-of-snares' },
    { cx: 325, cy: 616, apiId: 'jiquanis-soul-core-of-abundance' },
    { cx: 388, cy: 616, apiId: 'jiquanis-soul-core-of-squalls' },
    { cx: 451, cy: 616, apiId: 'jiquanis-soul-core-of-thundering' },
    { cx: 198, cy: 698, apiId: 'atziris-soul-core-of-devotion' },
    { cx: 261, cy: 698, apiId: 'atziris-soul-core-of-vitality' },
    { cx: 325, cy: 698, apiId: 'atziris-soul-core-of-alacrity' },
    { cx: 388, cy: 698, apiId: 'atziris-soul-core-of-inoculation' },
  ];
  const EMPTY_STATIC_TODO = [];
  // Inner frame corner of each slot's cell (reference coordinates), measured 2026-09-26
  // on a player's 1080p and 1440p captures (calibrated from the currency cells; both sizes
  // agree within ~1 reference px). The automatic box placement starts from these and only
  // searches a few px around them - from the count centres above it had to search wide,
  // and at some cells the neighbour's frame edge won (runes at 1080p, abyss omens at 1440p).
  const CELL_CORNERS = {
    'soul-core-of-topotante': [61.8, 252.6], 'soul-core-of-tacati': [125.2, 252.6],
    'soul-core-of-opiloti': [188.1, 252.6], 'soul-core-of-jiquani': [251.5, 252.6],
    'soul-core-of-zalatl': [314.4, 252.6], 'soul-core-of-citaqualotl': [377.8, 252.6],
    'soul-core-of-puhuarte': [440.8, 252.6], 'soul-core-of-tzamoto': [504.2, 252.6],
    'soul-core-of-xopec': [93.5, 316.0], 'soul-core-of-quipolatl': [156.4, 316.0],
    'soul-core-of-ticaba': [219.8, 316.0], 'soul-core-of-atmohua': [282.7, 316.0],
    'soul-core-of-cholotl': [346.1, 316.0], 'soul-core-of-zantipi': [409.1, 316.0],
    'soul-core-of-azcapa': [472.5, 316.0], 'atmohuas-soul-core-of-retreat': [61.8, 398.2],
    'hayoxis-soul-core-of-heatproofing': [125.2, 398.2], 'zalatls-soul-core-of-insulation': [188.1,
    398.2], 'topotantes-soul-core-of-dampening': [251.5, 398.2], 'cholotls-soul-core-of-war': [314.4,
    398.2], 'quipolatls-soul-core-of-flow': [377.8, 398.2], 'tzamotos-soul-core-of-ferocity': [440.8,
    398.2], 'uromotis-soul-core-of-attenuation': [504.2, 398.2],
    'opilotis-soul-core-of-assault': [93.5, 461.1], 'guatelitzis-soul-core-of-endurance': [156.4,
    461.1], 'xopecs-soul-core-of-power': [219.8, 461.1],
    'estazuntis-soul-core-of-convalescence': [282.7, 461.1],
    'tacatis-soul-core-of-affliction': [346.1, 461.1], 'xipocados-soul-core-of-dominion': [409.1,
    461.1], 'citaqualotls-soul-core-of-foulness': [472.5, 461.1],
    'jiquanis-soul-core-of-automation': [93.5, 543.3], 'jiquanis-soul-core-of-malediction': [156.4,
    543.3], 'jiquanis-soul-core-of-targeting': [219.8, 543.3],
    'jiquanis-soul-core-of-rallying': [282.7, 543.3], 'jiquanis-soul-core-of-radiance': [346.1,
    543.3], 'jiquanis-soul-core-of-severing': [409.1, 543.3],
    'jiquanis-soul-core-of-rippling': [472.5, 543.3], 'jiquanis-soul-core-of-quaking': [125.2,
    606.3], 'jiquanis-soul-core-of-munitions': [188.1, 606.3],
    'jiquanis-soul-core-of-snares': [251.5, 606.3], 'jiquanis-soul-core-of-abundance': [314.4,
    606.3], 'jiquanis-soul-core-of-squalls': [377.8, 606.3],
    'jiquanis-soul-core-of-thundering': [440.8, 606.3], 'atziris-soul-core-of-devotion': [188.6,
    688.5], 'atziris-soul-core-of-vitality': [251.5, 688.5], 'atziris-soul-core-of-alacrity': [314.9,
    688.5], 'atziris-soul-core-of-inoculation': [377.8, 688.5]
  };
  return { CELL_CORNERS, tab: 'soulcore', captureSize: { w: 1920, h: 1080 }, STATIC_SLOTS, EMPTY_STATIC_TODO };
});
