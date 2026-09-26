'use strict';
// slot-defaults.js - read filters shipped per resolution class, used where the player has
// not saved their own for a slot (their own always win, value by value).
// The per-slot filters (brightness, gain, contrast gate, colour limit, speck size, floor,
// local threshold) that make a count readable depend on how big the digits are drawn:
//  - 'hi' (4K/5K, the panel read per cell at >1.5x): tuned slot by slot by a player on a
//    5120x2880 screen (currency + runes tabs, exported 2026-09-26) - there the digits have
//    detail enough for strong filters to pay off;
//  - 'ref' (1080p-sized panels, 0.85-1.15x): the same player's 1080p export - near the
//    reader's own defaults (colour limit 5, specks under 12 px) for the whole currency tab;
//    the 5K values wiped out the much finer 1080p digits.
// Positions are NOT here - boxes come from the tab maps, the rule placement and the align
// tool. matchScale neither: the "high resolution" switch decides that.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (root.Stash = root.Stash || {}).slotDefaults = api;
})(typeof self !== 'undefined' ? self : this, function () {
  const FILTERS = {
    hi: {
      "currency": {
        "transmute": {"floor": 75, "desatSat": 40, "contrast": 0, "minBlob": 5, "bright": -25, "gain": 100, "satPct": 100, "localThr": 0},
        "greater-orb-of-transmutation": {"floor": 75, "desatSat": 40, "contrast": 0, "minBlob": 5, "bright": -25, "gain": 100, "satPct": 100, "localThr": 0},
        "perfect-orb-of-transmutation": {"floor": 75, "desatSat": 40, "contrast": 0, "minBlob": 5, "bright": -25, "gain": 100, "satPct": 100, "localThr": 0},
        "alch": {"floor": 60, "desatSat": 30, "contrast": 75, "minBlob": 10, "bright": -40, "gain": 105, "satPct": 140, "localThr": 65},
        "vaal": {"floor": 60, "desatSat": 30, "contrast": 75, "minBlob": 10, "bright": -40, "gain": 105, "satPct": 140, "localThr": 65},
        "annul": {"desatSat": 5, "contrast": 0, "minBlob": 18, "bright": -10, "gain": 120, "satPct": 100, "localThr": 0},
        "lesser-jewellers-orb": {"desatSat": 20, "contrast": 0, "minBlob": 18, "bright": 0, "gain": 120, "satPct": 40, "localThr": 0},
        "greater-jewellers-orb": {"desatSat": 20, "contrast": 0, "minBlob": 18, "bright": 0, "gain": 120, "satPct": 40, "localThr": 0},
        "perfect-jewellers-orb": {"desatSat": 20},
        "aug": {"floor": 75, "desatSat": 5, "contrast": 125, "minBlob": 10, "bright": 50, "gain": 100, "satPct": 150, "localThr": 0},
        "greater-orb-of-augmentation": {"floor": 75, "desatSat": 5, "contrast": 125, "minBlob": 10, "bright": 50, "gain": 100, "satPct": 150, "localThr": 0},
        "perfect-orb-of-augmentation": {"floor": 75, "desatSat": 5, "contrast": 125, "minBlob": 10, "bright": 50, "gain": 100, "satPct": 150, "localThr": 0},
        "chance": {"floor": 75, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -20, "gain": 90, "satPct": 200, "localThr": 60},
        "fracturing-orb": {"floor": 75, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -20, "gain": 90, "satPct": 200, "localThr": 60},
        "divine": {"floor": 75, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -20, "gain": 90, "satPct": 200, "localThr": 60},
        "artificers": {"floor": 75, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -20, "gain": 90, "satPct": 200, "localThr": 60},
        "regal": {"floor": 75, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -20, "gain": 90, "satPct": 200, "localThr": 60},
        "greater-regal-orb": {"floor": 75, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -20, "gain": 90, "satPct": 200, "localThr": 60},
        "perfect-regal-orb": {"floor": 75, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -20, "gain": 90, "satPct": 200, "localThr": 60},
        "etcher": {"floor": 75, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -20, "gain": 90, "satPct": 200, "localThr": 60},
        "scrap": {"floor": 75, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -20, "gain": 90, "satPct": 200, "localThr": 60},
        "whetstone": {"floor": 75, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -20, "gain": 90, "satPct": 200, "localThr": 60},
        "exalted": {"floor": 60, "desatSat": 255, "contrast": 0, "minBlob": 13, "bright": -65, "gain": 55, "satPct": 200, "localThr": 50},
        "greater-exalted-orb": {"floor": 60, "desatSat": 55, "contrast": 0, "minBlob": 12, "bright": -45, "gain": 115, "satPct": 100, "localThr": 0},
        "perfect-exalted-orb": {"floor": 60, "desatSat": 5, "contrast": 0, "minBlob": 12, "bright": -45, "gain": 115, "satPct": 100, "localThr": 0},
        "bauble": {"floor": 60, "desatSat": 5, "contrast": 0, "minBlob": 12, "bright": -40, "gain": 115, "satPct": 110, "localThr": 0},
        "gcp": {"floor": 60, "desatSat": 5, "contrast": 0, "minBlob": 12, "bright": -30, "gain": 120, "satPct": 200, "localThr": 0},
        "chaos": {"desatSat": 5},
        "greater-chaos-orb": {"desatSat": 5, "contrast": 0, "minBlob": 5, "bright": 0, "gain": 100, "satPct": 100, "localThr": 0},
        "perfect-chaos-orb": {"desatSat": 5, "contrast": 0, "minBlob": 5, "bright": 0, "gain": 100, "satPct": 100, "localThr": 0},
        "wisdom": {"desatSat": 5, "contrast": 0, "minBlob": 5, "bright": 0, "gain": 100, "satPct": 100, "localThr": 0},
        "transmutation-shard": {"desatSat": 5, "contrast": 0, "minBlob": 5, "bright": 0, "gain": 100, "satPct": 100, "localThr": 0},
        "regal-shard": {"desatSat": 5, "contrast": 0, "minBlob": 5, "bright": 0, "gain": 100, "satPct": 100, "localThr": 0},
        "chance-shard": {"desatSat": 5, "contrast": 0, "minBlob": 5, "bright": 0, "gain": 100, "satPct": 100, "localThr": 0},
        "artificers-shard": {"desatSat": 5, "contrast": 0, "minBlob": 5, "bright": 0, "gain": 100, "satPct": 100, "localThr": 0},
        "exalted-2": {"floor": 100, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -45, "gain": 75, "satPct": 110, "localThr": 50},
        "exalted-3": {"floor": 100, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -45, "gain": 75, "satPct": 110, "localThr": 50},
        "exalted-4": {"floor": 100, "desatSat": 5, "contrast": 0, "minBlob": 13, "bright": -45, "gain": 75, "satPct": 110, "localThr": 50},
      },
      "runes": {
        "lesser-desert-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "desert-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-desert-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-glacial-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "glacial-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-glacial-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-storm-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "storm-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-storm-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-iron-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "iron-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-iron-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-body-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "body-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-body-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-mind-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 75, "satPct": 10, "localThr": 0},
        "mind-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-mind-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-vision-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "vision-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-vision-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-rebirth-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "rebirth-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-rebirth-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-inspiration-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "inspiration-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-inspiration-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-robust-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "robust-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-robust-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-adept-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "adept-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-adept-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-resolve-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "resolve-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-resolve-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-stone-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "stone-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-stone-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lesser-ward-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "ward-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-ward-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "charging-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-charging-rune": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-rune-of-leadership": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-rune-of-tithing": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-rune-of-alacrity": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "greater-rune-of-nobility": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "farruls-rune-of-the-hunt": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "thane-myrks-rune-of-summer": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "lady-hestras-rune-of-winter": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "thane-lelds-rune-of-spring": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "fenumus-rune-of-agony": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "thane-girts-rune-of-wildness": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "hedgewitch-assandras-rune-of-wisdom": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "saqawals-rune-of-the-sky": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "the-greatwolfs-rune-of-willpower": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "craiceanns-rune-of-recovery": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "craiceanns-rune-of-warding": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "countess-seskes-rune-of-archery": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "saqawals-rune-of-erosion": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "saqawals-rune-of-memory": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "the-greatwolfs-rune-of-claws": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "courtesan-mannans-rune-of-cruelty": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "thane-grannells-rune-of-mastery": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "fenumus-rune-of-spinning": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "fenumus-rune-of-draining": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "farruls-rune-of-grace": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
        "farruls-rune-of-the-chase": {"floor": 80, "desatSat": 5, "contrast": 125, "minBlob": 17, "bright": -10, "gain": 85, "satPct": 10, "localThr": 0},
      },
    },
    ref: {
      currency: { '*': { desatSat: 5, minBlob: 12 } },
    },
  };
  const FILTER_KEYS = ['floor', 'desatSat', 'contrast', 'minBlob', 'bright', 'gain', 'satPct', 'localThr'];
  // scale = panel height / reference height (1 = 1080p at UI 100%)
  function classOf(scale) {
    if (scale > 1.5) return 'hi';
    if (Math.abs(scale - 1) <= 0.15) return 'ref';
    return null;
  }
  function filtersFor(scale, tab, apiId) {
    const c = classOf(scale);
    const t = c && FILTERS[c][tab];
    return (t && (t[apiId] || t['*'])) || null;
  }
  // the player's own override with the shipped filters under it (theirs win per value)
  function withDefaults(ov, scale, tab, apiId) {
    const d = filtersFor(scale, tab, apiId);
    if (!d) return ov;
    const out = Object.assign({}, d, ov || {});
    return out;
  }
  return { FILTERS, FILTER_KEYS, classOf, filtersFor, withDefaults };
});
