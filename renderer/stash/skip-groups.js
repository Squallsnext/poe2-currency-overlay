// skip-groups.js - "Nicht mitzählen": the player's own named lists of items that Net Worth
// leaves out of the total while the list's switch is on.
//
// Why: some things stop being worth anything as a league goes on - not because nobody
// buys them, but because the player no longer SELLS them: three lesser runes become one
// normal rune, three normal ones a greater one. Counting them at their market price then
// inflates the total with value that is never realised. Un-ticking them line by line on
// every scan is tedious, so a list does it: mark the items once, flip one switch. At league
// start the switch stays off (they count); later it goes on. Any number of lists, for any
// idea ("Splitter", "Kleinkram", ...).
//
// Stored in the main config (stashSkipGroups: [{ id, name, on, items: [apiId] }]).
// Net Worth asks skippedBy(apiId) per line; the settings section and the chips on the Net
// Worth tab are rendered here.
(function () {
  'use strict';
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nameOf = (text) => (window.gameName ? window.gameName(text) : text);

  let groups = [];
  const listeners = new Set();
  let saveTimer = null;
  function changed(persist) {
    if (persist) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => { try { window.api.setStashSkipGroups(groups); } catch {} }, 250);
    }
    listeners.forEach((f) => { try { f(); } catch {} });
  }
  if (window.api && window.api.getConfig) {
    window.api.getConfig().then((c) => {
      groups = Array.isArray(c && c.stashSkipGroups) ? c.stashSkipGroups.filter((g) => g && Array.isArray(g.items)) : [];
      changed(false);
    }).catch(() => {});
  }

  // the active list that leaves this item out, or null
  function skippedBy(apiId) {
    for (const g of groups) if (g.on && g.items.includes(apiId)) return g;
    return null;
  }

  // full catalog, for picking items (names shown in the client's language)
  let catalog = null;
  async function loadCatalog() {
    if (catalog) return catalog;
    const res = await window.api.fetchCatalog();
    catalog = (res && res.groups || []).map((g) => ({
      label: g.label || g.category,
      items: (g.items || []).map((it) => ({ apiId: it.apiId, text: it.text, icon: it.icon })),
    }));
    return catalog;
  }

  // Template "lesser + normal runes": every rune family that also has a greater or perfect
  // tier (so the small ones really are upgrade fodder) - its lesser and normal tier.
  // Unique/named runes (Aldur's Legacy, Thane ... runes) have no tiers and stay out.
  function runeTemplate(cat) {
    const ids = new Set();
    for (const g of cat) for (const it of g.items) ids.add(it.apiId);
    const out = [];
    for (const id of ids) {
      const m = /^(greater|perfect)-(.+)$/.exec(id);
      if (!m) continue;
      for (const small of ['lesser-' + m[2], m[2]]) if (ids.has(small) && !out.includes(small)) out.push(small);
    }
    return out;
  }

  const newId = () => 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  let editing = null; // id of the list whose item picker is open
  let search = '';
  let onlyMarked = false;

  // ---- Settings -> Net Worth: the lists, their switches, the picker ----
  function renderSettingsSection(root, rerender) {
    const sec = el('div', 'nw-skip');
    sec.appendChild(el('div', 'nw-skip-head', t('networth.skip.heading')));
    sec.appendChild(el('div', 'nw-skip-why', t('networth.skip.why')));
    const redraw = () => { const fresh = renderSettingsSection(root, rerender); sec.replaceWith(fresh); if (rerender) rerender(); };

    for (const g of groups) {
      const row = el('div', 'nw-skip-row');
      const lab = el('label', 'switch set-excl');
      const cbx = el('input'); cbx.type = 'checkbox'; cbx.checked = !!g.on;
      cbx.onchange = () => { g.on = cbx.checked; changed(true); redraw(); };
      lab.appendChild(cbx);
      lab.appendChild(el('span', 'sw-track'));
      lab.appendChild(el('span', 'sw-lab', esc(g.name)));
      lab.appendChild(el('span', 'set-sub', t(g.on ? 'networth.skip.state_on' : 'networth.skip.state_off', { n: g.items.length })));
      row.appendChild(lab);
      const btns = el('div', 'nw-skip-btns');
      const ed = el('button', 'set-login-btn', t(editing === g.id ? 'networth.skip.done' : 'networth.skip.edit'));
      ed.onclick = () => { editing = editing === g.id ? null : g.id; search = ''; onlyMarked = false; redraw(); };
      btns.appendChild(ed);
      const del = el('button', 'set-login-btn', t('networth.skip.delete'));
      del.onclick = () => {
        if (!confirm(t('networth.skip.delete_confirm', { name: g.name }))) return;
        groups = groups.filter((x) => x !== g); if (editing === g.id) editing = null;
        changed(true); redraw();
      };
      btns.appendChild(del);
      row.appendChild(btns);
      sec.appendChild(row);
      if (editing === g.id) sec.appendChild(editor(g, redraw));
    }

    const add = el('div', 'nw-skip-add');
    const nb = el('button', 'set-login-btn', t('networth.skip.new'));
    nb.onclick = () => {
      const g = { id: newId(), name: t('networth.skip.new_name', { n: groups.length + 1 }), on: false, items: [] };
      groups.push(g); editing = g.id; search = ''; onlyMarked = false;
      changed(true); redraw();
    };
    add.appendChild(nb);
    const tb = el('button', 'set-login-btn', t('networth.skip.template_runes'));
    tb.title = t('networth.skip.template_runes_title');
    tb.onclick = async () => {
      let cat; try { cat = await loadCatalog(); } catch { return; }
      const g = { id: newId(), name: t('networth.skip.template_runes_name'), on: false, items: runeTemplate(cat) };
      groups.push(g); editing = g.id; search = ''; onlyMarked = true;
      changed(true); redraw();
    };
    add.appendChild(tb);
    sec.appendChild(add);
    if (!root.contains(sec)) root.appendChild(sec);
    return sec;
  }

  // item picker for one list: name, search, mark all matches, grouped checkbox list
  function editor(g, redraw) {
    const box = el('div', 'nw-skip-edit');
    const top = el('div', 'nw-skip-edit-top');
    const nm = el('input', 'nw-skip-name'); nm.type = 'text'; nm.value = g.name;
    nm.placeholder = t('networth.skip.name_placeholder');
    nm.oninput = () => { g.name = nm.value || t('networth.skip.new_name', { n: groups.indexOf(g) + 1 }); changed(true); };
    nm.onblur = () => redraw();
    top.appendChild(nm);
    const q = el('input', 'nw-skip-search'); q.type = 'search'; q.value = search;
    q.placeholder = t('networth.skip.search_placeholder');
    top.appendChild(q);
    const only = el('label', 'nw-skip-only');
    const oc = el('input'); oc.type = 'checkbox'; oc.checked = onlyMarked;
    only.appendChild(oc); only.appendChild(document.createTextNode(' ' + t('networth.skip.only_marked')));
    top.appendChild(only);
    box.appendChild(top);
    const acts = el('div', 'nw-skip-edit-acts');
    const allOn = el('button', 'set-login-btn', t('networth.skip.mark_all'));
    const allOff = el('button', 'set-login-btn', t('networth.skip.unmark_all'));
    const count = el('span', 'set-sub');
    acts.appendChild(allOn); acts.appendChild(allOff); acts.appendChild(count);
    box.appendChild(acts);
    const list = el('div', 'nw-skip-list', '…');
    box.appendChild(list);

    let visible = [];
    const draw = () => {
      if (!catalog) return;
      const needle = search.trim().toLowerCase();
      const set = new Set(g.items);
      list.innerHTML = ''; visible = [];
      for (const grp of catalog) {
        const hits = grp.items.filter((it) => {
          if (onlyMarked && !set.has(it.apiId)) return false;
          if (!needle) return true;
          return nameOf(it.text).toLowerCase().includes(needle) || String(it.text).toLowerCase().includes(needle) || nameOf(grp.label).toLowerCase().includes(needle);
        });
        if (!hits.length) continue;
        list.appendChild(el('div', 'nw-skip-cat', esc(nameOf(grp.label))));
        for (const it of hits) {
          visible.push(it.apiId);
          const r = el('label', 'nw-skip-item');
          const c = el('input'); c.type = 'checkbox'; c.checked = set.has(it.apiId);
          c.onchange = () => {
            if (c.checked) { if (!g.items.includes(it.apiId)) g.items.push(it.apiId); } else g.items = g.items.filter((x) => x !== it.apiId);
            count.textContent = t('networth.skip.count', { n: g.items.length });
            changed(true);
          };
          r.appendChild(c);
          if (it.icon) { const img = el('img', 'nw-skip-ic'); img.src = it.icon; img.onerror = () => img.remove(); r.appendChild(img); }
          r.appendChild(el('span', null, esc(nameOf(it.text))));
          list.appendChild(r);
        }
      }
      if (!visible.length) list.appendChild(el('div', 'set-sub', t('networth.skip.no_hits')));
      count.textContent = t('networth.skip.count', { n: g.items.length });
    };
    q.oninput = () => { search = q.value; draw(); };
    oc.onchange = () => { onlyMarked = oc.checked; draw(); };
    allOn.onclick = () => { for (const id of visible) if (!g.items.includes(id)) g.items.push(id); changed(true); draw(); };
    allOff.onclick = () => { const v = new Set(visible); g.items = g.items.filter((x) => !v.has(x)); changed(true); draw(); };
    loadCatalog().then(draw).catch(() => { list.textContent = t('networth.skip.catalog_failed'); });
    return box;
  }

  // ---- chips on the Net Worth tab: every list with its switch, always visible ----
  function chips(onToggle) {
    if (!groups.length) return null;
    const bar = el('div', 'nw-skip-chips');
    bar.appendChild(el('span', 'nw-skip-chips-lab', t('networth.skip.chips_label')));
    for (const g of groups) {
      const c = el('button', 'nw-skip-chip' + (g.on ? ' nw-skip-chip-on' : ''), (g.on ? '⊘ ' : '✓ ') + esc(g.name));
      c.title = t(g.on ? 'networth.skip.chip_on_title' : 'networth.skip.chip_off_title', { n: g.items.length });
      c.onclick = () => { g.on = !g.on; changed(true); if (onToggle) onToggle(); };
      bar.appendChild(c);
    }
    return bar;
  }

  window.NwSkipGroups = { skippedBy, renderSettingsSection, chips, onChange: (f) => listeners.add(f) };
})();
