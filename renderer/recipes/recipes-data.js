'use strict';
// Recipes: what can be turned into what, shared by main (which pairs/categories to fetch)
// and the renderer (the Recipes tab, and vendor splits in currency arbitrage).
//
// Two kinds:
//  - combine: several parts become one item (Origin Cradle + Origin Spark = Origin Core)
//  - split:   a vendor splits a higher tier into 3 of the tier below, free of charge -
//             never upwards, tiers cannot be combined (Perfect -> 3 Greater -> 3 normal).
// A recipe is "buy the inputs, do it, sell the outputs". New ideas are one more entry
// in COMBINES (or one more family in TIER_FAMILIES) - nothing else needs to change.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RecipesData = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  // lowest tier first; ids are the exchange apiIds
  const TIER_FAMILIES = [
    ['transmute', 'greater-orb-of-transmutation', 'perfect-orb-of-transmutation'],
    ['aug', 'greater-orb-of-augmentation', 'perfect-orb-of-augmentation'],
    ['regal', 'greater-regal-orb', 'perfect-regal-orb'],
    ['exalted', 'greater-exalted-orb', 'perfect-exalted-orb'],
    ['chaos', 'greater-chaos-orb', 'perfect-chaos-orb'],
  ];
  const DISENCHANT_YIELD = 3;

  // base = the currency the recipe is priced in by default (the player can switch)
  const COMBINES = [
    {
      id: 'origin-core', group: 'combine', base: 'divine', category: 'fragments',
      inputs: [{ id: 'origin-cradle', n: 1 }, { id: 'origin-spark', n: 1 }],
      outputs: [{ id: 'origin-core', n: 1 }],
    },
  ];

  // one split recipe per tier step: Perfect -> 3 Greater, Greater -> 3 normal
  function splitRecipes() {
    const out = [];
    for (const fam of TIER_FAMILIES) {
      for (let i = fam.length - 1; i >= 1; i--) {
        out.push({
          id: 'split-' + fam[i], group: 'split', base: i === 2 ? 'divine' : 'exalted', category: 'currency',
          inputs: [{ id: fam[i], n: 1 }],
          outputs: [{ id: fam[i - 1], n: DISENCHANT_YIELD }],
        });
      }
    }
    return out;
  }
  function allRecipes() { return COMBINES.concat(splitRecipes()); }

  // every item any recipe touches, and the price categories to load for them
  function recipeItemIds() {
    const ids = new Set();
    for (const r of allRecipes()) for (const p of r.inputs.concat(r.outputs)) ids.add(p.id);
    return [...ids];
  }
  function recipeCategories() { return [...new Set(allRecipes().map((r) => r.category))]; }

  return { TIER_FAMILIES, DISENCHANT_YIELD, COMBINES, allRecipes, recipeItemIds, recipeCategories };
});
