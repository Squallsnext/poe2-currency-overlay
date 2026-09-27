'use strict';
// Swap tab ("Tauschen"): I have currency A, I want currency B - which way is cheapest?
// Asked for: "I need Divine and have lots of Chaos - do I buy Exalted with Chaos and then
// Divine? This thinking around three corners breaks me." The tab does that thinking:
// the direct trade and every way through one of the major currencies, cheapest first,
// written out as the trades to make in game, with how much each takes.
//
// Priced exactly like the Currency tab and the Recipes tab, with their functions
// (renderer.js): pairVal = your fixed rate, else the live order book, else GGG's
// exchange; pairLiquidity = what traded in the last hour; legStr = the rate as the game
// shows it (whole numbers); Ange's gold fee per item received.
(function () {
  const $ = (id) => document.getElementById(id);
  const state = { have: 'chaos', want: 'divine', amt: '10', side: 'want' };
  try { Object.assign(state, JSON.parse(localStorage.getItem('swap.state') || '{}')); } catch {}
  const save = () => { try { localStorage.setItem('swap.state', JSON.stringify(state)); } catch {} };

  const iconOf = (id) => {
    const c = catalog[id];
    return c && c.icon ? `<img class="rc-ic" src="${esc(c.icon)}" alt="">` : '<span class="rc-ic"></span>';
  };
  const num = (s) => { const v = parseFloat(String(s || '').replace(',', '.')); return Number.isFinite(v) && v > 0 ? v : null; };
  const fmtN = (v) => (v >= 100 ? Math.round(v).toLocaleString() : v >= 10 ? (Math.round(v * 10) / 10).toLocaleString() : (Math.round(v * 100) / 100).toLocaleString());

  // every currency that trades against at least one major, majors first, then by name
  function currencies() {
    const out = [];
    for (const id of Object.keys(catalog)) {
      if (MAJORS.includes(id)) continue;
      if (MAJORS.some((m) => pairVal(id, m) > 0)) out.push(id);
    }
    out.sort((a, b) => nameOf(a).localeCompare(nameOf(b)));
    return MAJORS.filter((m) => catalog[m]).concat(out);
  }

  // All ways from `have` to `want`: direct, and through each major M (have -> M -> want).
  // cost = how many `have` one `want` takes along that way.
  function routes(have, want) {
    const out = [];
    const direct = pairVal(want, have);
    if (direct > 0) out.push({ via: null, cost: direct, legs: [{ from: have, to: want, rate: 1 / direct }] });
    for (const m of MAJORS) {
      if (m === have || m === want) continue;
      const a = pairVal(m, have), b = pairVal(want, m); // 1 M in have, 1 want in M
      if (!(a > 0) || !(b > 0)) continue;
      out.push({ via: m, cost: a * b, legs: [{ from: have, to: m, rate: 1 / a }, { from: m, to: want, rate: 1 / b }] });
    }
    return out.sort((p, q) => p.cost - q.cost);
  }

  // amounts along a route: start with `give` of `have`, each leg converts at its rate
  function walk(route, give) {
    let q = give, gold = 0;
    const legs = route.legs.map((l) => {
      const got = q * l.rate;
      gold += Math.ceil(got) * GOLD_PER_ITEM;
      const liq = pairLiquidity(l.from, l.to);
      const leg = { ...l, give: q, got, liq, own: ovrRate(l.to, l.from) != null || ovrRate(l.from, l.to) != null, stale: !pairIsCurrent(l.from, l.to) };
      q = got;
      return leg;
    });
    return { legs, got: q, gold };
  }

  function thinOf(leg) {
    if (!leg.liq) return null;
    // pairLiquidity(a, b): units = traded units of a, other = of b (last hour)
    const recv = pairLiquidity(leg.to, leg.from);
    const units = recv && recv.units;
    if (!(units > 0)) return null;
    return leg.got > units / 4 ? units : null;
  }

  function render() {
    const root = $('swap-root');
    if (!root || root.classList.contains('hidden')) return;
    if (typeof catalog === 'undefined' || !Object.keys(catalog).length) { root.innerHTML = `<div class="rc-wrap rc-dim">${esc(t('swap.loading'))}</div>`; return; }
    const focusAmt = document.activeElement && document.activeElement.classList.contains('sw-amt');
    const list = currencies();
    const opt = (sel) => list.map((id) => `<option value="${esc(id)}"${id === sel ? ' selected' : ''}>${esc(nameOf(id))}</option>`).join('');
    const form = `<div class="sw-form">
      <label class="sw-lab">${esc(t('swap.have'))}</label>
      <select class="sw-sel" data-k="have">${opt(state.have)}</select>
      <button class="sw-flip" title="${esc(t('swap.flip'))}">⇄</button>
      <label class="sw-lab">${esc(t('swap.want'))}</label>
      <select class="sw-sel" data-k="want">${opt(state.want)}</select>
      <div class="sw-amtrow">
        <select class="sw-side">
          <option value="want"${state.side === 'want' ? ' selected' : ''}>${esc(t('swap.side_want'))}</option>
          <option value="give"${state.side === 'give' ? ' selected' : ''}>${esc(t('swap.side_give'))}</option>
        </select>
        <input class="sw-amt" type="text" inputmode="decimal" value="${esc(state.amt)}">
        <span class="sw-unit">${esc(nameOf(state.side === 'want' ? state.want : state.have))}</span>
      </div>
    </div>`;
    root.innerHTML = `<div class="rc-wrap sw-wrap">${form}${resultHtml()}</div>`;
    if (focusAmt) { const el = root.querySelector('.sw-amt'); el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }

  function resultHtml() {
    const { have, want } = state;
    if (have === want) return `<div class="sw-note rc-dim">${esc(t('swap.same'))}</div>`;
    const rs = routes(have, want);
    if (!rs.length) return `<div class="sw-note rc-dim">${esc(t('swap.none', { have: nameOf(have), want: nameOf(want) }))}</div>`;
    const amt = num(state.amt) || 1;
    // give = how much `have` to spend; with "I want N", N * cost of the route
    // you hand over whole orbs - "I need 10 Div" at 8.21 each is 83 Chaos, not 82.1
    const giveFor = (r) => (state.side === 'want' ? Math.ceil(amt * r.cost - 1e-9) : amt);
    const direct = rs.find((r) => !r.via);
    const best = rs[0];
    let html = '';
    rs.forEach((r, i) => {
      const w = walk(r, giveFor(r));
      const isBest = i === 0;
      const head = r.via ? t('swap.route_via', { via: nameOf(r.via) }) : t('swap.route_direct');
      const total = state.side === 'want'
        ? t('swap.total_want', { give: fmtN(w.legs[0].give), have: nameOf(have), got: fmtN(w.got), want: nameOf(want) })
        : t('swap.total_give', { give: fmtN(w.legs[0].give), have: nameOf(have), got: fmtN(w.got), want: nameOf(want) });
      let cmp = '';
      if (direct && r !== direct) {
        const pct = (direct.cost - r.cost) / direct.cost * 100;
        const diffHave = state.side === 'want' ? (direct.cost - r.cost) * amt : null;
        cmp = pct > 0.05
          ? `<span class="up">${esc(t('swap.cheaper', { pct: pct.toFixed(1) }))}${diffHave ? esc(' · ' + t('swap.saves', { n: fmtN(diffHave), have: nameOf(have) })) : ''}</span>`
          : `<span class="down">${esc(t('swap.dearer', { pct: (-pct).toFixed(1) }))}</span>`;
      }
      const steps = w.legs.map((l, k) => {
        const thin = thinOf(l);
        const marks = (l.own ? ' <span class="sw-mark" title="' + esc(t('swap.own_rate')) + '">✎</span>' : '')
          + (l.stale ? ' <span class="sw-mark" title="' + esc(t('swap.stale_rate')) + '">⚠</span>' : '')
          + (thin ? ` <span class="sw-thin" title="${esc(t('swap.thin_title', { units: fmtQty(thin), item: nameOf(l.to) }))}">${esc(t('swap.thin'))}</span>` : '');
        return `<li class="sw-step">${iconOf(l.from)}<b>${esc(fmtN(l.give))}</b> ${esc(nameOf(l.from))} → ${iconOf(l.to)}<b>${esc(fmtN(l.got))}</b> ${esc(nameOf(l.to))}
          <span class="sw-rate">${esc(t('swap.rate', { r: legStr(nameOf(l.from), nameOf(l.to), l.rate) }))}</span>${marks}</li>`;
      }).join('');
      html += `<div class="sw-route${isBest ? ' sw-best' : ''}">
        <div class="sw-rhead">${isBest ? '<span class="sw-star">★</span> ' : ''}<b>${esc(head)}</b>
          <span class="sw-cost">${esc(t('swap.per_unit', { n: fmtN(r.cost), have: nameOf(have), want: nameOf(want) }))}</span> ${cmp}</div>
        <ol class="sw-steps">${steps}</ol>
        <div class="sw-total">${esc(total)} <span class="rc-dim">· ${esc(t('swap.gold', { g: fmtQty(w.gold) }))}</span></div>
      </div>`;
    });
    const tip = best.via
      ? t('swap.verdict_via', { via: nameOf(best.via), have: nameOf(have), want: nameOf(want) })
      : t('swap.verdict_direct', { have: nameOf(have), want: nameOf(want) });
    return `<div class="sw-verdict">${esc(tip)}</div>${html}<div class="sw-foot rc-dim">${esc(t('swap.foot'))}</div>`;
  }

  function wire() {
    const root = $('swap-root');
    if (!root || root._wired) return;
    root._wired = true;
    root.addEventListener('change', (e) => {
      const k = e.target.dataset && e.target.dataset.k;
      if (k) { state[k] = e.target.value; save(); render(); return; }
      if (e.target.classList.contains('sw-side')) { state.side = e.target.value; save(); render(); }
    });
    root.addEventListener('input', (e) => {
      if (!e.target.classList.contains('sw-amt')) return;
      state.amt = e.target.value; save(); render();
    });
    root.addEventListener('click', (e) => {
      if (e.target.closest('.sw-flip')) { const h = state.have; state.have = state.want; state.want = h; save(); render(); }
    });
  }
  window.addEventListener('DOMContentLoaded', wire);
  window.Swap = { render: () => { wire(); render(); }, _routes: routes };
})();
