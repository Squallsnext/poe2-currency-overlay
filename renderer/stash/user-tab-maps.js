'use strict';
// user-tab-maps.js - stash tabs the player built themselves ("Neues Fach anlegen", the
// tab builder), in the same shape as the shipped *-tab-map.js files, so the reader, the
// align tool, the tour and the box placement treat them like any other tab.
//
// Why: a new stash tab (the Fragment tab came with patch 0.5) used to mean waiting for a
// release with its map. The builder finds the cells on a capture, the player names each
// one from the item list, and the map lives in their config (stashUserTabMaps):
//   { [key]: { label, created, cells: [{ apiId, x, y, w, h }] } }   (reference coords;
//   x/y = inner top-left corner of the cell, like CELL_CORNERS)
// Keys start with "user-" so they never collide with a shipped tab.
//
// The count sits in the cell's top-left corner in every tab: the count centre of the
// shipped maps is on average (19.1, 10.9) reference px from that corner (ritual tab).
const COUNT_DX = 19.1, COUNT_DY = 10.9;

function isUserTab(key) { return typeof key === 'string' && key.startsWith('user-'); }

function build(key, def) {
  if (!def || !Array.isArray(def.cells)) return null;
  const cells = def.cells.filter((c) => c && c.apiId && Number.isFinite(c.x) && Number.isFinite(c.y));
  const STATIC_SLOTS = cells.map((c) => ({ cx: Math.round(c.x + COUNT_DX), cy: Math.round(c.y + COUNT_DY), apiId: c.apiId }));
  const CELL_CORNERS = {};
  for (const c of cells) CELL_CORNERS[c.apiId] = [+c.x.toFixed(1), +c.y.toFixed(1)];
  return { tab: key, user: true, label: def.label || key, STATIC_SLOTS, CELL_CORNERS, EMPTY_STATIC_TODO: [], captureSize: { w: 1920, h: 1080 } };
}

// "Fragmente Prüfungen" -> "user-fragmente-prufungen"
function keyFor(label, taken) {
  const base = 'user-' + (String(label || 'fach').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'fach');
  let k = base, n = 2;
  while (taken && taken[k]) k = base + '-' + n++;
  return k;
}

module.exports = { build, keyFor, isUserTab, COUNT_DX, COUNT_DY };
