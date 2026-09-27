// ninja-feed.js - poe.ninja's PoE2 exchange overview as a SECOND OPINION on prices.
// (poe.ninja/poe2/api/economy/exchange/current/overview?league=<name>&type=<type>, no
// auth.) poe.ninja builds it from GGG's own Currency Exchange; it uses the same item ids
// as poe2scout and this app ("alch", "greater-essence-of-command", ...), so no mapping.
// Each line: primaryValue (in the league's primary currency, Divine), the traded volume
// in that currency, and core.rates = how many Exalted / Chaos one Divine is.
//
// Used by main.js (sanitizeThinPrices): where the feed's price and poe.ninja's disagree
// strongly and poe.ninja has real volume behind it, poe.ninja's price is taken - reported:
// Orb of Transmutation at 0.85 Ex in the app, 2.40 in game, poe.ninja 1.51.
const https = require('https');

const UA = 'poe2-price-overlay (+https://github.com/POE2-VibeTools/poe2-currency-overlay)';
// the exchange categories poe.ninja has for PoE2 (types with no lines are harmless)
const TYPES = ['Currency', 'Fragments', 'Runes', 'Essences', 'Ritual', 'Abyss', 'Delirium', 'Breach',
  'Expedition', 'Talismans', 'SoulCores', 'Idols'];
const TTL_MS = 15 * 60_000;
const cache = new Map(); // league -> { at, map }

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    const req = https.get({ host: 'poe.ninja', path: pathname, headers: { 'User-Agent': UA, Accept: 'application/json' } }, (r) => {
      if (r.statusCode !== 200) { r.resume(); reject(new Error(`poe.ninja HTTP ${r.statusCode}`)); return; }
      let d = '';
      r.on('data', (c) => (d += c));
      r.on('end', () => { try { resolve(JSON.parse(d)); } catch (e) { reject(e); } });
    });
    req.setTimeout(15_000, () => req.destroy(new Error('poe.ninja timeout')));
    req.on('error', reject);
  });
}

// { apiId: { ex, volDiv, type } } - ex = Exalted per unit, volDiv = traded volume in Divine
async function getNinjaMap(league, force) {
  const hit = cache.get(league);
  if (!force && hit && Date.now() - hit.at < TTL_MS) return hit.map;
  const q = (t) => `/poe2/api/economy/exchange/current/overview?league=${encodeURIComponent(league)}&type=${t}`;
  const results = await Promise.allSettled(TYPES.map((t) => getJson(q(t)).then((j) => ({ t, j }))));
  const map = {};
  for (const r of results) {
    if (r.status !== 'fulfilled') continue;
    const { t, j } = r.value;
    const exPerDiv = j && j.core && j.core.rates && j.core.rates.exalted;
    if (!(exPerDiv > 0) || !Array.isArray(j.lines)) continue;
    for (const l of j.lines) {
      if (!l || !l.id || !(l.primaryValue > 0)) continue;
      map[l.id] = { ex: l.primaryValue * exPerDiv, volDiv: typeof l.volumePrimaryValue === 'number' ? l.volumePrimaryValue : 0, type: t };
    }
  }
  if (!Object.keys(map).length) throw new Error('poe.ninja: no prices');
  cache.set(league, { at: Date.now(), map });
  return map;
}

module.exports = { getNinjaMap, TYPES };
