'use strict';
// Recipes tab: is it worth buying the parts, combining (or splitting at a vendor) and
// selling the result? The recipes themselves are in recipes-data.js.
//
// Everything is priced the way the Currency tab prices a pair, with its own functions
// (renderer.js): the exchange rate of each part against the recipe's currency, your own
// rate where you set one ("Kurs fixieren" - the same overrides, the same editor), the
// traded volume as the "can I actually get this" signal, and the 7-day history from the
// feed as the trend. Gold is Ange's fee per item received, like in arbitrage routes.
(function () {
  const $ = (id) => document.getElementById(id);
  const RD = window.RecipesData;
  const BASES = ['exalted', 'chaos', 'divine'];
  const state = { sel: null, fixOpen: false };
  try { state.sel = localStorage.getItem('recipes.sel'); } catch {}

  const recipes = () => RD.allRecipes();
  const recipeById = (id) => recipes().find((r) => r.id === id) || null;
  const baseOf = (r) => (config.recipeBases && config.recipeBases[r.id]) || r.base;
  const roundsOf = (r) => Math.max(1, (config.recipeRounds && config.recipeRounds[r.id]) || 1);
  const iconOf = (id) => {
    const c = catalog[id];
    return c && c.icon ? `<img class="rc-ic" src="${esc(c.icon)}" alt="">` : '<span class="rc-ic"></span>';
  };
  const unitOf = (id) => tierAbbr(id);
  // the three pricing currencies by the short names players use in every language
  const BASE_SHORT = { exalted: 'itemtab.currency.unit_ex', chaos: 'itemtab.currency.unit_chaos', divine: 'itemtab.currency.unit_div' };
  const baseShort = (b) => (BASE_SHORT[b] ? t(BASE_SHORT[b]) : unitOf(b));

  // price of 1 `id` in base units: your rate / live / exchange (pairVal), else the
  // smoothed market values of both (≈), else nothing
  function priceIn(id, base) {
    if (id === base) return { v: 1, src: 'same' };
    const own = ovrRate(id, base) != null;
    const pv = pairVal(id, base);
    if (pv > 0) return { v: pv, src: own ? 'own' : (pairIsCurrent(id, base) ? 'pair' : 'stale') };
    const a = catalog[id], b = catalog[base];
    if (a && b && a.price > 0 && b.price > 0) return { v: a.price / b.price, src: 'cross' };
    return { v: null, src: 'none' };
  }
  // position in the last 7 days and the change since their start - a trend, not a forecast
  function trendOf(id) {
    const c = catalog[id];
    const pts = ((c && c.logs) || []).map((l) => l.p).filter((p) => p > 0);
    if (pts.length < 3) return null;
    const cur = c.price > 0 ? c.price : pts[pts.length - 1];
    const lo = Math.min(...pts, cur), hi = Math.max(...pts, cur);
    const pos = hi > lo ? (cur - lo) / (hi - lo) : 0.5;
    const start = (pts[0] + pts[1] + pts[2]) / 3;
    const ch = (cur / start - 1) * 100;
    return { ch, dir: ch > 5 ? 'up' : ch < -5 ? 'down' : 'flat', near: pos <= 0.2 ? 'low' : pos >= 0.8 ? 'high' : null };
  }

  // the whole calculation for one recipe at its currency and rounds
  function evaluate(r) {
    const base = baseOf(r), rounds = roundsOf(r);
    const line = (p, role) => {
      const pr = priceIn(p.id, base);
      const liq = p.id === base ? null : pairLiquidity(p.id, base);
      return { id: p.id, n: p.n, role, price: pr.v, src: pr.src, total: pr.v != null ? pr.v * p.n : null, liq, trend: trendOf(p.id) };
    };
    const ins = r.inputs.map((p) => line(p, 'in'));
    const outs = r.outputs.map((p) => line(p, 'out'));
    const complete = ins.concat(outs).every((l) => l.price != null);
    const cost = ins.reduce((s, l) => s + (l.total || 0), 0);
    const revenue = outs.reduce((s, l) => s + (l.total || 0), 0);
    const profit = revenue - cost;
    // gold: every bought part is an item received; the sale pays out in base units
    const partsBought = ins.filter((l) => l.id !== base).reduce((s, l) => s + l.n, 0) * rounds;
    const saleUnits = outs.some((l) => l.id !== base) ? Math.ceil(revenue * rounds) : 0;
    const gold = (partsBought + saleUnits) * GOLD_PER_ITEM;
    // the thinnest leg decides how much of this can really be done
    let thin = null;
    for (const l of ins.concat(outs)) if (l.liq && (!thin || l.liq.units < thin.liq.units)) thin = l;
    return { r, base, rounds, ins, outs, complete, cost, revenue, profit, pct: cost > 0 ? profit / cost * 100 : null, gold, thin };
  }

  const srcMark = (src) => ({ own: '✎', stale: '⚠', cross: '≈' }[src] || '');
  function srcTitle(src) {
    return t({ own: 'recipes.src_own', stale: 'recipes.src_stale', cross: 'recipes.src_cross', none: 'recipes.src_none' }[src] || 'recipes.src_pair');
  }
  function trendHtml(tr) {
    if (!tr) return '<span class="rc-dim">–</span>';
    const arrow = tr.dir === 'up' ? '↗' : tr.dir === 'down' ? '↘' : '→';
    const cls = tr.dir === 'up' ? 'up' : tr.dir === 'down' ? 'down' : '';
    const near = tr.near ? ` · ${esc(t(tr.near === 'low' ? 'recipes.trend_low' : 'recipes.trend_high'))}` : '';
    return `<span class="${cls}" title="${esc(t('recipes.trend_title'))}">${arrow} ${tr.ch >= 0 ? '+' : ''}${tr.ch.toFixed(0)} %${near}</span>`;
  }
  function formulaText(r) {
    const side = (ps) => ps.map((p) => `${p.n} ${nameOf(p.id)}`).join(' + ');
    return r.group === 'split'
      ? t('recipes.formula_split', { from: side(r.inputs), to: side(r.outputs) })
      : t('recipes.formula_combine', { from: side(r.inputs), to: side(r.outputs) });
  }
  const titleOf = (r) => nameOf(r.group === 'split' ? r.inputs[0].id : r.outputs[0].id);

  // the rounds + result block (patched in place while the rounds box is typed into)
  function sumHtml(ev) {
    if (!ev.complete) return `<div class="rc-sum"><div class="rc-dim">${esc(t('recipes.no_prices'))}</div></div>`;
    const B = baseShort(ev.base);
    const R = ev.rounds;
    const good = ev.profit > 0;
    const sign = ev.profit >= 0 ? '+' : '';
    return `<div class="rc-sum">`
      + `<div class="rc-sum-row"><span>${esc(t('recipes.cost'))}</span><span>${fmt(ev.cost)} ${esc(B)}</span></div>`
      + `<div class="rc-sum-row"><span>${esc(t('recipes.revenue'))}</span><span>${fmt(ev.revenue)} ${esc(B)}</span></div>`
      + `<div class="rc-sum-row rc-sum-main"><span>${esc(t('recipes.profit_round'))}</span><b class="${good ? 'up' : 'down'}">${sign}${fmt(ev.profit)} ${esc(B)} (${sign}${ev.pct.toFixed(1)} %)</b></div>`
      + `<div class="rc-sum-row"><span>${esc(t('recipes.profit_total', { rounds: R }))}</span><b class="${good ? 'up' : 'down'}">${sign}${fmt(ev.profit * R)} ${esc(B)}</b></div>`
      + `<div class="rc-sum-row"><span>${esc(t('recipes.gold'))}</span><span>${fmtQty(ev.gold)} ${esc(t('recipes.gold_unit'))}</span></div>`
      + `<div class="rc-verdict ${good ? 'up' : 'down'}">${esc(t(good ? 'recipes.verdict_yes' : 'recipes.verdict_no'))}</div>`
      + `</div>`;
  }
  // the "can I get this" line - the same signal as a currency route's thinnest leg
  function thinHtml(ev) {
    if (!ev.thin) return '';
    const need = ev.thin.n * ev.rounds;
    const few = ev.thin.liq.units < 50;
    return `<div class="rc-note">${esc(t('recipes.thinnest', { item: nameOf(ev.thin.id), units: fmtQty(ev.thin.liq.units), need: fmtQty(need) }))}`
      + (few ? ` <b class="down">${esc(t('recipes.thin_warn'))}</b>` : '') + `</div>`;
  }

  // one recipe in detail - also the content of the pinned window (detached: editor open)
  function cardHtml(id, detached) {
    const r = recipeById(id);
    if (!r) return '';
    const ev = evaluate(r);
    const B = ev.base;
    let h = `<div class="rc-card" data-recipe="${esc(r.id)}">`;
    h += `<div class="rc-card-head"><span class="rc-card-title">${iconOf(r.group === 'split' ? r.inputs[0].id : r.outputs[0].id)} ${esc(titleOf(r))}</span>`
      + `<span class="rc-card-btns">`
      + (detached ? '' : `<button class="tip-fix rc-fix" title="${esc(t('currency.arb.fix_rate_btn_title'))}">${t('currency.arb.fix_rate_btn')}</button>`
        + `<button class="tip-detach rc-pin" title="${esc(t('recipes.pin_title'))}">📌</button>`)
      + `</span></div>`;
    h += `<div class="rc-formula">${esc(formulaText(r))}</div>`;
    if (!detached) {
      h += `<div class="rc-basebar">${esc(t('recipes.priced_in'))} `
        + BASES.map((b) => `<button class="rc-base${b === B ? ' on' : ''}" data-base="${b}" title="${esc(nameOf(b))}">${esc(baseShort(b))}</button>`).join('')
        + `</div>`;
    }
    h += `<div class="rc-table"><div class="rc-tr rc-th"><span></span><span>${esc(t('recipes.col_item'))}</span><span>${esc(t('recipes.col_price'))}</span><span>${esc(t('recipes.col_volume'))}</span><span>${esc(t('recipes.col_trend'))}</span></div>`;
    for (const l of ev.ins.concat(ev.outs)) {
      const role = l.role === 'in' ? t('recipes.role_buy') : t('recipes.role_sell');
      h += `<div class="rc-tr"><span class="rc-role">${esc(role)}</span>`
        + `<span>${iconOf(l.id)} ${l.n}× ${esc(nameOf(l.id))}</span>`
        // compact "4.10 div"; the game-style phrasing and the source on hover
        + `<span title="${esc((l.price != null ? phraseText(l.price, nameOf(l.id), nameOf(B)) + ' · ' : '') + srcTitle(l.src))}">${l.price != null ? `${fmt(l.price)} ${esc(baseShort(B))}` : '–'} ${srcMark(l.src)}</span>`
        + `<span>${l.liq ? fmtQty(l.liq.units) + '/h' : '–'}</span>`
        + `<span>${trendHtml(l.trend)}</span></div>`;
    }
    h += `</div>`;
    h += `<div class="rc-rounds-row"><label>${esc(t('recipes.rounds'))} <input class="tip-gold-qty rc-rounds" type="text" inputmode="numeric" value="${ev.rounds}"></label>`
      + `<span class="rc-dim">${esc(t(r.group === 'split' ? 'recipes.how_split' : 'recipes.how_combine'))}</span></div>`;
    h += sumHtml(ev);
    h += thinHtml(ev);
    // rate editor: one leg per part against the recipe's currency, same as a route's
    if (detached || state.fixOpen) {
      const ctx = { baseId: B, itemId: r.outputs[0].id, acqOptions: [],
        route: { legPairs: r.inputs.concat(r.outputs).filter((p) => p.id !== B).map((p) => ({ have: p.id, want: B })) } };
      h += `<div class="tip-out">${fixSectionHtml(ctx)}</div>`;
    }
    h += `</div>`;
    return h;
  }

  function overviewHtml() {
    const evs = recipes().map(evaluate);
    const groups = [['combine', t('recipes.group_combine')], ['split', t('recipes.group_split')]];
    let h = '<div class="rc-list">';
    for (const [g, label] of groups) {
      const rows = evs.filter((e) => e.r.group === g)
        .sort((a, b) => (b.pct == null ? -1e9 : b.pct) - (a.pct == null ? -1e9 : a.pct));
      if (!rows.length) continue;
      h += `<div class="rc-group">${esc(label)}</div>`;
      for (const e of rows) {
        const sel = e.r.id === state.sel ? ' sel' : '';
        const pct = e.pct == null ? '–' : `${e.pct >= 0 ? '+' : ''}${e.pct.toFixed(1)} %`;
        h += `<div class="rc-row${sel}" data-recipe="${esc(e.r.id)}">${iconOf(e.r.group === 'split' ? e.r.inputs[0].id : e.r.outputs[0].id)}`
          + `<span class="rc-row-name">${esc(titleOf(e.r))}</span>`
          + `<span class="rc-row-pct ${e.pct > 0 ? 'up' : e.pct != null ? 'down' : ''}">${pct}</span></div>`;
      }
    }
    return h + '</div>';
  }

  function render() {
    const root = $('recipes-root');
    if (!root) return;
    if (window.sendRecipeDetached) window.sendRecipeDetached(); // pinned card follows new rates
    if (root.classList.contains('hidden')) return;
    if (typeof catalog === 'undefined' || !Object.keys(catalog).length) { root.innerHTML = `<div class="rc-wrap rc-dim">${esc(t('recipes.loading'))}</div>`; return; }
    if (!recipeById(state.sel)) state.sel = recipes()[0].id;
    const f = document.activeElement && root.contains(document.activeElement) ? document.activeElement : null;
    const focusRounds = f && f.classList.contains('rc-rounds');
    root.innerHTML = `<div class="rc-wrap">${overviewHtml()}${cardHtml(state.sel, false)}</div>`;
    if (focusRounds) { const el = root.querySelector('.rc-rounds'); if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); } }
  }

  function savePrefs() { try { window.api.setRecipePrefs({ bases: config.recipeBases || {}, rounds: config.recipeRounds || {} }); } catch {} }
  function setRounds(id, raw) {
    const n = parseInt(String(raw).replace(/[^0-9]/g, ''), 10);
    config.recipeRounds = Object.assign({}, config.recipeRounds, { [id]: Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 1 });
    savePrefs();
    render();
  }

  // ---- events (the tab; the pinned window sends the same things as actions) ----
  function wire() {
    const root = $('recipes-root');
    if (!root || root._wired) return;
    root._wired = true;
    root.addEventListener('click', (e) => {
      const row = e.target.closest('.rc-row');
      if (row) { state.sel = row.dataset.recipe; state.fixOpen = false; try { localStorage.setItem('recipes.sel', state.sel); } catch {} render(); return; }
      const base = e.target.closest('.rc-base');
      if (base) {
        config.recipeBases = Object.assign({}, config.recipeBases, { [state.sel]: base.dataset.base });
        savePrefs(); render(); return;
      }
      if (e.target.closest('.rc-fix')) { state.fixOpen = !state.fixOpen; render(); return; }
      if (e.target.closest('.rc-pin')) { if (window.openRecipeDetached) window.openRecipeDetached(state.sel); return; }
      const clr = e.target.closest('.tip-fix-clear');
      if (clr) { const r = clr.closest('.tip-fix-row'); clearRateInput(r.dataset.a, r.dataset.b); }
    });
    root.addEventListener('keydown', (e) => {
      const inp = e.target.closest && e.target.closest('.tip-fix-in');
      if (!inp) return;
      e.stopPropagation(); // Esc on the document would hide the overlay
      if (e.key === 'Escape') { inp.blur(); return; }
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const r = inp.closest('.tip-fix-row');
      applyRateInput(r.dataset.a, r.dataset.b, r.querySelector('[data-side="a"]').value, r.querySelector('[data-side="b"]').value);
    });
    // rounds: the result updates as you type; saved when you leave the box
    root.addEventListener('input', (e) => {
      if (!e.target.classList.contains('rc-rounds')) return;
      const r = recipeById(state.sel);
      const n = parseInt(String(e.target.value).replace(/[^0-9]/g, ''), 10);
      config.recipeRounds = Object.assign({}, config.recipeRounds, { [r.id]: Number.isFinite(n) && n > 0 ? Math.min(n, 100000) : 1 });
      const ev = evaluate(r);
      const sum = root.querySelector('.rc-sum'); if (sum) sum.outerHTML = sumHtml(ev);
      const note = root.querySelector('.rc-note'); if (note) note.outerHTML = thinHtml(ev);
    });
    root.addEventListener('change', (e) => { if (e.target.classList.contains('rc-rounds')) { savePrefs(); if (window.sendRecipeDetached) window.sendRecipeDetached(); } });
  }
  window.addEventListener('DOMContentLoaded', wire);

  window.Recipes = {
    render: () => { wire(); render(); },
    setRounds,
    detachedPayload: (id) => { const r = recipeById(id); return { title: r ? titleOf(r) : '', html: cardHtml(id, true), copyText: '' }; },
  };
})();
