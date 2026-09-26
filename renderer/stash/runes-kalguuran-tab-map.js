'use strict';
// Static slot -> rune map for the PoE2 Augment tab, subtab 2 "Kalguuran Runes".
// Coords = stack-count number center, LIVE 1920x1080 desktopCapturer frame.
// Grid geometry visually confirmed + identities Drew-verified 2026-07-26. Blanks
// resolved by family single-missing elimination + Drew buying the 4 cheap uniques.
// Number positions corrected -10px onto the digits (these silver/white rune icons
// bleed low-saturation art into a strip centered on the art-pulled detection centroid;
// reading -10 left lands on the pure-white count and drops the art). Reads all rows
// vs ground truth clean except a couple cells where art sits flush against the digit.
// Families: Warding (R1-3), Ancient (R4 + R5 left), Rune-of (R5 right + R6), uniques (R7-8).
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).runesKalguuranTabMap = api;
})(typeof self !== 'undefined' ? self : this, function () {

  const STATIC_SLOTS = [
    { cx: 139, cy: 253, apiId: 'warding-rune-of-reinforcement' },
    { cx: 202, cy: 253, apiId: 'warding-rune-of-protection' },
    { cx: 265, cy: 253, apiId: 'warding-rune-of-disintegration' },
    { cx: 328, cy: 253, apiId: 'warding-rune-of-desperation' },
    { cx: 391, cy: 253, apiId: 'warding-rune-of-courage' },
    { cx: 454, cy: 253, apiId: 'warding-rune-of-nourishment' },
    { cx: 139, cy: 316, apiId: 'warding-rune-of-symbiosis' },
    { cx: 202, cy: 316, apiId: 'warding-rune-of-stability' },
    { cx: 265, cy: 316, apiId: 'warding-rune-of-glancing' },
    { cx: 328, cy: 316, apiId: 'warding-rune-of-heart' },
    { cx: 391, cy: 316, apiId: 'warding-rune-of-annihilation' },
    { cx: 454, cy: 316, apiId: 'warding-rune-of-salvaging' },
    { cx: 173, cy: 380, apiId: 'warding-rune-of-armature' },
    { cx: 236, cy: 380, apiId: 'warding-rune-of-obsession' },
    { cx: 299, cy: 380, apiId: 'warding-rune-of-equinox' },
    { cx: 362, cy: 380, apiId: 'warding-rune-of-bodyguards' },
    { cx: 425, cy: 380, apiId: 'warding-rune-of-hollowing' },
    { cx: 46, cy: 449, apiId: 'ancient-rune-of-splinters' },
    { cx: 109, cy: 449, apiId: 'ancient-rune-of-dueling' },
    { cx: 173, cy: 449, apiId: 'ancient-rune-of-the-titan' },
    { cx: 236, cy: 449, apiId: 'ancient-rune-of-shattering' },
    { cx: 299, cy: 449, apiId: 'ancient-rune-of-prowess' },
    { cx: 362, cy: 449, apiId: 'ancient-rune-of-control' },
    { cx: 426, cy: 449, apiId: 'ancient-rune-of-discovery' },
    { cx: 489, cy: 449, apiId: 'ancient-rune-of-decay' },
    { cx: 552, cy: 449, apiId: 'ancient-rune-of-witchcraft' },
    { cx: 46, cy: 512, apiId: 'ancient-rune-of-the-horde' },
    { cx: 109, cy: 512, apiId: 'ancient-rune-of-animosity' },
    { cx: 173, cy: 512, apiId: 'ancient-rune-of-detonation' },
    { cx: 236, cy: 512, apiId: 'ancient-rune-of-retaliation' },
    { cx: 362, cy: 512, apiId: 'rune-of-vitality' },
    { cx: 426, cy: 512, apiId: 'rune-of-the-hunt' },
    { cx: 489, cy: 512, apiId: 'rune-of-acrobatics' },
    { cx: 552, cy: 512, apiId: 'rune-of-culmination' },
    { cx: 46, cy: 576, apiId: 'rune-of-renown' },
    { cx: 109, cy: 576, apiId: 'rune-of-accumulation' },
    { cx: 173, cy: 576, apiId: 'rune-of-foundations' },
    { cx: 236, cy: 576, apiId: 'rune-of-the-prism' },
    { cx: 299, cy: 576, apiId: 'rune-of-the-blossom' },
    { cx: 362, cy: 576, apiId: 'rune-of-consistency' },
    { cx: 426, cy: 576, apiId: 'rune-of-reach' },
    { cx: 489, cy: 576, apiId: 'rune-of-vital-flame' },
    { cx: 552, cy: 576, apiId: 'rune-of-confrontation' },
    { cx: 100, cy: 646, apiId: 'passion-of-aldur' },
    { cx: 163, cy: 646, apiId: 'breath-of-aldur' },
    { cx: 226, cy: 646, apiId: 'ire-of-aldur' },
    { cx: 289, cy: 646, apiId: 'betrayal-of-aldur' },
    { cx: 352, cy: 646, apiId: 'serles-triumph' },
    { cx: 415, cy: 646, apiId: 'cadigans-epiphany' },
    { cx: 478, cy: 646, apiId: 'astrids-creativity' },
    { cx: 48, cy: 707, apiId: 'uhtreds-sidereus' },
    { cx: 111, cy: 707, apiId: 'kolrs-hunt' },
    { cx: 174, cy: 707, apiId: 'voranas-carnage' },
    { cx: 237, cy: 707, apiId: 'thruds-might' },
    { cx: 300, cy: 707, apiId: 'medveds-tending' },
    { cx: 363, cy: 707, apiId: 'katlas-gloom' },
    { cx: 426, cy: 707, apiId: 'masterwork-rune' },
    { cx: 489, cy: 707, apiId: 'aldurs-legacy' },
  ];
  const EMPTY_STATIC_TODO = [];
  // These silver/white rune icons bleed low-saturation art flush against the count;
  // a tighter read window (stripWidth 12 vs default 15) drops it. Fits 2-digit counts
  // (Masterwork=10 reads fine); 3+ digit counts on these runes would clip (rare).
  const readParams = { stripWidth: 12 };
  // Inner frame corner of each slot's cell (reference coordinates), measured 2026-09-26
  // on a player's 1080p and 1440p captures (calibrated from the currency cells; both sizes
  // agree within ~1 reference px). The automatic box placement starts from these and only
  // searches a few px around them - from the count centres above it had to search wide,
  // and at some cells the neighbour's frame edge won (runes at 1080p, abyss omens at 1440p).
  const CELL_CORNERS = {
    'warding-rune-of-reinforcement': [125.2, 243.0], 'warding-rune-of-protection': [188.1, 243.0],
    'warding-rune-of-disintegration': [251.5, 243.0], 'warding-rune-of-desperation': [314.4, 243.0],
    'warding-rune-of-courage': [377.8, 243.0], 'warding-rune-of-nourishment': [440.8, 243.0],
    'warding-rune-of-symbiosis': [125.2, 306.4], 'warding-rune-of-stability': [188.1, 306.4],
    'warding-rune-of-glancing': [251.5, 306.4], 'warding-rune-of-heart': [314.4, 306.4],
    'warding-rune-of-annihilation': [377.8, 306.4], 'warding-rune-of-salvaging': [440.8, 306.4],
    'warding-rune-of-armature': [156.9, 369.3], 'warding-rune-of-obsession': [219.8, 369.3],
    'warding-rune-of-equinox': [283.2, 369.3], 'warding-rune-of-bodyguards': [346.1, 369.3],
    'warding-rune-of-hollowing': [409.5, 369.3], 'ancient-rune-of-splinters': [30.0, 439.1],
    'ancient-rune-of-dueling': [93.5, 439.1], 'ancient-rune-of-the-titan': [156.4, 439.1],
    'ancient-rune-of-shattering': [219.8, 439.1], 'ancient-rune-of-prowess': [282.7, 439.1],
    'ancient-rune-of-control': [346.1, 439.1], 'ancient-rune-of-discovery': [409.1, 439.1],
    'ancient-rune-of-decay': [472.5, 439.1], 'ancient-rune-of-witchcraft': [535.4, 439.1],
    'ancient-rune-of-the-horde': [30.0, 502.1], 'ancient-rune-of-animosity': [93.5, 502.1],
    'ancient-rune-of-detonation': [156.4, 502.1], 'ancient-rune-of-retaliation': [219.8, 502.1],
    'rune-of-vitality': [346.1, 502.1], 'rune-of-the-hunt': [409.1, 502.1],
    'rune-of-acrobatics': [472.5, 502.1], 'rune-of-culmination': [535.4, 502.1],
    'rune-of-renown': [30.0, 565.4], 'rune-of-accumulation': [93.5, 565.4],
    'rune-of-foundations': [156.4, 565.4], 'rune-of-the-prism': [219.8, 565.4],
    'rune-of-the-blossom': [282.7, 565.4], 'rune-of-consistency': [346.1, 565.4],
    'rune-of-reach': [409.1, 565.4], 'rune-of-vital-flame': [472.5, 565.4],
    'rune-of-confrontation': [535.4, 565.4], 'passion-of-aldur': [93.5, 634.8],
    'breath-of-aldur': [156.9, 634.8], 'ire-of-aldur': [219.8, 634.8], 'betrayal-of-aldur': [283.2,
    634.8], 'serles-triumph': [346.1, 634.8], 'cadigans-epiphany': [409.5, 634.8],
    'astrids-creativity': [472.5, 634.8], 'uhtreds-sidereus': [30.5, 697.7], 'kolrs-hunt': [93.5,
    697.7], 'voranas-carnage': [156.9, 697.7], 'thruds-might': [219.8, 697.7],
    'medveds-tending': [283.2, 697.7], 'katlas-gloom': [346.1, 697.7], 'masterwork-rune': [409.5,
    697.7]
  };
  return { CELL_CORNERS, tab: 'runes-kalguuran', captureSize: { w: 1920, h: 1080 }, STATIC_SLOTS, EMPTY_STATIC_TODO, readParams };
});
