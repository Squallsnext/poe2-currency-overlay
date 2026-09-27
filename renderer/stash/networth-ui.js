// Net Worth panel: capture currency tabs (screen-OCR in main), value them via
// the live catalog, keep a running tally. Rows are tab INSTANCES: with the
// "duplicate tabs" setting on, re-capturing a type asks replace-which / add-new,
// so streamers can track multiple same-type tabs and include/exclude each.
// Reading lives in main (staged ipc events); this module renders + tallies.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  // respect the global "Show currency icons instead of names" toggle for the ex/div units
  const unit = (name, apiId) => {
    if (window.currencyIconsOn && window.currencyIconsOn() && window.currencyIconUrl) {
      const u = window.currencyIconUrl(apiId);
      if (u) return `<img class="nw-unit-ic" src="${u}" alt="${name}" title="${name}">`;
    }
    return name;
  };
  // Numbers the way the player's language writes them (asked for: German "1.596" and
  // "3,0", not "1,596" and "3.0"). The UI language, not the OS: an English UI keeps
  // English numbers. `dec` fixes the decimals, so 3.0 stays "3,0" and not "3".
  const NUM_LOCALE = { de: 'de-DE', fr: 'fr-FR', es: 'es-ES', pt: 'pt-BR', ru: 'ru-RU' };
  const numLoc = () => NUM_LOCALE[window.I18N && window.I18N.lang && window.I18N.lang()] || 'en-US';
  const fmtNum = (n, dec) => Number(n).toLocaleString(numLoc(), { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
  const fmtEx = (n) => n == null ? t('networth.value.none') : fmtNum(Math.round(n)) + ' ' + unit(t('networth.unit.ex_label'), 'exalted');
  const fmtDiv = (n) => n == null ? null : fmtNum(n, n >= 100 ? 0 : 1) + ' ' + unit(t('networth.unit.div_label'), 'divine');
  const fmtCount = (n) => fmtNum(n);
  const fmtChaos = (n) => n == null ? null : fmtNum(n, n >= 100 ? 0 : 1) + ' ' + unit(t('networth.unit.chaos_label'), 'chaos');
  // A value in the currencies the player picked (Settings -> Net Worth: Ex / Div / Chaos,
  // any of them - asked for: "some want only Ex, or Chaos, I want all three"). The first
  // picked one is the main figure; a currency without a known rate is left out.
  const UNIT_ORDER = ['ex', 'div', 'chaos'];
  const unitsOn = () => UNIT_ORDER.filter((u) => (state.units || ['ex', 'div']).includes(u));
  function unitParts(ex, prices) {
    if (ex == null) return [fmtEx(null)];
    const out = [];
    for (const u of unitsOn()) {
      if (u === 'ex') out.push(fmtEx(ex));
      else if (u === 'div' && prices && prices.div) out.push(fmtDiv(ex / prices.div));
      else if (u === 'chaos' && prices && prices.chaos) out.push(fmtChaos(ex / prices.chaos));
    }
    return out.length ? out : [fmtEx(ex)];
  }
  // the line values as columns, one per currency (asked for: Ex under Ex, Div under Div)
  function unitCols(ex, prices) {
    const cols = [];
    for (const u of unitsOn()) {
      let v = null;
      if (u === 'ex') v = ex == null ? null : fmtEx(ex);
      else if (u === 'div') v = ex != null && prices && prices.div ? fmtDiv(ex / prices.div) : '';
      else if (u === 'chaos') v = ex != null && prices && prices.chaos ? fmtChaos(ex / prices.chaos) : '';
      cols.push(`<span class="nw-ucol nw-ucol-${u}">${v == null ? fmtEx(null) : v}</span>`);
    }
    return cols.join('');
  }
  const unitsHtml = (ex, prices) => unitParts(ex, prices).map((p, i) => `<span class="${i ? 'nw-div' : 'nw-ex'}">${p}</span>`).join(' ');

  const state = { rows: [], expanded: {}, nextId: 1, dup: false, sortLayout: false, showMissing: false, showConfidence: false, showOcrDebug: false, hiRes: false, showRel: false, calibrated: false, hotkey: 'F7', dragId: null, busy: false, phase: 'idle', pendingTab: null, queued: 0, notice: null, modal: null, wizard: null, debugRows: new Set(), dbgLine: null, tabFix: null };
  // apiId -> {rawUrl, binUrl} | 'loading', for the OCR-debug toggle. Cleared on every
  // fresh capture (see onStashCaptured below) and per-slot after a teach/forget, since
  // either changes what the NEXT fetch of that slot would show.
  const dbgImgCache = {};
  // OCR-debug "copy settings": slider values copied from one slot, to paste onto another.
  // In memory only (per app session) - pasting just moves the target's sliders, saving
  // is still an explicit "Speichern" there.
  let dbgClipboard = null;
  // Re-fetch one slot's debug preview and only then re-render - deleting the cache first
  // collapsed the panel to "…" for a moment, shifting everything below it
  // keyed by tab AND item: the same item can sit in two tabs (ritual + fragments)
  const slotKey = (tab, apiId) => tab + '|' + apiId;
  async function refreshDbgSlot(tab, apiId) {
    const k = slotKey(tab, apiId);
    try { dbgImgCache[k] = (await window.api.stashSlotDebugImage(apiId, undefined, tab)) || { ok: false }; }
    catch { dbgImgCache[k] = { ok: false }; }
    render();
  }
  // the OCR panel's magnifier: the four pictures big and pixel-sharp
  function openLoupe(imgs, note) {
    const ov = el('div', 'nw-loupe');
    const labels = [t('networth.line.loupe_1'), t('networth.line.loupe_2'), t('networth.line.loupe_3'), t('networth.line.loupe_4')];
    imgs.forEach((im, i) => {
      const row = el('div', 'nw-loupe-row');
      row.appendChild(el('div', 'nw-loupe-lab', esc(labels[i] || '')));
      const big = el('img', 'nw-loupe-img'); big.src = im.src; row.appendChild(big);
      ov.appendChild(row);
    });
    if (note) ov.appendChild(el('div', 'nw-loupe-note', esc(note)));
    ov.appendChild(el('div', 'nw-loupe-close', esc(t('networth.line.loupe_close'))));
    ov.onclick = () => ov.remove();
    document.body.appendChild(ov);
  }
  // Teaching (the row's ✓ and the panel's "learn from this image") only when the reader
  // reads the number right but UNSURE - below this confidence. A confident correct read
  // would only add a near-identical copy to the exemplar pool (the learned template is
  // the median of up to 30, so copies drown out variety instead of adding it). A WRONG
  // read is always teachable, whatever its confidence.
  // 0.85 (was 0.75): reads between 75 and 85 % were right but not taught, and staying
  // there often meant deleting templates to get a digit in (reported)
  const LEARN_BELOW = 0.85;
  // OCR-debug settings section: closed by default, opened per slot (apiId) - only the
  // one being tuned. Kept across re-renders (so a save doesn't snap it shut), not across
  // restarts.
  const dbgSettingsOpen = new Set();
  const TAB_LABEL = { currency: t('networth.tab.currency'), abyss: t('networth.tab.abyss'), essence: t('networth.tab.essence'), runes: t('networth.tab.runes'), 'runes-kalguuran': t('networth.tab.runes_kalguuran'), ritual: t('networth.tab.ritual'), soulcore: t('networth.tab.soulcore'), idol: t('networth.tab.idol'), 'ancient-augment': t('networth.tab.ancient_augment'), delirium: t('networth.tab.delirium'), breach: t('networth.tab.breach'), expedition: t('networth.tab.expedition'), fragment: t('networth.tab.fragment') };
  const MIRROR_ICON = 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lEdXBsaWNhdGUiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/26bc31680e/CurrencyDuplicate.png';

  if (window.api && window.api.getConfig) window.api.getConfig().then((c) => { state.dup = !!(c && c.stashDupTabs); state.sortLayout = !!(c && c.stashSortLayout); state.showMissing = !!(c && c.stashShowMissing); state.showConfidence = !!(c && c.stashShowConfidence); state.showOcrDebug = !!(c && c.stashShowOcrDebug); state.units = Array.isArray(c && c.stashUnits) && c.stashUnits.length ? c.stashUnits : ['ex', 'div']; state.hiRes = !!(c && c.stashHiRes); state.showRel = !!(c && c.stashShowReliability); state.calibrated = !!(c && c.stashCalibration); state.hotkey = (c && c.stashHotkey) || 'F7'; state.bannerHidden = !!(c && c.stashBannerHidden); state.confirmed = (c && c.stashConfirmed) || {}; state.growDigits = !!(c && c.stashGrowDigits); render(); }).catch(() => {});

  const rowsOfType = (tab) => state.rows.filter((r) => r.tab === tab);
  // The debug panel of a row: with the OCR-debug switch, or during a check the scan
  // offered ("Jetzt prüfen") - the switch is not needed for that (reported: turning it on,
  // rescanning, checking and turning it off again for every unsure number is too much).
  const dbgActive = (row) => (state.showOcrDebug || (state.review && state.review.rowId === row.id)) && state.debugRows.has(row.id);
  function labelFor(row) {
    const same = rowsOfType(row.tab);
    const base = TAB_LABEL[row.tab] || row.tab;
    return same.length <= 1 ? base : t('networth.row.label_with_index', { tabName: base, index: same.indexOf(row) + 1 });
  }
  // Rows land in CAPTURE order, not completion order. Reads run in a pool so a small tab
  // can finish before a big one grabbed earlier; main stamps each capture with a sequence
  // and the row is inserted against it.
  // The scanned rows (counts, corrections, include/exclude, order) survive a restart.
  // Before, the whole Net Worth list lived only in memory and was gone on every launch.
  // Saved on every render (every change ends in one); prices are the ones from the scan -
  // a rescan refreshes them. The captured screenshots are NOT kept (megabytes each), so
  // the debug panel and "Align" for a restored row need that tab scanned again.
  const ROWS_KEY = 'nwRows.v1';
  function persistRows() {
    try {
      localStorage.setItem(ROWS_KEY, JSON.stringify({
        nextId: state.nextId,
        rows: state.rows.map((r) => ({ id: r.id, tab: r.tab, result: r.result, included: r.included, seq: r.seq, at: r.at })),
      }));
    } catch { /* storage blocked or full - the list just won't survive a restart */ }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(ROWS_KEY) || 'null');
    if (saved && Array.isArray(saved.rows)) {
      state.rows = saved.rows.filter((r) => r && r.result && Array.isArray(r.result.lines));
      state.nextId = Math.max(saved.nextId || 1, ...state.rows.map((r) => r.id + 1), 1);
      for (const r of state.rows) state.expanded[r.id] = false;
    }
  } catch { /* unreadable - start empty */ }

  function addRow(res) {
    const row = { id: state.nextId++, tab: res.tab, result: res, included: true, seq: res.seq, at: Date.now() };
    const at = res.seq == null ? -1 : state.rows.findIndex((r) => r.seq != null && r.seq > res.seq);
    if (at < 0) state.rows.push(row); else state.rows.splice(at, 0, row);
    state.expanded[row.id] = false;
    return row;
  }
  function reorderRow(dragId, targetId, before) {
    const from = state.rows.findIndex((r) => r.id === dragId);
    if (from < 0) return;
    const [moved] = state.rows.splice(from, 1);
    let ti = state.rows.findIndex((r) => r.id === targetId);
    if (ti < 0) { state.rows.push(moved); return; }
    if (!before) ti++;
    state.rows.splice(ti, 0, moved);
  }

  // "Kalibrieren" from anywhere (settings, wizard): the settings close and the Net Worth
  // view shows what is happening - before, the result appeared behind the open settings
  // and the player waited, not knowing it was done (reported)
  function calibrateNow() {
    const settings = document.getElementById('settings');
    if (settings) settings.classList.add('hidden');
    const tabBtn = document.getElementById('tab-networth');
    if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
    state.notice = { kind: 'ok', msg: t('networth.calibrate.running') };
    render();
    try { window.api.stashCalibrateStart(); } catch {}
  }

  const learnNote = {}; // last "learn from this image" result per slot, shown in its debug panel
  // a teach the guards stopped (more digits in the picture than typed / a digit that looks
  // like another one): the next press on the same slot insists (main.js force)
  const teachForce = new Set();
  function teachWhy(res, value) {
    if (!res) return null;
    if (res.reason === 'more-digits') return t('networth.line.teach_more', { found: res.found, value: String(value) });
    if (res.reason === 'looks-like') return t('networth.line.teach_looks', { pos: res.pos, other: res.other, want: res.want, otherPct: Math.round(res.otherScore * 100), ownPct: Math.round(res.own * 100) });
    return null;
  }

  // ---------- test read right after a calibration ----------
  // The calibration says how it was measured (from the currency tab's cells, or the box
  // as dragged); the first scan after it says whether that worked: many unsure slots ->
  // "calibrate again, or correct with Align". Only for that one scan.
  function calCheckResult(res) {
    const c = state.calCheck; if (!c) return;
    state.calCheck = null;
    if (!res || !res.ok || res.mismatch) return; // applyResult already says what went wrong
    const lines = (res.lines || []).filter((ln) => !ln.missing && ln.count != null);
    const weak = lines.filter((ln) => ln.conf != null && ln.conf < 0.80).length;
    const bad = !lines.length || weak / lines.length > 0.3;
    state.notice = { kind: bad ? 'warn' : 'ok', msg: c.how + ' ' + t(bad ? 'networth.calibrate.check_bad' : 'networth.calibrate.check_ok', { tab: TAB_LABEL[res.tab] || res.tab, read: lines.length, weak }) + c.small };
    // read fine: offer the other tabs right away (the tour), or leave it
    if (!bad && !state.wizard) {
      state.notice.msg += ' ' + t('networth.calibrate.offer_tour');
      state.notice.actions = [
        { label: t('networth.tour.start'), fn: () => startTour() },
        { label: t('networth.calibrate.offer_skip'), fn: () => {}, ghost: true },
      ];
    }
    render();
  }

  // ---------- setup wizard ("Einrichtung") ----------
  // Guides a player through what a controller player (or anyone with a non-standard UI
  // size) otherwise has to discover alone: calibrate the panel, scan a tab, open "Align"
  // and put the reading boxes on the numbers, rescan and check. Each step advances on its
  // own when the thing it asks for has happened (calibrated / scanned / alignment saved),
  // so the player never has to guess whether a step "took". In memory only.
  function startWizard() {
    state.wizard = { step: 1, tab: null, lastScan: null, mismatch: false };
    const settings = document.getElementById('settings');
    if (settings) settings.classList.add('hidden');
    const tabBtn = document.getElementById('tab-networth');
    if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
    render();
  }
  function wizardOnScan(res) {
    const w = state.wizard; if (!w) return;
    if (!res || !res.ok) return;
    if (res.mismatch) { w.mismatch = true; return; }
    w.mismatch = false;
    w.tab = res.tab;
    w.lastScan = res;
    if (w.step <= 2) w.step = 3;
    else if (w.step === 4) w.step = 5;
  }
  function wizardCard() {
    const w = state.wizard;
    const card = el('div', 'nw-wizard');
    const head = el('div', 'nw-wizard-head');
    head.appendChild(el('span', 'nw-wizard-title', t('networth.wizard.title')));
    head.appendChild(el('span', 'nw-wizard-step', t('networth.wizard.step_of', { n: w.step, total: 5 })));
    const close = el('button', 'nw-wizard-x', '×');
    close.title = t('networth.wizard.close');
    close.onclick = () => { state.wizard = null; render(); };
    head.appendChild(close);
    card.appendChild(head);
    const body = el('div', 'nw-wizard-body');
    const btns = el('div', 'nw-wizard-btns');
    const btn = (label, fn, ghost) => { const b = el('button', 'nw-set-btn' + (ghost ? ' nw-set-btn-ghost' : ''), label); b.onclick = (e) => { e.stopPropagation(); fn(); }; btns.appendChild(b); return b; };
    const tabName = w.tab ? (TAB_LABEL[w.tab] || w.tab) : '';
    if (w.step === 1) {
      body.innerHTML = t('networth.wizard.s1', { tabs: esc(Object.values(TAB_LABEL).join(', ')) });
      btn(t('networth.wizard.s1_calibrate'), () => calibrateNow());
      btn(t('networth.wizard.s1_skip'), () => { w.step = 2; render(); }, true);
    } else if (w.step === 2) {
      body.innerHTML = t('networth.wizard.s2', { hotkey: esc(state.hotkey) })
        + (w.mismatch ? '<br><b>' + t('networth.wizard.s2_mismatch') + '</b>' : '');
      btn(t('networth.wizard.scan'), () => capture());
      if (w.mismatch) btn(t('networth.wizard.back_calibrate'), () => { w.step = 1; w.mismatch = false; render(); }, true);
    } else if (w.step === 3) {
      body.innerHTML = t('networth.wizard.s3', { tab: esc(tabName) });
      btn(t('networth.wizard.s3_open'), async () => {
        const r = await window.api.stashAdjustOpen(w.tab).catch(() => ({ ok: false }));
        if (!r || !r.ok) { w.step = 2; render(); } // no capture any more - scan again
      });
      btn(t('networth.wizard.s3_skip'), () => { w.step = 4; render(); }, true);
    } else if (w.step === 4) {
      body.innerHTML = t('networth.wizard.s4', { tab: esc(tabName), hotkey: esc(state.hotkey) });
      btn(t('networth.wizard.scan'), () => capture());
    } else {
      const lines = ((w.lastScan && w.lastScan.lines) || []).filter((ln) => !ln.missing);
      const weak = lines.filter((ln) => ln.conf != null && ln.conf < 0.80).length;
      body.innerHTML = t('networth.wizard.s5', { tab: esc(tabName), read: lines.length, weak })
        + '<br>' + (weak ? t('networth.wizard.s5_weak') : t('networth.wizard.s5_good'));
      if (weak && !state.showOcrDebug) {
        btn(t('networth.wizard.s5_debug'), () => {
          state.showOcrDebug = true; try { window.api.setStashShowOcrDebug(true); } catch {}
          const wr = rowsOfType(w.tab); if (wr.length) { const last = wr[wr.length - 1]; state.debugRows.add(last.id); state.expanded[last.id] = true; }
          state.showConfidence = true; try { window.api.setStashShowConfidence(true); } catch {}
          render();
        });
      }
      btn(t('networth.wizard.s5_next_tab'), () => { w.step = 2; w.tab = null; w.lastScan = null; render(); }, true);
      btn(t('networth.wizard.done'), () => { state.wizard = null; render(); }, true);
    }
    card.appendChild(body);
    card.appendChild(btns);
    return card;
  }

  function capture() {
    // no busy gate: grabs queue in main and reads run behind them, so pressing the
    // hotkey tab-after-tab is the point rather than something to guard against
    state.notice = null;
    try { window.api.stashCaptureStart(); } catch (e) { state.notice = { kind: 'err', msg: t('networth.notice.capture_unavailable') }; render(); }
  }

  // Fold a capture result into the tally. Dedup-by-type unless the duplicate
  // setting is on, in which case ask what to do when the type already exists.
  const SCAN_FLASH_MS = 4000;
  const fmtTime = (ms, sec) => new Date(ms).toLocaleTimeString(numLoc(), { hour: '2-digit', minute: '2-digit', second: sec ? '2-digit' : undefined });
  function applyResult(res) {
    // remembered so Settings can offer manual calibration only once auto-detection
    // has actually come up empty
    if (res && typeof res.autoFound === 'boolean') state.autoFound = res.autoFound;
    if (!res || !res.ok) { state.notice = { kind: 'err', msg: t('networth.notice.capture_failed', { error: res && res.error || 'unknown error' }) }; return render(); }
    if (res.mismatch) {
      // Not recognised: ask right away which tab it is - the answer pairs it from this
      // picture (like the tour) - or build it as a new tab. Before, it only said "not
      // recognised" and the pairing had to be found in the tour.
      state.notice = res.unknownKept
        ? { kind: 'warn', msg: t('networth.notice.unknown_ask'), pickTab: true }
        : { kind: 'warn', msg: t('networth.notice.mismatch', { readCount: res.readCount || 0, supportedTabs: Object.values(TAB_LABEL).join(', ') }) };
      return render();
    }
    state.notice = null;
    // a visible "scanned" (asked for: the scan is fast and quiet now - the fans used to be
    // the only sign - so during a tab-by-tab run you want to see it landed): the time
    // stays on the card; for a few seconds a green ✓ with tab and time sits in the header
    // and the card's stamp lights up
    res.scannedAt = Date.now();
    state.lastScan = { tab: res.tab, at: res.scannedAt, fresh: true };
    clearTimeout(state.scanFlashTimer);
    state.scanFlashTimer = setTimeout(() => { if (state.lastScan) state.lastScan.fresh = false; render(); }, SCAN_FLASH_MS);
    const existing = rowsOfType(res.tab);
    if (!existing.length) { addRow(res); return render(); }
    if (!state.dup) { existing[0].result = res; return render(); } // single row per type: update it
    state.modal = { res, existing };                               // duplicates on: ask
    render();
  }

  // effective per-line values, honouring manual count edits (userCount) + toggles (excluded)
  const effCount = (ln) => (ln.userCount != null ? ln.userCount : ln.count) || 0;
  // a line is left out by its own tick box, or by a switched-on "Nicht mitzählen" list
  // (skip-groups.js) that holds the item
  const skipGroup = (ln) => (window.NwSkipGroups ? window.NwSkipGroups.skippedBy(ln.priceId || ln.apiId) : null);
  const lineOn = (ln) => !ln.excluded && !skipGroup(ln);
  if (window.NwSkipGroups) window.NwSkipGroups.onChange(() => render());
  const lineVal = (ln) => (lineOn(ln) && ln.price != null) ? effCount(ln) * ln.price : 0;
  const rowTotalEx = (res) => (res.lines || []).reduce((s, ln) => s + lineVal(ln), 0);
  const rowEdited = (res) => (res.lines || []).some((ln) => ln.userCount != null);

  function grandTotals() {
    let ex = 0, divPrice = null, chaosPrice = null, mirrorPrice = null, edited = false;
    for (const r of state.rows) {
      if (!r.included) continue;
      ex += rowTotalEx(r.result);
      if (rowEdited(r.result)) edited = true;
      if (r.result.divPrice) divPrice = r.result.divPrice;
      if (r.result.chaosPrice) chaosPrice = r.result.chaosPrice;
      if (r.result.mirrorPrice) mirrorPrice = r.result.mirrorPrice;
    }
    return { ex, prices: { div: divPrice, chaos: chaosPrice }, div: divPrice ? ex / divPrice : null, mirrors: mirrorPrice && ex >= mirrorPrice ? Math.floor(ex / mirrorPrice) : null, edited };
  }
  const anyEdits = () => state.rows.some((r) => (r.result.lines || []).some((ln) => ln.userCount != null || ln.excluded));

  // Net Worth settings live in the app Settings page (Settings -> Net Worth). This fills
  // that section with the toggles + calibration; the capture-hotkey field there is static
  // HTML bound in renderer.js. Called by renderer.js when the section opens.
  function renderSettings(root) {
    if (!root) return;
    root.innerHTML = '';
    // reuse the app's native switch component so it matches the rest of Settings
    const mkToggle = (checked, label, sub, apply) => {
      const lab = el('label', 'switch set-excl');
      const cbx = el('input'); cbx.type = 'checkbox'; cbx.checked = checked;
      cbx.onchange = () => { apply(cbx.checked); renderSettings(root); render(); };
      lab.appendChild(cbx);
      lab.appendChild(el('span', 'sw-track'));
      lab.appendChild(el('span', 'sw-lab', label));
      if (sub) lab.appendChild(el('span', 'set-sub', sub));
      return lab;
    };
    const toggles = el('div', 'nw-set-toggles');
    toggles.appendChild(mkToggle(state.dup, t('networth.settings.toggle_dup_label'),
      t('networth.settings.toggle_dup_sub'),
      (v) => { state.dup = v; try { window.api.setStashDupTabs(v); } catch {} }));
    toggles.appendChild(mkToggle(state.sortLayout, t('networth.settings.toggle_sort_label'),
      t('networth.settings.toggle_sort_sub'),
      (v) => { state.sortLayout = v; try { window.api.setStashSortLayout(v); } catch {} }));
    toggles.appendChild(mkToggle(state.showMissing, t('networth.settings.toggle_missing_label'),
      t('networth.settings.toggle_missing_sub'),
      (v) => { state.showMissing = v; try { window.api.setStashShowMissing(v); } catch {} }));
    // values shown in: Ex / Div / Chaos, any of them (at least one)
    {
      const row = el('div', 'nw-units');
      row.appendChild(el('span', 'nw-units-lab', t('networth.settings.units_label')));
      for (const u of UNIT_ORDER) {
        const on = unitsOn().includes(u);
        const b = el('button', 'nw-unit-btn' + (on ? ' on' : ''), esc(t('networth.settings.unit_' + u)));
        b.onclick = () => {
          let list = unitsOn();
          list = on ? list.filter((x) => x !== u) : list.concat(u);
          if (!list.length) return; // one has to stay
          state.units = UNIT_ORDER.filter((x) => list.includes(x));
          try { window.api.setStashUnits(state.units); } catch {}
          renderSettings(root); render();
        };
        row.appendChild(b);
      }
      toggles.appendChild(row);
    }
    toggles.appendChild(mkToggle(state.showConfidence, t('networth.settings.toggle_confidence_label'),
      t('networth.settings.toggle_confidence_sub'),
      (v) => { state.showConfidence = v; try { window.api.setStashShowConfidence(v); } catch {} }));
    toggles.appendChild(mkToggle(state.showOcrDebug, t('networth.settings.toggle_ocr_debug_label'),
      t('networth.settings.toggle_ocr_debug_sub'),
      (v) => { state.showOcrDebug = v; try { window.api.setStashShowOcrDebug(v); } catch {} }));
    toggles.appendChild(mkToggle(state.showRel, t('networth.settings.toggle_rel_label'),
      t('networth.settings.toggle_rel_sub'),
      (v) => { state.showRel = v; try { window.api.setStashShowReliability(v); } catch {} render(); }));
    // one switch for every slot's matching resolution - on a slower PC one click turns
    // the (heavier) 2x read off everywhere instead of slot by slot
    toggles.appendChild(mkToggle(state.hiRes, t('networth.settings.toggle_hires_label'),
      t('networth.settings.toggle_hires_sub'),
      (v) => {
        state.hiRes = v;
        try { window.api.setStashHiRes(v); } catch {}
        for (const k of Object.keys(dbgImgCache)) delete dbgImgCache[k]; // previews re-read with the new default
      }));
    // "save the digit's edge": reader and learning both grow the digit from the hard cut
    // into the original - own learned set, so switching back loses nothing
    toggles.appendChild(mkToggle(state.growDigits, t('networth.settings.toggle_grow_label'),
      t('networth.settings.toggle_grow_sub'),
      (v) => {
        state.growDigits = v;
        try { window.api.setStashGrowDigits(v); } catch {}
        for (const k of Object.keys(dbgImgCache)) delete dbgImgCache[k];
        render();
      }));
    root.appendChild(toggles);
    if (window.NwSkipGroups) window.NwSkipGroups.renderSettingsSection(root, render);
    // Settings above, recovery tools below - the divider keeps users from reading
    // calibration/submission as steps they are meant to take. Same shape as the Reprice
    // card: the supported list first, the screenshot path for sizes NOT on it, manual
    // calibration last for sizes that ARE on it.
    root.appendChild(el('div', 'set-divider', t('ui.settings.troubleshoot_heading')));

    const res = el('div', 'set-field');
    const resIn = el('div', 'set-inline');
    resIn.appendChild(el('label', null, t('networth.settings.supported_res_label')));
    resIn.appendChild(el('span', 'set-sub', '1920×1080, 2560×1440, 5120×2880'));
    res.appendChild(resIn);
    const tabsIn = el('div', 'set-inline');
    tabsIn.appendChild(el('label', null, t('networth.settings.supported_tabs_label')));
    tabsIn.appendChild(el('span', 'set-sub', esc(Object.values(TAB_LABEL).join(', '))));
    res.appendChild(tabsIn);
    root.appendChild(res);

    // The submission's PERMANENT home. The banner on the tab can be dismissed;
    // this cannot, so the path stays reachable for whoever needs it later.
    const sub = el('div', 'set-field');
    const subIn = el('div', 'set-inline');
    subIn.appendChild(el('span', 'set-sub', t('networth.settings.shots_offer')));
    const subBtn = el('button', 'set-login-btn', t('networth.experimental.submit_button'));
    subBtn.onclick = () => {
      // the capture modal lives on the Net Worth tab, so go there
      startSampleFlow().then(() => {
        const settings = document.getElementById('settings');
        if (settings) settings.classList.add('hidden');
        const tab = document.getElementById('tab-networth');
        if (tab && !tab.classList.contains('active')) tab.click();
      });
    };
    subIn.appendChild(subBtn);
    sub.appendChild(subIn);
    root.appendChild(sub);

    // Resolution calibration is a FALLBACK, not a step - but it is always REACHABLE.
    // It used to hide unless the panel finder returned nothing, and "found something" is
    // not the same as "found it well": a capture came in with the border only 17% matched,
    // a box two pixels out, and half the counts wrong - with no way to correct it, because
    // detection had technically succeeded. Hiding it stranded exactly the people who need
    // it. It stays quiet (see .nw-set-cal.quiet) so it never reads as a required step,
    // which is what made a Linux user sit clicking the old orange button.
    const autoOk = state.autoFound !== false && !state.calibrated;
    const cal = el('div', 'nw-set-cal' + (autoOk ? ' quiet' : ''));
    const head = el('div', 'nw-set-cal-head');
    head.appendChild(el('div', 'nw-set-cal-title', t('networth.settings.cal_title')));
    head.appendChild(el('div', 'nw-set-cal-badge' + (state.calibrated ? ' on' : ''), state.calibrated ? t('networth.settings.cal_badge_calibrated') : t('networth.settings.cal_badge_default')));
    cal.appendChild(head);
    cal.appendChild(el('div', 'nw-set-cal-desc', state.calibrated
      ? t('networth.settings.cal_desc_calibrated')
      : t('networth.settings.cal_desc_default')));
    // Grouped by what it is for: the two things you do (calibrate, scan the tabs), then
    // the other ways to set up, then what support asks for. Before: six buttons in one
    // row, the everyday ones next to the support ones (reported: "aufräumen").
    const btns = el('div', 'nw-set-cal-btns');
    const group = (label, list) => {
      const row = el('div', 'nw-set-cal-row');
      if (label) row.appendChild(el('span', 'nw-set-cal-rowlab', esc(label)));
      for (const b of list) if (b) row.appendChild(b);
      btns.appendChild(row);
    };
    const mk = (label, title, fn, ghost) => { const b = el('button', 'nw-set-btn' + (ghost ? ' nw-set-btn-ghost' : ''), esc(label)); if (title) b.title = title; b.onclick = fn; return b; };
    group(null, [
      mk(t('networth.settings.cal_auto'), t('networth.settings.cal_auto_title'), () => calibrateNow()),
      mk(t('networth.tour.start'), t('networth.tour.start_title'), () => startTour()),
    ]);
    group(t('networth.settings.cal_group_more'), [
      mk(t('networth.wizard.start'), t('networth.wizard.start_title'), () => startWizard(), true),
      mk(t('networth.settings.cal_manual'), t('networth.settings.cal_manual_title'), () => { try { window.api.stashCalibrateStart({ manual: true }); } catch {} }, true),
      state.calibrated ? mk(t('networth.settings.cal_reset_button'), t('networth.settings.cal_reset_title'), () => { try { window.api.clearStashCalibration(); } catch {} state.calibrated = false; renderSettings(root); render(); }, true) : null,
      (() => {
        // everything back to the start: two clicks (the first one asks), backup first
        const b = mk(t('networth.settings.reset_all'), t('networth.settings.reset_all_title'), null, true);
        let armed = null;
        b.onclick = async () => {
          if (!armed) {
            b.textContent = t('networth.settings.reset_all_confirm');
            armed = setTimeout(() => { armed = null; b.textContent = t('networth.settings.reset_all'); }, 5000);
            return;
          }
          clearTimeout(armed); armed = null;
          const r = await window.api.stashResetSetup().catch(() => null);
          state.calibrated = false;
          state.notice = r && r.ok ? { kind: 'ok', msg: t('networth.settings.reset_all_done', { file: r.backup }) } : { kind: 'err', msg: t('networth.settings.reset_all_failed') };
          renderSettings(root); render();
        };
        return b;
      })(),
    ]);
    // the player's own tabs (tab builder): a new one from the tab open in game, and the
    // ones built so far - edit (the tab must be open in game), export, delete
    group(t('networth.builder.group'), [
      mk(t('networth.builder.new'), t('networth.builder.new_title'), () => startBuilder(null)),
    ]);
    for (const [key, label] of Object.entries(userTabs)) {
      group(label, [
        mk(t('networth.builder.edit'), t('networth.builder.edit_title'), () => startBuilder(key), true),
        mk(t('networth.builder.export'), t('networth.builder.export_title'), () => { window.api.stashBuilderExport(key).catch(() => {}); }, true),
        (() => {
          const b = mk(t('networth.builder.delete'), null, null, true);
          let armed = null;
          b.onclick = async () => {
            if (!armed) { b.textContent = t('networth.builder.delete_confirm'); armed = setTimeout(() => { armed = null; b.textContent = t('networth.builder.delete'); }, 5000); return; }
            clearTimeout(armed); armed = null;
            await window.api.stashBuilderDelete(key).catch(() => null);
          };
          return b;
        })(),
      ]);
    }
    group(t('networth.audit.group'), [
      (() => {
        // every learned digit against the shipped ones (main.js stash-audit-learned)
        const box = el('span', 'nw-audit');
        const b = mk(t('networth.audit.button'), t('networth.audit.title'), null, true);
        const out = el('span', 'nw-audit-out');
        b.onclick = async () => {
          if (!window.api.stashAuditLearned) return;
          b.disabled = true; out.textContent = '…';
          const r = await window.api.stashAuditLearned(false).catch(() => null);
          b.disabled = false; out.innerHTML = '';
          if (!r || !r.ok) { out.textContent = t('networth.audit.failed'); return; }
          if (!r.bad.length) { out.textContent = t('networth.audit.none', { n: r.checked }); return; }
          const list = r.bad.slice(0, 6).map((x) => t('networth.audit.item', { digit: x.digit, other: x.other })).join(', ') + (r.bad.length > 6 ? ' …' : '');
          out.appendChild(el('span', null, esc(t('networth.audit.found', { n: r.checked, k: r.bad.length, list }))));
          const rm = mk(t('networth.audit.remove'), null, async () => {
            rm.disabled = true;
            const r2 = await window.api.stashAuditLearned(true).catch(() => null);
            out.textContent = r2 && r2.ok ? t('networth.audit.removed', { k: r2.removed }) : t('networth.audit.failed');
            for (const k of Object.keys(dbgImgCache)) delete dbgImgCache[k];
            render();
          });
          out.appendChild(rm);
        };
        box.appendChild(b); box.appendChild(out);
        return box;
      })(),
      (() => {
        // the digit gallery ("Ziffern-Tafel", main.js stash-gallery): per digit the glyph
        // that fits the others best, how many were collected and how well they agree -
        // approved once, those become the learned digits
        const box = el('div', 'nw-gal');
        const b = mk(t('networth.gallery.open'), t('networth.gallery.open_title'), null, true);
        const out = el('div', 'nw-gal-out');
        const draw = (m) => {
          const c = document.createElement('canvas'); const Z = Math.max(1, Math.floor(56 / Math.max(m.h, 1)));
          c.width = m.w * Z; c.height = m.h * Z; const g = c.getContext('2d');
          g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height); g.fillStyle = '#fff';
          for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (m.data[y * m.w + x]) g.fillRect(x * Z, y * Z, Z, Z);
          c.className = 'nw-gal-img'; return c;
        };
        const show = async () => {
          out.textContent = '…';
          const r = await window.api.stashGallery().catch(() => null);
          out.innerHTML = '';
          if (!r || !r.ok) { out.textContent = t('networth.audit.failed'); return; }
          const grid = el('div', 'nw-gal-grid');
          let ready = 0;
          const clashOf = (d) => r.clash.filter((c) => c.a === d || c.b === d);
          for (let d = 0; d <= 9; d++) {
            const info = r.digits[d] || { n: 0 };
            const tile = el('div', 'nw-gal-tile' + (r.approved.includes(String(d)) ? ' nw-gal-ok' : '') + (clashOf(d).length ? ' nw-gal-clash' : ''));
            tile.appendChild(el('div', 'nw-gal-d', String(d)));
            if (info.medoid) tile.appendChild(draw(info.medoid)); else tile.appendChild(el('div', 'nw-gal-none', '–'));
            tile.appendChild(el('div', 'nw-gal-meta', info.n ? esc(t('networth.gallery.meta', { n: info.n, pct: Math.round(info.agree * 100) })) : esc(t('networth.gallery.missing'))));
            if (clashOf(d).length) tile.title = t('networth.gallery.clash', { list: clashOf(d).map((c) => (c.a === d ? c.b : c.a) + ' ' + Math.round(c.iou * 100) + ' %').join(', ') });
            if (info.n) {
              ready++;
              const x = el('button', 'nw-gal-drop', '✕'); x.title = t('networth.gallery.drop_title');
              x.onclick = async () => { await window.api.stashGalleryApprove(null, d).catch(() => null); show(); };
              tile.appendChild(x);
            }
            grid.appendChild(tile);
          }
          out.appendChild(el('div', 'nw-gal-head', esc(t('networth.gallery.head', { n: ready, mode: t(r.grow ? 'networth.gallery.mode_grow' : 'networth.gallery.mode_hard'), ms: r.ms }))));
          out.appendChild(grid);
          if (r.clash.length) out.appendChild(el('div', 'nw-gal-warn', esc(t('networth.gallery.clash_head', { list: r.clash.map((c) => c.a + '↔' + c.b).join(', ') }))));
          const approvable = [...Array(10).keys()].filter((d) => r.digits[d] && r.digits[d].n && !clashOf(d).length).length; // clashing ones stay out
          const ok = mk(t('networth.gallery.approve', { n: approvable }), t('networth.gallery.approve_title'), async () => {
            ok.disabled = true;
            const ds = []; for (let d = 0; d <= 9; d++) if (r.digits[d] && r.digits[d].n && !clashOf(d).length) ds.push(d);
            const res = await window.api.stashGalleryApprove(ds).catch(() => null);
            for (const k of Object.keys(dbgImgCache)) delete dbgImgCache[k];
            await show();
            out.appendChild(el('div', 'nw-gal-head', esc(res && res.ok ? t('networth.gallery.approved', { list: res.approved.join(' ') }) : t('networth.audit.failed'))));
            render();
          });
          if (!approvable) ok.disabled = true;
          out.appendChild(ok);
        };
        b.onclick = show;
        box.appendChild(b); box.appendChild(out);
        return box;
      })(),
      (() => {
        // start over (backup first); two clicks, the first one asks
        const box = el('span', 'nw-audit');
        const out = el('span', 'nw-audit-out');
        const b = mk(t('networth.learned.reset'), t('networth.learned.reset_title'), null, true);
        let armed = null;
        b.onclick = async () => {
          if (!window.api.stashLearnedReset) return;
          // armed: red with white text, so the second click is not missed (reported: the
          // "really?" in the same grey button went unnoticed)
          if (!armed) { b.textContent = t('networth.learned.reset_confirm'); b.classList.add('nw-btn-danger'); armed = setTimeout(() => { armed = null; b.textContent = t('networth.learned.reset'); b.classList.remove('nw-btn-danger'); }, 6000); return; }
          clearTimeout(armed); armed = null; b.textContent = t('networth.learned.reset'); b.classList.remove('nw-btn-danger');
          const r = await window.api.stashLearnedReset(false).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
          out.textContent = r && r.ok ? t('networth.learned.reset_done', { n: r.removed }) : t('networth.learned.reset_failed', { error: (r && r.error) || '?' });
          // open OCR panels still show the old "learned" counts - fetch them again
          for (const k of Object.keys(dbgImgCache)) delete dbgImgCache[k];
          render();
        };
        const rb = mk(t('networth.learned.restore'), t('networth.learned.restore_title'), async () => {
          const r = await window.api.stashLearnedReset(true).catch(() => null);
          out.textContent = r && r.ok ? t('networth.learned.restore_done') : t('networth.learned.restore_none');
          for (const k of Object.keys(dbgImgCache)) delete dbgImgCache[k];
          render();
        }, true);
        box.appendChild(b); box.appendChild(rb); box.appendChild(out);
        return box;
      })(),
    ]);
    group(t('networth.settings.cal_group_support'), [
      mk(t('networth.tour.support_start'), t('networth.tour.support_start_title'), () => startTour(true), true),
      mk(t('networth.tour.export'), t('networth.tour.export_title'), () => { window.api.stashExportSettings().catch(() => {}); }, true),
    ]);
    cal.appendChild(btns);
    root.appendChild(cal);
  }

  // ---------- check unsure numbers right after a scan ----------
  // Every scan already knows how sure each number is. Unsure ones (under LEARN_BELOW)
  // used to show only with the OCR debug on - and a number the reader does not know yet
  // (a new tab, a count that grew a digit) went by unnoticed. Now the scan says so and
  // offers the check: one number after the other, picture, filters, learn - no switch.
  async function openAlign(tab) {
    const res = await window.api.stashAdjustOpen(tab).catch(() => ({ ok: false }));
    if (!res || !res.ok) console.warn('stash-adjust-open:', res && res.reason);
  }
  // A tab recognised only narrowly: ask once. Measured on the player's 1080p captures with
  // the shipped fingerprints: tabs read right led the runner-up by 0.20-0.65, the two
  // misreads (Kalguur runes and soul cores taken for Ancient Augments - sub-tabs that look
  // alike) by 0.08 and 0.21. Under DETECT_MARGIN the scan asks; "yes" teaches this tab's
  // fingerprint from the picture (then it leads by far and the question does not come
  // back), "no" opens the tab picker of that card.
  const DETECT_MARGIN = 0.25;
  function detectOffer(res) {
    const d = res && res.ok && !res.mismatch && res.detect;
    if (!d || d.score == null || d.runnerScore == null || !d.runnerUp || d.runnerUp === res.tab) return;
    if (d.score - d.runnerScore >= DETECT_MARGIN) return;
    if (state.notice && (state.notice.actions || state.notice.pickTab)) return;
    const rows = rowsOfType(res.tab);
    const row = rows[rows.length - 1];
    if (!row) return;
    state.notice = { kind: 'warn', msg: t('networth.notice.detect_close', { tab: TAB_LABEL[res.tab] || res.tab, other: TAB_LABEL[d.runnerUp] || d.runnerUp }),
      actions: [
        { label: t('networth.notice.detect_yes'), fn: async () => {
          const r = await window.api.stashCorrectTab(res.tab, res.tab).catch(() => null);
          state.notice = r && r.ok ? { kind: 'ok', msg: t('networth.notice.detect_learned', { tab: TAB_LABEL[res.tab] || res.tab }) } : null;
          render();
        } },
        { label: t('networth.notice.detect_no'), ghost: true, fn: () => { state.cardMenu = row.id; state.tabFix = row.id; state.expanded[row.id] = true; } },
      ] };
    render();
  }
  function weakLines(row) {
    return ((row.result && row.result.lines) || [])
      .filter((ln) => !ln.missing && ln.userCount == null && ln.conf != null && (ln.conf < LEARN_BELOW || ln.short) && !isConfirmed(row, ln))
      .sort((a, b) => (b.short ? 1 : 0) - (a.short ? 1 : 0) || a.conf - b.conf);
  }
  // A) a count the player confirmed for this slot, read again the same: not asked about
  // again, whatever its percentage (main.js stash-confirm-count)
  function isConfirmed(row, ln) {
    const c = state.confirmed && state.confirmed[row.tab];
    return !!(c && ln.count > 0 && c[ln.apiId] === ln.count);
  }
  function confirmCount(row, apiId, count) {
    if (!window.api.stashConfirmCount) return;
    state.confirmed = state.confirmed || {};
    const t0 = state.confirmed[row.tab] || (state.confirmed[row.tab] = {});
    if (count > 0) t0[apiId] = count; else delete t0[apiId];
    window.api.stashConfirmCount(row.tab, apiId, count).catch(() => {});
  }

  // B) "Automatisch einstellen" (main.js stash-autotune, auto-tune.js)
  async function runAutoTune(row) {
    if (!window.api.stashAutoTune || state.tuning) return;
    const tabName = TAB_LABEL[row.tab] || row.tab;
    state.tuning = { tab: row.tab, phase: 'tune', done: 0, total: 0 };
    state.cardMenu = null;
    state.notice = { kind: 'info', msg: t('networth.tune.running', { tab: esc(tabName) }) };
    render();
    const res = await window.api.stashAutoTune(row.tab).catch((e) => ({ ok: false, error: String(e && e.message || e) }));
    state.tuning = null;
    if (res && res.ok && res.result && res.result.ok && !res.result.mismatch) {
      applyResult(res.result); // a re-read of the same picture with the new settings
      for (const k of Object.keys(dbgImgCache)) delete dbgImgCache[k];
    }
    if (!res || !res.ok) {
      state.notice = res && res.reason === 'few-truth'
        ? { kind: 'warn', msg: t('networth.tune.few', { tab: esc(tabName), n: res.n || 0 }) }
        : res && res.reason === 'no-recent-capture'
          ? { kind: 'warn', msg: t('networth.tune.no_capture', { tab: esc(tabName), hotkey: state.hotkey }) }
          : { kind: 'err', msg: t('networth.tune.failed', { error: esc((res && res.error) || '?') }) };
      return render();
    }
    const pct = (x) => Math.round(x * 100);
    let msg = res.reverted
      ? t('networth.tune.reverted', { tab: esc(tabName), n: res.known })
      : !res.changed
      ? t('networth.tune.nothing', { tab: esc(tabName), n: res.known })
      : t('networth.tune.done', { tab: esc(tabName), n: res.known, cleanBefore: pct(Math.max(0, Math.min(1, res.clean.before))), cleanAfter: pct(Math.max(0, Math.min(1, res.clean.after))), learned: res.learned, right: res.after.right, before: pct(res.before.meanConf), after: pct(res.after.meanConf), own: res.own })
        + (res.restored ? ' ' + t('networth.tune.restored', { k: res.restored }) : '')
        + (res.learnedBack ? ' ' + t('networth.tune.learned_back', { k: res.learnedBack }) : '');
    const rowNow = rowsOfType(row.tab)[0] || row;
    const weakNow = weakLines(rowNow);
    if (res.stillBad && res.stillBad.length) {
      const names = res.stillBad.slice(0, 4).map((id) => { const ln = (rowNow.result.lines || []).find((l) => l.apiId === id); return ln ? window.gameName(ln.name) : id; });
      msg += ' ' + t('networth.tune.still_weak', { list: esc(names.join(', ')) + (res.stillBad.length > 4 ? ' …' : '') });
    }
    const actions = [];
    if (weakNow.length) actions.push({ label: t('networth.review.start'), fn: () => startReview(rowNow, weakNow.map((ln) => ln.apiId)) });
    if (res.changed) actions.push({ label: t('networth.tune.undo'), ghost: true, fn: async () => {
      const u = await window.api.stashAutoTuneUndo(row.tab).catch(() => null);
      if (u && u.ok && u.result && u.result.ok && !u.result.mismatch) { applyResult(u.result); for (const k of Object.keys(dbgImgCache)) delete dbgImgCache[k]; }
      state.notice = { kind: u && u.ok ? 'ok' : 'warn', msg: t(u && u.ok ? 'networth.tune.undone' : 'networth.tune.undo_failed', { tab: esc(tabName) }) };
      render();
    } });
    actions.push({ label: t('networth.review.later'), ghost: true, fn: () => {} });
    state.notice = { kind: res.changed ? 'ok' : 'info', msg, actions };
    render();
  }
  function reviewOffer(res) {
    if (!res || !res.ok || res.mismatch || state.review) return;
    const rows = rowsOfType(res.tab);
    const row = rows[rows.length - 1];
    if (!row) return;
    const weak = weakLines(row);
    if (!weak.length) return;
    if (state.notice && (state.notice.actions || state.notice.kind === 'err')) return; // a question is already open
    const list = weak.slice(0, 3).map((ln) => `${window.gameName(ln.name)} ${Math.round(ln.conf * 100)} %`).join(', ') + (weak.length > 3 ? ' …' : '');
    const prev = state.notice ? state.notice.msg + ' ' : '';
    state.notice = { kind: 'warn', msg: prev + t('networth.review.offer', { n: weak.length, tab: TAB_LABEL[res.tab] || res.tab, list }),
      actions: [
        { label: t('networth.review.start'), fn: () => startReview(row, weak.map((ln) => ln.apiId)) },
        { label: t('networth.row.adjust_label'), ghost: true, fn: () => openAlign(row.tab) },
        { label: t('networth.review.later'), ghost: true, fn: () => {} },
      ] };
    render();
  }
  function startReview(row, ids) {
    if (!ids.length) return;
    state.review = { rowId: row.id, ids, i: 0 };
    state.debugRows.add(row.id);
    state.expanded[row.id] = true;
    state.dbgLine = ids[0];
    state.notice = null;
    render();
    const el0 = document.querySelector('.nw-review');
    if (el0) el0.scrollIntoView({ block: 'nearest' });
  }
  function endReview() {
    const r = state.review;
    state.review = null;
    if (r && !state.showOcrDebug) state.debugRows.delete(r.rowId);
    state.dbgLine = null;
    render();
  }
  function reviewBar(row) {
    const r = state.review;
    const ln = ((row.result && row.result.lines) || []).find((l) => l.apiId === r.ids[r.i]);
    const bar = el('div', 'nw-review');
    const name = ln ? window.gameName(ln.name) : r.ids[r.i];
    const pct = ln && ln.conf != null ? Math.round(ln.conf * 100) + ' %' : '';
    bar.appendChild(el('div', 'nw-review-head', t('networth.review.head', { i: r.i + 1, n: r.ids.length, name: esc(name), pct })));
    if (ln && ln.short) bar.appendChild(el('div', 'nw-review-note', t('networth.review.short', { n: ln.short, m: String(ln.count).length, count: ln.count })));
    bar.appendChild(el('div', 'nw-review-how', t('networth.review.how')));
    bar.appendChild(el('div', 'nw-review-how', t('networth.review.why_fail')));
    if (learnNote[slotKey(row.tab, r.ids[r.i])]) bar.appendChild(el('div', 'nw-review-note', esc(learnNote[slotKey(row.tab, r.ids[r.i])])));
    const btns = el('div', 'nw-review-btns');
    const go = (d) => { r.i = Math.max(0, Math.min(r.ids.length - 1, r.i + d)); state.dbgLine = r.ids[r.i]; render(); };
    const b = (label, fn, ghost, dis) => { const x = el('button', 'nw-set-btn' + (ghost ? ' nw-set-btn-ghost' : ''), esc(label)); x.disabled = !!dis; x.onclick = (e) => { e.stopPropagation(); fn(); }; btns.appendChild(x); };
    b('◀ ' + t('networth.review.prev'), () => go(-1), true, r.i === 0);
    if (r.i < r.ids.length - 1) b(t('networth.review.next') + ' ▶', () => go(1));
    b(t('networth.row.adjust_label'), () => openAlign(row.tab), true);
    if (window.api.stashAutoTune) b(t('networth.tune.button'), () => { endReview(); runAutoTune(row); }, true);
    b(t('networth.review.done'), () => endReview(), r.i < r.ids.length - 1);
    bar.appendChild(btns);
    return bar;
  }

  // "Welches Fach ist das?" under the notice of a scan that did not know the tab
  function unknownPicker() {
    const box = el('div', 'nw-notice-actions');
    const sel = el('select', 'nw-card-tabsel');
    sel.appendChild(el('option', null, esc(t('networth.row.tabfix_pick'))));
    for (const [k, label] of Object.entries(TAB_LABEL)) { const o = el('option', null, esc(label)); o.value = k; sel.appendChild(o); }
    sel.onchange = async () => {
      const toTab = sel.value; if (!toTab) return;
      sel.disabled = true;
      const res = await window.api.stashCorrectTab('__unknown', toTab).catch(() => null);
      state.notice = null;
      if (res && res.ok && !res.mismatch) {
        applyResult(res);
        state.notice = { kind: 'ok', msg: t('networth.notice.unknown_paired', { tab: TAB_LABEL[res.tab] || res.tab }) };
        reviewOffer(res);
      } else state.notice = { kind: 'warn', msg: t('networth.row.tabfix_failed') };
      render();
    };
    box.appendChild(sel);
    const nb = el('button', 'nw-set-btn', esc(t('networth.builder.new')));
    nb.onclick = async () => {
      state.notice = { kind: 'info', msg: t('networth.builder.capturing') }; render();
      const r = await window.api.stashBuilderStart({ useUnknown: true }).catch(() => null);
      state.notice = r && r.ok ? { kind: 'ok', msg: t('networth.builder.opened', { n: r.cells }) } : { kind: 'err', msg: t('networth.builder.failed', { error: esc((r && r.error) || '?') }) };
      render();
    };
    box.appendChild(nb);
    return box;
  }

  function rowCard(row) {
    const r = row.result;
    const open = !!state.expanded[row.id];
    const card = el('div', 'nw-card' + (open ? ' nw-open' : '') + (row.included ? '' : ' nw-excluded'));

    const head = el('div', 'nw-card-head');

    const grip = el('div', 'nw-grip', '⠿'); grip.title = t('networth.row.drag_title'); grip.draggable = true;
    grip.onclick = (e) => e.stopPropagation();
    grip.ondragstart = (e) => { state.dragId = row.id; e.dataTransfer.effectAllowed = 'move'; try { e.dataTransfer.setData('text/plain', String(row.id)); } catch {} };
    grip.ondragend = () => { state.dragId = null; render(); };
    head.appendChild(grip);
    card.ondragover = (e) => {
      if (state.dragId == null || state.dragId === row.id) return;
      e.preventDefault();
      const r = card.getBoundingClientRect();
      const after = (e.clientY - r.top) > r.height / 2;
      card.classList.remove('nw-drop', 'nw-drop-before', 'nw-drop-after');
      card.classList.add(after ? 'nw-drop-after' : 'nw-drop-before');
    };
    card.ondragleave = () => card.classList.remove('nw-drop', 'nw-drop-before', 'nw-drop-after');
    card.ondrop = (e) => {
      if (state.dragId == null) return; e.preventDefault();
      const rect = card.getBoundingClientRect();
      reorderRow(state.dragId, row.id, e.clientY < rect.top + rect.height / 2);
      state.dragId = null; render();
    };

    const cb = el('input', 'nw-inc'); cb.type = 'checkbox'; cb.checked = row.included; cb.title = t('networth.row.include_title');
    cb.onclick = (e) => { e.stopPropagation(); row.included = cb.checked; render(); };
    head.appendChild(cb);

    const title = el('div', 'nw-card-title');
    title.appendChild(el('span', 'nw-chev', open ? '▾' : '▸'));
    title.appendChild(document.createTextNode(labelFor(row)));
    if (r.scannedAt) {
      const fresh = state.lastScan && state.lastScan.fresh && state.lastScan.at === r.scannedAt;
      const st = el('span', 'nw-scan-at' + (fresh ? ' nw-scan-fresh' : ''), '✓ ' + fmtTime(r.scannedAt));
      st.title = t('networth.row.scanned_at', { time: fmtTime(r.scannedAt, true) });
      title.appendChild(st);
    }
    head.appendChild(title);
    // The tab's tools behind one ⚙ (asked for: "Wrong tab?" and "Align" are rarely needed
    // now - the scan asks when it does not know a tab, and the check of unsure numbers
    // leads to aligning). Open: Wrong tab?, Align, and Debug when the debug switch is on.
    // "Wrong tab?": pick what this tab really is. main keeps this capture's panel
    // fingerprint for that tab (so it is recognised next time on this setup) and reads
    // the same frame again as that tab.
    const menuOpen = state.cardMenu === row.id;
    const gear = el('button', 'nw-card-gear' + (menuOpen ? ' on' : ''), '⚙');
    gear.title = t('networth.row.tools_title');
    gear.onclick = (e) => { e.stopPropagation(); state.cardMenu = menuOpen ? null : row.id; if (menuOpen) state.tabFix = null; render(); };
    if (menuOpen && window.api.stashCorrectTab) {
      if (state.tabFix === row.id) {
        const sel = el('select', 'nw-card-tabsel');
        sel.appendChild(el('option', null, esc(t('networth.row.tabfix_pick'))));
        for (const [k, label] of Object.entries(TAB_LABEL)) {
          if (k === row.tab) continue;
          const o = el('option', null, esc(label)); o.value = k; sel.appendChild(o);
        }
        sel.onclick = (e) => e.stopPropagation();
        sel.onchange = async (e) => {
          e.stopPropagation();
          const toTab = sel.value; if (!toTab) return;
          sel.disabled = true;
          const res = await window.api.stashCorrectTab(row.tab, toTab).catch(() => null);
          state.tabFix = null; state.cardMenu = null;
          if (res && res.ok && !res.mismatch) {
            row.tab = res.tab; row.result = res;
            for (const k of Object.keys(dbgImgCache)) delete dbgImgCache[k];
            state.notice = res.tab === toTab
              ? { kind: 'ok', msg: t('networth.row.tabfix_done', { tabName: TAB_LABEL[toTab] || toTab }) }
              : { kind: 'warn', msg: t('networth.row.tabfix_still', { tabName: TAB_LABEL[res.tab] || res.tab }) };
          } else {
            state.notice = { kind: 'warn', msg: t('networth.row.tabfix_failed') };
          }
          render();
        };
        head.appendChild(sel);
      } else {
        const fix = el('button', 'nw-card-tabfix', t('networth.row.tabfix_button'));
        fix.title = t('networth.row.tabfix_title');
        fix.onclick = (e) => { e.stopPropagation(); state.tabFix = row.id; render(); };
        head.appendChild(fix);
      }
    }
    if (menuOpen && window.api.stashAutoTune) {
      const at = el('button', 'nw-card-adjust', t('networth.tune.button'));
      at.title = t('networth.tune.title');
      at.onclick = (e) => { e.stopPropagation(); runAutoTune(row); };
      head.appendChild(at);
    }
    // Align: on every scanned tab (it needs the captured frame). Opens the drag-to-fix
    // tool as a real window; saving writes straight into config for the next scan.
    if (menuOpen && window.api.stashAdjustOpen) {
      const adj = el('button', 'nw-card-adjust', t('networth.row.adjust_label'));
      adj.title = t('networth.row.adjust_title');
      adj.onclick = (e) => { e.stopPropagation(); openAlign(row.tab); };
      head.appendChild(adj);
    }
    // OCR debug per TAB: the global switch only makes this button available; the images,
    // sliders and previews are built just for the tab(s) switched on here.
    if (menuOpen && state.showOcrDebug) {
      const on = state.debugRows.has(row.id);
      const dbgBtn = el('button', 'nw-card-adjust' + (on ? ' nw-card-adjust-on' : ''), t(on ? 'networth.row.debug_on' : 'networth.row.debug_off'));
      dbgBtn.title = t('networth.row.debug_title');
      dbgBtn.onclick = (e) => {
        e.stopPropagation();
        if (on) state.debugRows.delete(row.id); else { state.debugRows.add(row.id); state.expanded[row.id] = true; }
        render();
      };
      head.appendChild(dbgBtn);
    }
    // total as fixed-width columns (same order as the line columns) so Ex sits under Ex
    // and Div under Div across all cards; ⚙ and ✕ go after it, at the far right, so a
    // short or long total no longer shifts the ⚙ sideways (asked for after the screenshot
    // with "⚙ 15.721 ex 27,2 div ✕" wandering from card to card)
    const rowEx = rowTotalEx(r);
    const tot = el('div', 'nw-card-total nw-val-cols nw-card-cols' + (rowEdited(r) ? ' nw-edited' : ''));
    tot.insertAdjacentHTML('beforeend', unitCols(rowEx, { div: r.divPrice, chaos: r.chaosPrice }));
    head.appendChild(tot);
    head.appendChild(gear);
    head.onclick = (e) => { if (e.target === cb) return; state.expanded[row.id] = !open; render(); };

    // per-row remove
    const del = el('button', 'nw-del', '✕'); del.title = t('networth.row.remove_title');
    del.onclick = (e) => { e.stopPropagation(); state.rows = state.rows.filter((x) => x !== row); render(); };
    head.appendChild(del);
    card.appendChild(head);
    if (!open) return card;

    if (state.review && state.review.rowId === row.id) card.appendChild(reviewBar(row));
    const list = el('div', 'nw-lines');
    const byVal = (a, b) => (lineVal(b) - lineVal(a)) || ((b.count || 0) - (a.count || 0));
    const bySlot = (a, b) => (a.slot || 0) - (b.slot || 0);
    const all = r.lines.slice();
    const owned = all.filter((ln) => !ln.missing).sort(state.sortLayout ? bySlot : byVal);
    const missing = all.filter((ln) => ln.missing).sort(bySlot); // shown only with "Show missing", at the bottom
    // with this tab's debug on, the unread slots are listed too - they are the ones that
    // need tuning (reported: at 1080p nothing was read, so there was nothing to pick)
    const dbgOn = dbgActive(row);
    let shown = state.showMissing || dbgOn ? owned.concat(missing) : owned;
    // while checking unsure numbers the one being checked sits right under the check bar,
    // with its filter panel (reported: the bar is at the top, the item can be far down
    // the list - "man sucht das"); back in its place once the check is done
    const revId = state.review && state.review.rowId === row.id ? state.review.ids[state.review.i] : null;
    if (revId) {
      const cur = shown.find((ln) => ln.apiId === revId);
      if (cur) shown = [cur].concat(shown.filter((ln) => ln !== cur));
    }
    for (const ln of shown) {
      // Rows our own testing says to distrust are marked, so a wrong number is visible
      // rather than silently averaged into the total. `rel` is measured per slot against
      // every ground-truthed capture we hold; a user edit clears the flag, because once
      // they have typed the real number there is nothing left to doubt.
      // Off by default (settings toggle): the flags are a static list measured once on
      // other people's captures, and per-slot tuning + learned templates make them stale.
      const relFlag = state.showRel && ln.userCount == null ? (ln.rel || null) : null;
      const line = el('div', 'nw-line'
        + (ln.userCount != null ? ' nw-line-edited' : '')
        + (ln.excluded || skipGroup(ln) ? ' nw-line-off' : '')
        + (ln.missing ? ' nw-line-missing' : '')
        + (ln.apiId === revId ? ' nw-line-review' : '')
        + (relFlag ? ' nw-line-rel-' + relFlag : ''));
      if (relFlag) {
        line.title = relFlag === 'low'
          ? t('networth.line.unreliable_low')
          : t('networth.line.unreliable_mixed');
      }
      const tg = el('input', 'nw-line-inc'); tg.type = 'checkbox'; tg.checked = !ln.excluded; tg.title = t('networth.row.include_title');
      tg.onclick = (e) => { e.stopPropagation(); ln.excluded = !tg.checked; render(); };
      const sg = skipGroup(ln);
      if (sg) { tg.checked = false; tg.disabled = true; tg.title = t('networth.skip.line_title', { name: sg.name }); }
      line.appendChild(tg);
      if (ln.icon) { const img = el('img', 'nw-ic'); img.src = ln.icon; img.onerror = () => img.remove(); line.appendChild(img); }
      else line.appendChild(el('div', 'nw-ic nw-ic-none'));
      line.appendChild(el('div', 'nw-name', esc(window.gameName(ln.name) + (ln.suffix || '')))); // feed is English; show the client's own name (+ "#2" for an extra slot of the same currency)
      // unsure read, even with the percentages hidden: a "?" that opens its check
      if (!ln.missing && ln.userCount == null && ln.conf != null && (ln.conf < LEARN_BELOW || ln.short) && !isConfirmed(row, ln) && !state.showConfidence && !dbgActive(row)) {
        const q = el('button', 'nw-weak' + (ln.conf < 0.65 ? ' nw-weak-bad' : ''), '?');
        q.title = ln.short ? t('networth.line.short_title', { n: ln.short }) : t('networth.review.weak_title', { pct: Math.round(ln.conf * 100) });
        q.onclick = (e) => { e.stopPropagation(); startReview(row, [ln.apiId]); };
        line.appendChild(q);
      }
      const skipKey = ln.priceId || ln.apiId;
      if (sg) {
        // click the tag = take it back out of that list (counts again)
        const tag = el('button', 'nw-skip-tag', '⊘ ' + esc(sg.name) + ' ✕');
        tag.title = t('networth.skip.line_title', { name: sg.name }) + ' ' + t('networth.skip.quick_undo_title');
        tag.onclick = (e) => { e.stopPropagation(); window.NwSkipGroups.removeFrom(sg, skipKey); render(); };
        line.appendChild(tag);
      } else if (window.NwSkipGroups && !ln.missing) {
        // one click: leave this item out (skip-groups.js quickSkip)
        const qb = el('button', 'nw-skip-quick', '⊘');
        qb.title = t('networth.skip.quick_title');
        qb.onclick = (e) => { e.stopPropagation(); window.NwSkipGroups.quickSkip(skipKey, qb, render); };
        line.appendChild(qb);
      }
      if ((state.showConfidence || dbgActive(row)) && ln.conf != null) {
        const pct = Math.round(ln.conf * 100);
        const cl = pct >= 88 ? 'ok' : (pct >= 80 ? 'mid' : 'low');
        const conf = isConfirmed(row, ln);
        const cf = el('div', 'nw-conf nw-conf-' + (conf ? 'confirmed' : cl), pct + '%' + (conf ? ' ✓' : ''));
        cf.title = conf ? t('networth.line.confirmed_title') : t('networth.line.confidence_title');
        line.appendChild(cf);
        // Low confidence but already-correct reads (a thin margin at OCR time, not a
        // wrong value) never reach the teach pipeline otherwise - it only fires on an
        // actual correction. This is an explicit, deliberate "yes" from the user, so it's
        // safe to feed the same way: unlike the count field's blur handler, it can't fire
        // from an idle click that never checked the number.
        // below LEARN_BELOW only: a read the reader is already sure of adds nothing but
        // near-identical copies to the exemplar pool
        if ((pct < LEARN_BELOW * 100 || ln.short) && effCount(ln) > 0 && !conf && window.api.stashTeachCount) {
          const okBtn = el('button', 'nw-conf-confirm', '✓');
          okBtn.title = t('networth.line.confirm_title');
          okBtn.onclick = async (e) => {
            e.stopPropagation();
            okBtn.disabled = true;
            confirmCount(row, ln.apiId, effCount(ln)); // right is right, even if learning fails
            const sk = slotKey(row.tab, ln.apiId);
            const force = teachForce.has(sk); teachForce.delete(sk);
            let res;
            try { res = await window.api.stashTeachCount(ln.apiId, String(effCount(ln)), force ? { force: true } : undefined, row.tab); }
            catch { res = { ok: false }; }
            if (res && res.ok) {
              if (state.review) learnNote[slotKey(row.tab, ln.apiId)] = t('networth.line.debug_learn_ok', { value: String(effCount(ln)) });
              okBtn.classList.add('nw-conf-confirm-done');
              okBtn.textContent = '✓';
              okBtn.title = t('networth.line.confirm_done_title');
              // re-read this slot right away with the just-learned templates (same path as
              // a scan, saved settings) so the percentage reflects the lesson now, not only
              // after the next scan
              try {
                const rr = await window.api.stashSlotDebugImage(ln.apiId, undefined, row.tab);
                if (rr && rr.ok && rr.preview && rr.preview.text === String(effCount(ln))) {
                  ln.conf = rr.preview.conf;
                  dbgImgCache[slotKey(row.tab, ln.apiId)] = rr; // the fresh read doubles as the panel's data
                  render();
                }
              } catch { /* keep the old percentage; the next scan updates it */ }
              render(); // shows it as confirmed (green ✓)
            } else {
              // Segmentation couldn't isolate one glyph per digit for this exact frame
              // (touching digits, icon bleed, ...) - the teach pipeline refuses rather
              // than guessing, so say so instead of showing a false "learned" tick.
              okBtn.classList.add('nw-conf-confirm-failed');
              okBtn.textContent = '!';
              okBtn.title = t('networth.line.confirm_failed_title');
              okBtn.disabled = false;
              // the guards (more digits in the picture / a digit that looks like another):
              // not confirmed, the reason shown; a second press insists
              const why = teachWhy(res, effCount(ln));
              if (why) {
                confirmCount(row, ln.apiId, null);
                teachForce.add(sk);
                okBtn.title = why;
                learnNote[sk] = why; // shown in the check bar
                if (!state.review) state.notice = { kind: 'warn', msg: esc(window.gameName(ln.name)) + ': ' + esc(why) };
                render();
              }
              // during a check the reason goes into the bar, readable, not just a "!"
              if (state.review && !why) {
                learnNote[slotKey(row.tab, ln.apiId)] = res && res.reason === 'segment-mismatch'
                  ? t('networth.line.debug_learn_parts', { found: res.found, want: res.want })
                  : t('networth.line.debug_learn_failed');
                render();
              }
            }
          };
          line.appendChild(okBtn);
        }
      }
      const cnt = el('div', 'nw-cnt'); cnt.innerHTML = `<span class="nw-x">×</span>${esc(fmtCount(effCount(ln)))}`;
      cnt.title = t('networth.line.edit_count_title');
      cnt.onclick = (e) => { e.stopPropagation(); startEdit(ln, cnt, row); };
      line.appendChild(cnt);
      const valEl = el('div', 'nw-val nw-val-edit nw-val-cols', ln.price == null ? t('networth.line.no_price') : priceMark(ln.est) + unitCols(lineVal(ln), { div: r.divPrice, chaos: r.chaosPrice }));
      // why this price is not simply the feed's (main.js sanitizeThinPrices / applyPriceRules),
      // plus every source it had, then how to set an own one
      valEl.title = priceTitle(ln);
      // click = set your own price per unit for this item (all tabs, item tab, currency tab)
      valEl.onclick = (e) => { e.stopPropagation(); startPriceEdit(ln, valEl); };
      line.appendChild(valEl);
      const rb = el('button', 'nw-line-reset' + ((ln.userCount != null || ln.excluded) ? '' : ' nw-line-reset-off'), '↺');
      rb.title = t('networth.line.reset_title');
      rb.onclick = (e) => { e.stopPropagation(); ln.userCount = undefined; ln.excluded = false; render(); };
      line.appendChild(rb);
      // with this tab's debug on: one 🔍 per row, and only the ONE row picked gets images,
      // sliders and live previews - they are computed one slot at a time instead of every
      // slot of the tab at once
      if (dbgActive(row)) {
        const lb = el('button', 'nw-line-dbg' + (state.dbgLine === ln.apiId ? ' nw-line-dbg-on' : ''), '🔍');
        lb.title = t('networth.line.debug_open_title');
        lb.onclick = (e) => { e.stopPropagation(); state.dbgLine = state.dbgLine === ln.apiId ? null : ln.apiId; render(); };
        line.appendChild(lb);
      }
      list.appendChild(line);
      // OCR-debug toggle: the exact crop the reader worked from, so a problem slot can be
      // judged by eye - raw (native pixels, upscaled) and the binarized cell it actually
      // template-matched against - plus a way to fix it from right there: type the real
      // number (the count field above already teaches on a real correction) or confirm it
      // (the checkmark above already teaches on confirmation), and if the digit templates
      // themselves seem to be the problem, forget them and let them rebuild from scratch.
      if (dbgActive(row) && state.dbgLine === ln.apiId && window.api.stashSlotDebugImage) {
        const dbg = el('div', 'nw-dbg');
        const cached = dbgImgCache[slotKey(row.tab, ln.apiId)];
        if (cached === 'loading') {
          dbg.textContent = '…';
        } else if (cached && cached.ok === false) {
          // no screenshot for this tab (restored after a restart, or it expired) - say so
          // instead of re-requesting forever
          // anything else: say what went wrong (a bare "…" looked like it was still loading)
          dbg.textContent = cached.reason === 'no-recent-capture' ? t('networth.line.debug_need_rescan') : t('networth.line.debug_error', { error: cached.error || cached.reason || '?' });
        } else if (cached && cached.ok) {
          const imgs = el('div', 'nw-dbg-imgs');
          // original | the greyscale the reader works from after colour limit/contrast
          // (removed pixels black) | the black/white cell floor cuts from it
          const rawImg = el('img', 'nw-dbg-img'); rawImg.src = cached.rawUrl; rawImg.title = t('networth.line.debug_img_raw');
          const filtImg = el('img', 'nw-dbg-img'); filtImg.src = cached.filtUrl; filtImg.title = t('networth.line.debug_img_filtered');
          const binImg = el('img', 'nw-dbg-img'); binImg.src = cached.binUrl; binImg.title = t('networth.line.debug_img_binarized');
          // 4th: the difference to the templates it matched (red missing / blue extra)
          const diffImg = el('img', 'nw-dbg-img'); diffImg.title = t('networth.line.debug_img_diff');
          const diffInfo = el('div', 'nw-dbg-diffinfo');
          const showDiff = (r) => {
            diffImg.style.display = r && r.diffUrl ? '' : 'none';
            if (r && r.diffUrl) diffImg.src = r.diffUrl;
            diffInfo.innerHTML = r && r.diffGlyphs && r.diffGlyphs.length
              ? esc(t('networth.line.debug_diff_legend')) + ' ' + r.diffGlyphs.map((g) => esc(t('networth.line.debug_diff_glyph', {
                digit: g.digit, pct: Math.round((g.score || 0) * 100), miss: g.miss, extra: g.extra,
                src: t(String(g.source).startsWith('user-corrections') ? 'networth.line.debug_diff_src_learned' : 'networth.line.debug_diff_src_shipped') }))).join(' · ')
              : '';
            if (r && r.grow) diffInfo.innerHTML = esc(t('networth.line.debug_grow_legend')) + ' (' + (r.rescued || 0) + ' px). ' + diffInfo.innerHTML;
          };
          showDiff(cached);
          // the magnifier (asked for: "mit einer Lupe am besten"): a click on any picture
          // shows all four big and pixel-sharp, one under the other; a click closes it
          for (const im of [rawImg, filtImg, binImg, diffImg]) {
            im.style.cursor = 'zoom-in';
            im.onclick = (e) => { e.stopPropagation(); openLoupe([rawImg, filtImg, binImg, diffImg].filter((x) => x.style.display !== 'none' && x.src), diffInfo.textContent); };
          }
          imgs.appendChild(rawImg); imgs.appendChild(filtImg); imgs.appendChild(binImg); imgs.appendChild(diffImg);
          dbg.appendChild(imgs);
          dbg.appendChild(diffInfo);
          // how to use the sliders - folded, opened once and remembered
          {
            const guide = el('details', 'nw-dbg-guide');
            try { guide.open = localStorage.getItem('nwDbgGuide') === '1'; } catch {}
            guide.addEventListener('toggle', () => { try { localStorage.setItem('nwDbgGuide', guide.open ? '1' : '0'); } catch {} });
            guide.appendChild(el('summary', null, esc(t('networth.line.debug_guide_title'))));
            guide.appendChild(el('div', 'nw-dbg-guide-body', t('networth.line.debug_guide')));
            dbg.appendChild(guide);
          }

          // Sliders tuned against ONE live preview that runs the live reader's exact path
          // (read-pipeline.js), so "würde lesen" is what the next scan reads with these
          // values. "Speichern" stores only the sliders actually MOVED (plus whatever was
          // already saved) - an untouched floor stays on the adaptive sweep, so e.g. just
          // the speck filter can be saved while everything else stays automatic. A saved
          // slider is marked with a dot. Every slider re-requests the preview with ALL
          // current values (debounced IPC, not render() - a full re-render would drop
          // slider focus mid-drag).
          const controls = el('div', 'nw-dbg-controls');
          const previewLabel = el('span', 'nw-dbg-preview');
          const saved = cached.saved || {};
          // floor label also shows the cut actually applied (the higher of floor and the
          // cell's automatic threshold), refreshed with each preview
          const floorFmt = (v) => (cached.effFloor != null && cached.effFloor !== +v
            ? t('networth.line.debug_floor_eff_val', { v, eff: cached.effFloor }) : 'floor ' + v);
          const specs = [
            // real saturation of the colour source (0 = grey): the reader's brightness is
            // max(R,G,B), so pure red/blue count as bright as white until greyed out
            { key: 'satPct', min: 0, max: 200, step: 5, fmt: (v) => t('networth.line.debug_satpct_val', { v }) },
            // brightness/contrast of the colour source before every filter (test)
            { key: 'bright', min: -100, max: 50, step: 5, fmt: (v) => t('networth.line.debug_bright_val', { v }) },
            { key: 'gain', min: 40, max: 150, step: 5, fmt: (v) => t('networth.line.debug_gain_val', { v }) },
            { key: 'desatSat', min: 5, max: 255, step: 5, fmt: (v) => t('networth.line.debug_sat_val', { v }) },
            { key: 'contrast', min: 0, max: 200, step: 5, fmt: (v) => t('networth.line.debug_contrast_val', { v }) },
            { key: 'floor', min: 60, max: 200, step: 5, fmt: floorFmt },
            // local cut: 0 = off (one global floor for the whole cell); above 0 a pixel
            // is ink only if it is a thin stroke standing out this much from its own
            // surroundings - separates a white digit from white marble behind it
            { key: 'localThr', min: 0, max: 100, step: 5, fmt: (v) => (+v ? t('networth.line.debug_local_val', { v }) : t('networth.line.debug_local_off')) },
            // speck size: after the black/white cut, drop white blobs smaller than this -
            // for icon highlights exactly as white/grey as a digit, which no pixel filter can
            // matching resolution: x2 keeps twice the detail on high-res (5K-class)
            // captures; greyed out where the capture has no extra pixels to give
            { key: 'matchScale', min: 1, max: 2, step: 1, fmt: (v) => ((cached.matchScaleMax || 1) < 2
              ? t('networth.line.debug_res_unavailable') : t('networth.line.debug_res_val', { v })) },
            { key: 'minBlob', min: 0, max: 30, step: 1, fmt: (v) => t('networth.line.debug_blob_val', { v }) },
          ];
          // "save the digits' edge" (switch in settings): how the extractor brings the
          // edge back from the original - how far (capped), from which brightness, how
          // coloured an edge pixel may be
          if (state.growDigits) specs.push(
            { key: 'growDepth', min: 0, max: 4, step: 1, fmt: (v) => t('networth.line.debug_growdepth_val', { v }) },
            { key: 'growFloor', min: 60, max: 220, step: 5, fmt: (v) => t('networth.line.debug_growfloor_val', { v }) },
            { key: 'growSat', min: 0, max: 150, step: 5, fmt: (v) => t('networth.line.debug_growsat_val', { v }) },
          );
          const touched = new Set();
          const sliders = {};
          for (const sp of specs) {
            const row = el('div', 'nw-dbg-floor-row');
            const s = el('input', 'nw-dbg-slider'); s.type = 'range';
            s.min = sp.min; s.max = sp.max; s.step = sp.step; s.value = cached[sp.key];
            const lab = el('span', 'nw-dbg-floor-val');
            const mark = () => { lab.textContent = sp.fmt(s.value) + (saved[sp.key] != null && !touched.has(sp.key) ? ' •' : ''); };
            mark();
            if (sp.key === 'matchScale' && (cached.matchScaleMax || 1) < 2) s.disabled = true;
            row.appendChild(s); row.appendChild(lab);
            sliders[sp.key] = { row, s, lab, mark };
          }
          const values = () => {
            const v = {};
            for (const sp of specs) v[sp.key] = +sliders[sp.key].s.value;
            return v;
          };
          const hasSaved = specs.some((sp) => saved[sp.key] != null);
          const btnRow = el('div', 'nw-dbg-floor-row');
          const saveBtn = el('button', 'nw-dbg-pin', t('networth.line.debug_save_button'));
          const resetBtn = el('button', 'nw-dbg-forget', t('networth.line.debug_reset_button'));
          resetBtn.title = t('networth.line.debug_reset_title');
          const status = el('span', 'nw-dbg-floor-val');
          const updateStatus = () => {
            saveBtn.disabled = !touched.size;
            status.textContent = touched.size ? t('networth.line.debug_status_changed')
              : hasSaved ? t('networth.line.debug_status_saved') : t('networth.line.debug_status_auto');
          };
          const tplLabel = el('span', 'nw-dbg-floor-val');
          const showTemplates = (ti) => {
            if (!ti) { tplLabel.textContent = ''; return; }
            const parts = Object.keys(ti.learned || {}).map((d) => d + ': ' + ti.learned[d] + '×');
            tplLabel.textContent = t('networth.line.debug_templates', { n: ti.total })
              + (parts.length ? ' · ' + t('networth.line.debug_templates_learned', { list: parts.join(', ') }) : '');
          };
          const showPreview = (p) => {
            previewLabel.textContent = t('networth.line.debug_preview', { text: p ? p.text : '?', pct: p ? Math.round(p.conf * 100) : 0 });
          };
          showTemplates(cached.templates);
          showPreview(cached.preview);
          let debounceT = null;
          const refreshPreview = () => {
            clearTimeout(debounceT);
            debounceT = setTimeout(async () => {
              // an untouched, unsaved floor previews the adaptive sweep, like the live read
              const v = values();
              if (!touched.has('floor') && saved.floor == null) v.floor = null;
              const res = await window.api.stashSlotDebugImage(ln.apiId, v, row.tab).catch(() => null);
              if (!res || !res.ok) return;
              rawImg.src = res.rawUrl; filtImg.src = res.filtUrl; binImg.src = res.binUrl;
              showDiff(res);
              showPreview(res.preview);
              showTemplates(res.templates);
              Object.assign(cached, { templates: res.templates, defaults: res.defaults, effFloor: res.effFloor, rawUrl: res.rawUrl, filtUrl: res.filtUrl, binUrl: res.binUrl, diffUrl: res.diffUrl, diffGlyphs: res.diffGlyphs, grow: res.grow, rescued: res.rescued, preview: res.preview });
              for (const sp of specs) cached[sp.key] = res[sp.key];
              if (!touched.has('floor')) sliders.floor.s.value = res.floor;
              sliders.floor.mark();
            }, 120);
          };
          for (const sp of specs) {
            const c = sliders[sp.key];
            c.s.addEventListener('input', () => { touched.add(sp.key); c.mark(); updateStatus(); refreshPreview(); });
          }
          saveBtn.onclick = async (e) => {
            e.stopPropagation();
            saveBtn.disabled = true;
            const v = values(), out = {};
            for (const k of touched) out[k] = v[k];
            try { await window.api.stashSlotSaveReadSettings(ln.apiId, out, row.tab); } catch {}
            await refreshDbgSlot(row.tab, ln.apiId);
          };
          resetBtn.onclick = async (e) => {
            e.stopPropagation();
            resetBtn.disabled = true;
            try { await window.api.stashSlotSaveReadSettings(ln.apiId, null, row.tab); } catch {}
            await refreshDbgSlot(row.tab, ln.apiId);
          };
          // playground presets - they only move the sliders (preview), nothing is saved
          // until "Speichern": Standard = what automatic uses, Alle Filter aus = every
          // filter neutral, so the middle view shows the plain original
          const setAll = (vals, markTouched) => {
            for (const sp of specs) {
              if (!(sp.key in vals)) continue;
              sliders[sp.key].s.value = vals[sp.key];
              if (markTouched) touched.add(sp.key); else touched.delete(sp.key);
              sliders[sp.key].mark();
            }
            updateStatus(); refreshPreview();
          };
          const presetRow = el('div', 'nw-dbg-floor-row');
          const stdBtn = el('button', 'nw-dbg-pin', t('networth.line.debug_preset_standard'));
          stdBtn.title = t('networth.line.debug_preset_standard_title');
          stdBtn.onclick = (e) => { e.stopPropagation(); if (cached.defaults) setAll(cached.defaults, false); };
          const offBtn = el('button', 'nw-dbg-pin', t('networth.line.debug_preset_off'));
          offBtn.title = t('networth.line.debug_preset_off_title');
          offBtn.onclick = (e) => { e.stopPropagation(); setAll({ satPct: 100, bright: 0, gain: 100, desatSat: 255, contrast: 0, minBlob: 0, localThr: 0 }, true); };
          // copy: every slider as shown, except an automatic floor - that stays automatic
          // on the target too instead of becoming this slot's sweep result
          const copyBtn = el('button', 'nw-dbg-pin', t('networth.line.debug_copy_button'));
          copyBtn.title = t('networth.line.debug_copy_title');
          const pasteBtn = el('button', 'nw-dbg-pin', t('networth.line.debug_paste_button'));
          pasteBtn.title = t('networth.line.debug_paste_title');
          copyBtn.onclick = (e) => {
            e.stopPropagation();
            const v = values();
            if (!touched.has('floor') && saved.floor == null) delete v.floor;
            dbgClipboard = v;
            copyBtn.textContent = t('networth.line.debug_copied');
            // no render(): it would rebuild this panel and drop unsaved slider changes;
            // other panels' "Einfügen" reads dbgClipboard when clicked
          };
          // paste = take over AND save in one go - it's meant for rolling one good setting
          // out over many slots quickly, often with the settings section closed
          pasteBtn.onclick = async (e) => {
            e.stopPropagation();
            if (!dbgClipboard) return;
            pasteBtn.disabled = true;
            const out = Object.assign({}, dbgClipboard);
            if (!('floor' in out)) out.floor = null; // source floor was automatic: keep it so
            try { await window.api.stashSlotSaveReadSettings(ln.apiId, out, row.tab); } catch {}
            await refreshDbgSlot(row.tab, ln.apiId);
          };
          presetRow.appendChild(stdBtn); presetRow.appendChild(offBtn);
          // always visible: preview, the open/close toggle and copy/paste (pasting onto
          // a slot doesn't need its sliders open - "Speichern" does, and lives inside)
          const topRow = el('div', 'nw-dbg-floor-row');
          const body = el('div', 'nw-dbg-body');
          const isOpen = () => dbgSettingsOpen.has(ln.apiId);
          body.hidden = !isOpen();
          const toggleBtn = el('button', 'nw-dbg-pin', (isOpen() ? '▾ ' : '▸ ') + t('networth.line.debug_settings_toggle'));
          toggleBtn.onclick = (e) => {
            e.stopPropagation();
            if (isOpen()) dbgSettingsOpen.delete(ln.apiId); else dbgSettingsOpen.add(ln.apiId);
            // flip just this panel in place - no render(), which would drop unsaved drags
            body.hidden = !isOpen();
            toggleBtn.textContent = (isOpen() ? '▾ ' : '▸ ') + t('networth.line.debug_settings_toggle');
          };
          // "for the whole tab": this slot's current sliders onto EVERY slot of this tab, in
          // one go - the usual case is one well-tuned slot (e.g. the first Transmutation) whose
          // settings suit the whole tab. Saved directly; floor stays automatic if it is here.
          const allBtn = el('button', 'nw-dbg-pin', t('networth.line.debug_apply_tab'));
          allBtn.title = t('networth.line.debug_apply_tab_title');
          allBtn.onclick = async (e) => {
            e.stopPropagation();
            const ids = [...new Set((row.result.lines || []).map((l) => l.apiId))];
            const tabName = TAB_LABEL[row.tab] || row.tab;
            if (!window.confirm(t('networth.line.debug_apply_tab_confirm', { n: ids.length, tab: tabName }))) return;
            allBtn.disabled = true;
            const out = values();
            if (!touched.has('floor') && saved.floor == null) out.floor = null;
            for (const id of ids) {
              try { await window.api.stashSlotSaveReadSettings(id, out, row.tab); } catch {}
              delete dbgImgCache[slotKey(row.tab, id)];
            }
            state.notice = { kind: 'ok', msg: t('networth.line.debug_apply_tab_done', { n: ids.length, tab: tabName, hotkey: state.hotkey }) };
            render();
          };
          topRow.appendChild(toggleBtn); topRow.appendChild(copyBtn); topRow.appendChild(pasteBtn); topRow.appendChild(allBtn);
          btnRow.appendChild(saveBtn);
          if (hasSaved) btnRow.appendChild(resetBtn);
          btnRow.appendChild(status);
          updateStatus();
          controls.appendChild(previewLabel);
          controls.appendChild(tplLabel);
          controls.appendChild(topRow);
          for (const sp of specs) body.appendChild(sliders[sp.key].row);
          body.appendChild(presetRow);
          body.appendChild(btnRow);
          controls.appendChild(body);
          // "learn from this image": teach the digit templates from exactly the black/
          // white cell on screen, with the CURRENT slider values (saved or not) - for the
          // case where the right image shows a clean number the reader still misreads.
          // The number box starts at the row's count; correct it if that is wrong too.
          if (window.api.stashTeachCount) {
            const learnRow = el('div', 'nw-dbg-floor-row');
            const learnIn = el('input', 'nw-dbg-learn-in'); learnIn.type = 'text'; learnIn.inputMode = 'numeric';
            learnIn.value = ln.count != null ? String(effCount(ln)) : '';
            learnIn.onclick = (e) => e.stopPropagation();
            const learnBtn = el('button', 'nw-dbg-pin', t('networth.line.debug_learn_button'));
            learnBtn.title = t('networth.line.debug_learn_title');
            const learnMsg = el('span', 'nw-dbg-floor-val', esc(learnNote[slotKey(row.tab, ln.apiId)] || '')); // survives the re-render the learn triggers
            learnBtn.onclick = async (e) => {
              e.stopPropagation();
              const value = learnIn.value.replace(/[^0-9]/g, '');
              if (!value) return;
              const pv = cached.preview;
              if (pv && pv.text === value && pv.conf >= LEARN_BELOW) {
                learnMsg.textContent = t('networth.line.debug_learn_already', { pct: Math.round(pv.conf * 100) });
                return;
              }
              learnBtn.disabled = true;
              const v = values();
              if (!touched.has('floor') && saved.floor == null) v.floor = cached.floor; // the floor the preview used
              const sk = slotKey(row.tab, ln.apiId);
              if (teachForce.has(sk + '|' + value)) { v.force = true; teachForce.delete(sk + '|' + value); }
              let res;
              try { res = await window.api.stashTeachCount(ln.apiId, value, v, row.tab); } catch { res = { ok: false }; }
              const why = res && !res.ok ? teachWhy(res, value) : null;
              learnBtn.disabled = false;
              if (res && res.ok) {
                confirmCount(row, ln.apiId, parseInt(value, 10));
                learnMsg.textContent = learnNote[slotKey(row.tab, ln.apiId)] = t('networth.line.debug_learn_ok', { value });
                refreshPreview(); // the reader's answer with the newly learned digits
              } else if (why) {
                teachForce.add(sk + '|' + value);
                learnMsg.textContent = learnNote[sk] = why;
              } else if (res && res.reason === 'segment-mismatch') {
                learnMsg.textContent = learnNote[slotKey(row.tab, ln.apiId)] = t('networth.line.debug_learn_parts', { found: res.found, want: res.want });
              } else {
                learnMsg.textContent = learnNote[slotKey(row.tab, ln.apiId)] = t('networth.line.debug_learn_failed') + (res && res.error ? ' (' + res.error + ')' : '');
              }
            };
            learnRow.appendChild(learnIn); learnRow.appendChild(learnBtn); learnRow.appendChild(learnMsg);
            body.appendChild(learnRow);
          }
          if (ln.count != null && window.api.stashForgetDigits) {
            const forget = el('button', 'nw-dbg-forget', t('networth.line.forget_button'));
            forget.title = t('networth.line.forget_title');
            forget.onclick = async (e) => {
              e.stopPropagation();
              forget.disabled = true;
              try { await window.api.stashForgetDigits(String(ln.count)); } catch {}
              await refreshDbgSlot(row.tab, ln.apiId);
            };
            body.appendChild(forget);
          }
          dbg.appendChild(controls);
        } else {
          dbg.textContent = '…';
          dbgImgCache[slotKey(row.tab, ln.apiId)] = 'loading';
          window.api.stashSlotDebugImage(ln.apiId, undefined, row.tab).then((res) => {
            dbgImgCache[slotKey(row.tab, ln.apiId)] = res || { ok: false };
            render();
          }).catch(() => { dbgImgCache[slotKey(row.tab, ln.apiId)] = { ok: false }; render(); });
        }
        list.appendChild(dbg);
      }
    }
    card.appendChild(list);
    return card;
  }

  // click-to-edit a line's count; matching the original value clears the override
  // ---- prices: markers, sources, the user's own price ----
  // ✎ own price · ⚠ sources contradict each other · ≈ implausible feed price replaced
  function priceMark(est) {
    if (!est) return '';
    if (est.src === 'user') return '✎ ';
    if (est.uncertain) return '⚠ ';
    return est.src ? '≈ ' : '';
  }
  const fmtUnit = (n) => fmtNum(n, n >= 100 ? 0 : n >= 10 ? 1 : 2) + ' ' + t('networth.unit.ex_label');
  function priceTitle(ln) {
    const est = ln.est, out = [];
    if (ln.price != null) out.push(t('networth.line.price_unit', { v: fmtUnit(ln.price) }));
    if (est && est.src === 'user') out.push(t('networth.line.price_user'));
    else if (est && est.src === 'cx') out.push(t('networth.line.price_est_cx', { raw: fmtUnit(est.raw) }));
    else if (est && est.src === 'median') out.push(t('networth.line.price_est_median', { raw: fmtUnit(est.raw) }));
    else if (est && est.src === 'ninja') out.push(t('networth.line.price_est_ninja', { raw: fmtUnit(est.raw) }));
    if (est && est.uncertain) out.push(t('networth.line.price_uncertain'));
    if (est && est.refs && est.refs.length) {
      out.push(t('networth.line.price_sources') + ' ' + est.refs.map((r) => t('networth.line.price_src_' + r.src) + ' ' + fmtUnit(r.ex)).join(' · '));
    }
    out.push(t('networth.line.price_edit_hint'));
    return out.join('\n');
  }
  // own price per unit: typed in Ex ("0.25", "0,25" or "1/4"), empty = back to the feed.
  // Applies at once to every line of that item in every tab; stored in the config, so the
  // item tab, the currency tab and the next scan use it too.
  function startPriceEdit(ln, valEl) {
    const id = ln.priceId || ln.apiId;
    const inp = el('input', 'nw-cnt-edit nw-price-edit');
    inp.type = 'text'; inp.inputMode = 'decimal';
    inp.placeholder = t('networth.line.price_edit_placeholder');
    inp.value = ln.est && ln.est.src === 'user' && ln.price != null ? String(+ln.price.toFixed(4)) : '';
    valEl.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const commit = async () => {
      if (done) return; done = true;
      // German input: "1.000,5" = 1000.5 (dots group thousands when a comma is there)
      let txt = String(inp.value).trim();
      txt = txt.includes(',') ? txt.replace(/\./g, '').replace(',', '.') : txt;
      const frac = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(txt);
      const v = frac ? (+frac[1]) / (+frac[2]) : (txt === '' ? null : parseFloat(txt));
      if (txt !== '' && !(v > 0 && Number.isFinite(v))) { render(); return; }
      try { await window.api.setPriceOverride(id, v); } catch { render(); return; }
      for (const r of state.rows) for (const l of (r.result.lines || [])) {
        if ((l.priceId || l.apiId) !== id) continue;
        if (v != null) {
          // remember the feed's price once, so dropping the own price can restore it
          if (!(l.est && l.est.src === 'user')) l.feedPrice = { price: l.price, est: l.est || null };
          l.est = Object.assign({}, l.est || {}, { src: 'user', raw: l.feedPrice.price });
          l.price = v;
        } else if (l.est && l.est.src === 'user') {
          const fp = l.feedPrice || { price: null, est: null };
          l.price = fp.price; l.est = fp.est; delete l.feedPrice;
        }
      }
      persistRows(); render();
    };
    inp.onblur = commit;
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') { done = true; render(); } };
  }

  function startEdit(ln, cntEl, row) {
    const inp = el('input', 'nw-cnt-edit');
    inp.type = 'text'; inp.inputMode = 'numeric'; inp.value = String(effCount(ln));
    cntEl.replaceWith(inp); inp.focus(); inp.select();
    let done = false;
    const commit = () => {
      if (done) return; done = true;
      const raw = String(inp.value).replace(/[^0-9]/g, '');
      const v = raw === '' ? 0 : parseInt(raw, 10);
      const corrected = v !== (ln.count || 0);
      ln.userCount = corrected ? v : undefined;
      // teach the reader from this correction - fire-and-forget, never blocks the UI.
      // Only when there's an actual digit string to learn from (not "correcting" to 0,
      // which usually just means "this slot is empty", not "here is what 0 looks like").
      if (corrected && v > 0 && row) confirmCount(row, ln.apiId, v); // the typed number is the truth
      if (corrected && v > 0 && window.api.stashTeachCount) {
        window.api.stashTeachCount(ln.apiId, String(v), undefined, row && row.tab).catch(() => {});
      }
      render();
    };
    inp.onblur = commit;
    inp.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } else if (e.key === 'Escape') { done = true; render(); } };
  }

  function busyCard(tabId) {
    const card = el('div', 'nw-card nw-busy');
    const head = el('div', 'nw-card-head');
    head.appendChild(el('div', 'nw-card-title', tabId ? esc(TAB_LABEL[tabId] || tabId) : t('networth.status.scanning')));
    const st = el('div', 'nw-card-total');
    st.appendChild(el('span', 'nw-spin'));
    st.appendChild(el('span', 'nw-busy-lab', tabId ? t('networth.status.calculating') : t('networth.status.detecting_tab')));
    head.appendChild(st);
    card.appendChild(head);
    return card;
  }

  // replace-which / add-new modal (duplicates setting on, type already captured)
  function modalEl() {
    const m = state.modal;
    const back = el('div', 'nw-modal-back');
    const box = el('div', 'nw-modal');
    box.appendChild(el('div', 'nw-modal-title', t('networth.modal.title', { tabName: esc(TAB_LABEL[m.res.tab] || m.res.tab) })));
    box.appendChild(el('div', 'nw-modal-sub', t('networth.modal.subtitle')));
    for (const row of m.existing) {
      const b = el('button', 'nw-modal-opt');
      b.innerHTML = t('networth.modal.replace_option', { rowLabel: esc(labelFor(row)), amount: fmtEx(row.result.totalEx) });
      b.onclick = () => { row.result = m.res; state.modal = null; render(); };
      box.appendChild(b);
    }
    const addB = el('button', 'nw-modal-opt nw-modal-new', t('networth.modal.add_new'));
    addB.onclick = () => { addRow(m.res); state.modal = null; render(); };
    box.appendChild(addB);
    const cancel = el('button', 'nw-modal-cancel', t('networth.modal.cancel'));
    cancel.onclick = () => { state.modal = null; render(); };
    box.appendChild(cancel);
    back.appendChild(box);
    back.onclick = (e) => { if (e.target === back) { state.modal = null; render(); } };
    return back;
  }

  // ---------- community screenshot submission ----------
  // The reader is tuned against one screenshot and misreads other setups. Rather than
  // pretend otherwise, the tab says so and offers a way to send the captures that would
  // let it be fixed. Guided: currency tab first (most numbers = most useful), then any
  // two more. Nothing leaves the machine until the user sees it and presses send.
  const SAMPLE_MAX = 3;
  function sampleStep() { return state.sample ? state.sample.shots.length : 0; }

  function sampleModalEl() {
    const s = state.sample;
    const back = el('div', 'nw-modal-back');
    const box = el('div', 'nw-modal nw-sample-modal');
    const step = s.shots.length;

    box.appendChild(el('div', 'nw-modal-title', t('networth.sample.title')));
    if (s.sending) {
      box.appendChild(el('div', 'nw-modal-sub', t('networth.sample.sending')));
      back.appendChild(box); return back;
    }
    if (s.done) {
      box.appendChild(el('div', 'nw-modal-sub', tn('networth.sample.thanks', s.done, { count: s.done })));
      const ok = el('button', 'nw-modal-opt nw-modal-new', t('networth.sample.close'));
      ok.onclick = () => { state.sample = null; render(); };
      box.appendChild(ok);
      back.appendChild(box); return back;
    }

    box.appendChild(el('div', 'nw-modal-sub', step === 0
      ? t('networth.sample.step_currency')
      : t('networth.sample.step_more', { n: step, max: SAMPLE_MAX })));

    if (s.error) box.appendChild(el('div', 'nw-notice nw-error', esc(s.error)));

    if (s.shots.length) {
      const strip = el('div', 'nw-sample-list');
      s.shots.forEach((shot, i) => {
        const cell = el('div', 'nw-sample-item' + (shot.confirmed ? '' : ' nw-sample-unanswered'));
        const im = document.createElement('img');
        im.src = shot.scope === 'panel' ? (shot.panelDataUrl || shot.dataUrl) : shot.fullDataUrl;
        im.alt = '';
        im.title = t('networth.sample.enlarge');
        im.onclick = () => { window.api.stashSamplePreview(i); }; // opens its own window
        cell.appendChild(im);
        // The app cannot tell whether it actually caught the panel - a wrong box still
        // reads as a plausible tab. The person looking at the picture can, so just ask.
        // The app cannot tell whether it actually caught the panel - a wrong box still
        // reads as a plausible tab. The person looking at the picture can, so just ask,
        // and nothing sends until every shot has an answer.
        const body = el('div', 'nw-sample-body');
        if (!shot.confirmed) {
          body.appendChild(el('div', 'nw-sample-q', t('networth.sample.confirm_q')));
          const row = el('div', 'nw-sample-ask');
          const yes = el('button', 'nw-sample-ans nw-sample-yes', t('networth.sample.confirm_yes'));
          yes.onclick = () => { shot.confirmed = true; render(); };
          const no = el('button', 'nw-sample-ans', t('networth.sample.confirm_no'));
          no.onclick = async () => {
            const r = await window.api.stashSampleScope(i, 'window');
            if (r && r.ok) { shot.scope = r.scope; shot.confirmed = true; render(); }
          };
          row.appendChild(yes); row.appendChild(no);
          body.appendChild(row);
        } else {
          body.appendChild(el('div', 'nw-sample-q nw-sample-done', esc(shot.scope === 'window'
            ? t('networth.sample.using_window')
            : (shot.meta && shot.meta.read && shot.meta.read.tab
              ? (TAB_LABEL[shot.meta.read.tab] || shot.meta.read.tab)
              : t('networth.sample.unknown_tab')))));
        }
        cell.appendChild(body);
        const x = el('button', 'nw-sample-drop', '✕');
        x.title = t('networth.sample.remove');
        x.onclick = async () => {
          await window.api.stashSampleDrop(i);
          s.shots.splice(i, 1); render();
        };
        cell.appendChild(x);
        strip.appendChild(cell);
      });
      box.appendChild(strip);
    }

    // The grab hides the overlay, screenshots the game and runs the whole reader before
    // it returns, which is seconds on a big screen. Without a busy state the button just
    // sits there and the app reads as hung.
    if (s.capturing) {
      const busy = el('div', 'nw-sample-busy');
      busy.appendChild(el('span', 'nw-spin'));
      busy.appendChild(el('span', 'nw-busy-lab', t('networth.sample.capturing')));
      box.appendChild(busy);
    } else if (s.shots.length < SAMPLE_MAX) {
      const cap = el('button', 'nw-modal-opt', s.shots.length === 0
        ? t('networth.sample.capture_first') : t('networth.sample.capture_more'));
      cap.onclick = async () => {
        s.error = null; s.capturing = true; render();
        const r = await window.api.stashSampleCapture();
        s.capturing = false;
        if (!r || !r.ok) {
          const code = (r && r.error) || '?';
          s.error = code === 'game-window-not-found' ? t('networth.sample.capture_no_game')
            : code === 'game-window-black' ? t('networth.sample.capture_black')
              : t('networth.sample.capture_failed', { error: esc(code) });
        } else s.shots.push({
          dataUrl: r.dataUrl, fullDataUrl: r.fullDataUrl, panelDataUrl: r.panelDataUrl,
          scope: r.scope, meta: r.meta,
        });
        render();
      };
      box.appendChild(cap);
    }

    if (s.shots.length) {
      // a shot nobody has vouched for is exactly the sample that poisons the corpus,
      // so it cannot leave until it has an answer
      const unanswered = s.shots.filter((sh) => !sh.confirmed).length;
      const send = el('button', 'nw-modal-opt nw-modal-new' + (unanswered ? ' nw-modal-off' : ''),
        tn('networth.sample.send', s.shots.length, { count: s.shots.length }));
      send.disabled = unanswered > 0;
      if (unanswered) send.title = t('networth.sample.answer_first');
      send.onclick = async () => {
        if (unanswered) return;
        s.sending = true; render();
        const r = await window.api.stashSampleSend({ note: '' });
        s.sending = false;
        if (r && r.ok) { s.done = r.sent; s.shots = []; }
        else s.error = t('networth.sample.send_failed', { error: esc((r && r.error) || '?') });
        render();
      };
      box.appendChild(send);
      if (unanswered) box.appendChild(el('div', 'nw-sample-blocked', t('networth.sample.answer_first')));
    }

    // Which tabs the reader can actually score. Reference, not the next action, so it
    // sits under the button as a footnote instead of a second paragraph fighting the
    // step line for the top of a small modal.
    box.appendChild(el('div', 'nw-sample-req',
      t('networth.sample.tabs_required', { tabs: esc(Object.values(TAB_LABEL).join(', ')) })));

    const cancel = el('button', 'nw-modal-cancel', t('networth.modal.cancel'));
    cancel.onclick = async () => { await window.api.stashSampleReset(); state.sample = null; render(); };
    box.appendChild(cancel);
    back.appendChild(box);
    // NO backdrop dismissal here. Clicking beside the dialog used to run Cancel, which
    // calls stashSampleReset() and throws away every capture - one misclick and the user
    // starts the whole run again. This modal closes only via the Cancel button.
    back.onclick = null;
    return back;
  }

  // Tiny legend for the row tints. Only rendered when a captured tab actually contains
  // flagged rows - a key to symbols that are not on screen is just clutter. Deliberately
  // small and quiet: it explains a subtle cue, it should not out-shout the numbers.
  function reliabilityLegend() {
    const anyLow = state.showRel && state.rows.some((r) => (r.result.lines || []).some((ln) => ln.rel === 'low' && ln.userCount == null));
    const anyMixed = state.showRel && state.rows.some((r) => (r.result.lines || []).some((ln) => ln.rel === 'mixed' && ln.userCount == null));
    const anyEdited = state.rows.some((r) => (r.result.lines || []).some((ln) => ln.userCount != null));
    if (!anyLow && !anyMixed && !anyEdited) return null;
    const wrap = el('div', 'nw-legend');
    // one key per marker actually on screen; a key for a colour that is not showing
    // explains nothing and just crowds the row
    const key = (swClass, text) => {
      const k = el('span', 'nw-legend-key');
      k.appendChild(el('span', 'nw-legend-sw ' + swClass));
      k.appendChild(el('span', null, text));
      wrap.appendChild(k);
    };
    if (anyMixed) key('nw-legend-sw-mixed', t('networth.legend.mixed'));
    if (anyLow) key('nw-legend-sw-low', t('networth.legend.low'));
    if (anyEdited) key('nw-legend-sw-edited', t('networth.legend.edited'));
    return wrap;
  }

  // ---------- tab tour ("Fächer scannen") ----------
  // One tab after the other: "open tab X in game, then take the picture" - the app hides
  // itself and takes it - or "not owned / skip". Each picture is checked against the tab
  // it should be (main.js tourCapture: a mismatch teaches that tab's fingerprint), kept
  // for the align tool, and saved (userData/tab-shots) so aligning works later without
  // scanning again. Tabs already scanned show their picture and can be redone.
  // In the order the tabs are reached in game: the runes tab's five sub-tabs one after
  // the other (ritual used to sit between Kalguur runes and soul cores - out of the runes
  // tab and back in, reported), then the rest.
  // the player's own tabs join TAB_LABEL, so they show up as names, in the tour and in
  // "Wrong tab?" like the shipped ones (main.js stash-user-tabs / tab builder)
  let userTabs = {};
  function setUserTabs(map) {
    for (const k of Object.keys(TAB_LABEL)) if (k.startsWith('user-')) delete TAB_LABEL[k];
    userTabs = map || {};
    for (const [k, label] of Object.entries(userTabs)) TAB_LABEL[k] = label;
    const sr = document.getElementById('nw-set-root');
    if (sr && sr.childElementCount) renderSettings(sr);
    render();
  }
  if (window.api.stashUserTabs) window.api.stashUserTabs().then(setUserTabs).catch(() => {});
  if (window.api.onStashUserTabsChanged) window.api.onStashUserTabsChanged(setUserTabs);
  async function startBuilder(editKey) {
    // like calibrating: the settings go, the game (with the new tab open) must be visible
    const settings = document.getElementById('settings');
    if (settings) settings.classList.add('hidden');
    const tabBtn = document.getElementById('tab-networth');
    if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
    state.notice = { kind: 'info', msg: t('networth.builder.capturing') };
    render();
    const r = await window.api.stashBuilderStart(editKey ? { edit: editKey } : {}).catch(() => null);
    state.notice = r && r.ok
      ? { kind: 'ok', msg: t('networth.builder.opened', { n: r.cells }) }
      : { kind: 'err', msg: t('networth.builder.failed', { error: esc((r && r.error) || '?') }) };
    render();
  }

  const TOUR_ORDER = ['currency', 'abyss', 'essence', 'runes', 'runes-kalguuran', 'soulcore', 'idol', 'ancient-augment', 'ritual', 'delirium', 'breach', 'expedition', 'fragment'];
  const TOUR_TABS = () => TOUR_ORDER.filter((k) => TAB_LABEL[k]).concat(Object.keys(TAB_LABEL).filter((k) => !TOUR_ORDER.includes(k)));
  let tourHotkeyOn = false;
  // a reload with the dialog open must not leave the scan key stuck in tour mode
  try { if (window.api && window.api.stashTourHotkey) window.api.stashTourHotkey(false); } catch {}
  // the scan key / controller button while the tour is open: press the dialog's
  // "take picture" button (whichever mode, whichever tab is current)
  if (window.api && window.api.onStashTourShoot) window.api.onStashTourShoot(() => {
    if (!state.tour || state.tour.busy) return;
    const b = document.querySelector('.nw-tour [data-shoot]');
    if (b) b.click();
  });
  async function startTour(support) {
    const settings = document.getElementById('settings');
    if (settings) settings.classList.add('hidden');
    const tabBtn = document.getElementById('tab-networth');
    if (tabBtn && !tabBtn.classList.contains('active')) tabBtn.click();
    let saved = {};
    if (!support) { try { saved = (await window.api.stashTourList()) || {}; } catch {} }
    const status = {};
    for (const k of Object.keys(saved)) status[k] = Object.assign({ state: 'ok', old: true }, saved[k]);
    // support: picture only, next tab right after, "Done" opens the folder
    state.tour = { i: 0, status, busy: false, error: null, support: !!support };
    render();
  }
  function tourNext() {
    const tr = state.tour;
    tr.error = null;
    tr.i = Math.min(TOUR_TABS().length, tr.i + 1);
    render();
  }
  function tourModalEl() {
    const tr = state.tour;
    const tabs = TOUR_TABS();
    const back = el('div', 'nw-modal-back');
    const box = el('div', 'nw-modal nw-tour');
    box.appendChild(el('div', 'nw-modal-title', t(tr.support ? 'networth.tour.support_title' : 'networth.tour.title')));
    // progress: every tab as a chip - done, skipped, current
    const chips = el('div', 'nw-tour-chips');
    tabs.forEach((tab, k) => {
      const st = tr.status[tab];
      const mark = st ? (st.state === 'ok' ? '✓ ' : '– ') : '';
      const c = el('button', 'nw-tour-chip' + (k === tr.i ? ' cur' : '') + (st && st.state === 'ok' ? ' ok' : '') + (st && st.state === 'skip' ? ' skip' : ''), esc(mark + TAB_LABEL[tab]));
      c.onclick = () => { tr.i = k; tr.error = null; render(); };
      chips.appendChild(c);
    });
    box.appendChild(chips);
    if (tr.support) return supportModalBody(back, box, tr, tabs);
    if (tr.i >= tabs.length) {
      // summary: what was scanned, a way to align each, where the pictures are
      const done = tabs.filter((tb) => tr.status[tb] && tr.status[tb].state === 'ok').length;
      box.appendChild(el('div', 'nw-modal-sub', t('networth.tour.summary', { done, total: tabs.length })));
      const list = el('div', 'nw-tour-sumlist');
      for (const tab of tabs) {
        const st = tr.status[tab];
        if (!st || st.state !== 'ok') continue;
        const row = el('div', 'nw-tour-sumrow');
        row.appendChild(el('span', null, esc(TAB_LABEL[tab])));
        const al = el('button', 'nw-set-btn nw-set-btn-ghost', t('networth.row.adjust_label'));
        al.onclick = () => { window.api.stashAdjustOpen(tab).catch(() => {}); };
        row.appendChild(al);
        list.appendChild(row);
      }
      box.appendChild(list);
      const folder = el('button', 'nw-set-btn nw-set-btn-ghost', t('networth.tour.open_folder'));
      folder.title = t('networth.tour.open_folder_title');
      folder.onclick = () => { window.api.stashTourOpenFolder().catch(() => {}); };
      box.appendChild(folder);
      const close = el('button', 'nw-modal-opt nw-modal-new', t('networth.tour.close'));
      close.onclick = () => { state.tour = null; render(); };
      box.appendChild(close);
      back.appendChild(box);
      return back;
    }
    const tab = tabs[tr.i];
    const st = tr.status[tab];
    box.appendChild(el('div', 'nw-tour-step', t('networth.tour.step', { n: tr.i + 1, total: tabs.length, tab: esc(TAB_LABEL[tab]) })));
    if (tr.error) box.appendChild(el('div', 'nw-notice nw-error', esc(tr.error)));
    if (st && (st.state === 'ok' || st.state === 'ask')) {
      const shot = el('div', 'nw-tour-shot');
      if (st.thumb) { const im = document.createElement('img'); im.src = st.thumb; im.alt = ''; shot.appendChild(im); }
      const info = el('div', 'nw-tour-info');
      const other = esc(st.detected ? (TAB_LABEL[st.detected] || st.detected) : t('networth.tour.nothing'));
      if (st.state === 'ask') {
        // the picture is not the tab asked for - say so plainly, let the player decide
        info.appendChild(el('div', 'nw-tour-ask', t('networth.tour.ask', { tab: esc(TAB_LABEL[tab]), other })));
      } else {
        info.appendChild(el('div', null, st.learned
          ? t('networth.tour.confirmed', { tab: esc(TAB_LABEL[tab]) })
          : t('networth.tour.detected_ok', { tab: esc(TAB_LABEL[tab]) })));
        // unread slots are mostly items the player does not have - not a reading problem
        if (st.slotCount) info.appendChild(el('div', 'nw-dim', t('networth.tour.read', { read: st.readCount, empty: st.slotCount - st.readCount })));
        // what the automatic snapping did (main.js tourAutoSnap)
        const a = st.auto;
        if (a && a.rule && a.rule.kept) {
          info.appendChild(el('div', 'nw-tour-auto', t('networth.tour.rule_kept', { cells: a.rule.cells, of: a.rule.of, before: a.rule.before, after: a.rule.after })));
        } else if (a) {
          // the rule was tried and not kept: say so, then what the model snapping did
          const ruleLine = a.rule && !a.rule.few ? t('networth.tour.rule_discarded', { before: a.rule.before, after: a.rule.after }) + ' ' : '';
          const line = ruleLine + (!a.models ? t('networth.tour.auto_nomodel')
            : a.kept ? t('networth.tour.auto_kept', { moved: a.moved, models: a.models, before: a.readBefore, after: a.readAfter })
              : a.moved ? t('networth.tour.auto_discarded', { moved: a.moved, before: a.readBefore, after: a.readAfter == null ? '?' : a.readAfter })
                : t('networth.tour.auto_none', { models: a.models }));
          info.appendChild(el('div', 'nw-tour-auto', line + (a.unsure ? ' ' + t('networth.tour.auto_unsure', { n: a.unsure }) : '')));
        }
        if (st.old) info.appendChild(el('div', 'nw-dim', t('networth.tour.from_before')));
      }
      shot.appendChild(info);
      box.appendChild(shot);
    }
    const btns = el('div', 'nw-tour-btns');
    if (tr.busy) {
      const busy = el('div', 'nw-sample-busy');
      busy.appendChild(el('span', 'nw-spin'));
      busy.appendChild(el('span', 'nw-busy-lab', t('networth.tour.capturing')));
      box.appendChild(busy);
    } else {
      const cap = el('button', 'nw-modal-opt nw-modal-new', (st && st.state === 'ok' ? t('networth.tour.recapture') : t('networth.tour.capture')) + ` (${esc(state.hotkey)})`);
      cap.dataset.shoot = '1';
      cap.onclick = async () => {
        tr.busy = true; tr.error = null; render();
        const r = await window.api.stashTourCapture(tab).catch((e) => ({ ok: false, error: String(e) }));
        tr.busy = false;
        if (!r || !r.ok) {
          const code = (r && r.error) || '?';
          tr.error = code === 'game-window-not-found' ? t('networth.sample.capture_no_game')
            : code === 'game-window-black' ? t('networth.sample.capture_black')
              : t('networth.sample.capture_failed', { error: code });
        } else if (r.ask) tr.status[tab] = { state: 'ask', detected: r.detected, thumb: r.thumb };
        else tr.status[tab] = { state: 'ok', detected: r.detected, learned: r.learned, readCount: r.readCount, slotCount: r.slotCount, thumb: r.thumb, auto: r.auto };
        render();
      };
      if (st && st.state === 'ask') {
        cap.textContent = t('networth.tour.ask_retake');
        btns.appendChild(cap);
        const yes = el('button', 'nw-modal-opt', t('networth.tour.ask_confirm', { tab: esc(TAB_LABEL[tab]) }));
        yes.title = t('networth.tour.ask_confirm_title');
        yes.onclick = async () => {
          tr.busy = true; render();
          const r = await window.api.stashTourConfirm(tab).catch((e) => ({ ok: false, error: String(e) }));
          tr.busy = false;
          if (r && r.ok) tr.status[tab] = { state: 'ok', detected: r.detected, learned: true, readCount: r.readCount, slotCount: r.slotCount, thumb: r.thumb, auto: r.auto };
          else tr.error = t('networth.sample.capture_failed', { error: (r && r.error) || '?' });
          render();
        };
        btns.appendChild(yes);
      } else btns.appendChild(cap);
      if (st && st.state === 'ok') {
        const al = el('button', 'nw-modal-opt', t('networth.row.adjust_label'));
        al.onclick = () => { window.api.stashAdjustOpen(tab).catch(() => {}); };
        btns.appendChild(al);
        const nx = el('button', 'nw-modal-opt', t('networth.tour.next'));
        nx.onclick = () => tourNext();
        btns.appendChild(nx);
      } else {
        const sk = el('button', 'nw-modal-opt', t('networth.tour.skip'));
        sk.title = t('networth.tour.skip_title');
        sk.onclick = () => { tr.status[tab] = { state: 'skip' }; tourNext(); };
        btns.appendChild(sk);
      }
    }
    box.appendChild(btns);
    box.appendChild(el('div', 'nw-sample-req', t('networth.tour.hint')));
    const cancel = el('button', 'nw-modal-cancel', t('networth.tour.close'));
    cancel.onclick = () => { state.tour = null; render(); };
    box.appendChild(cancel);
    back.appendChild(box);
    back.onclick = null; // closes only via its buttons - a stray click must not lose the run
    return back;
  }

  // the picture-only run: step line, one big button, skip, and "Done - open folder"
  function supportModalBody(back, box, tr, tabs) {
    const done = tabs.filter((tb) => tr.status[tb] && tr.status[tb].state === 'ok').length;
    if (tr.i < tabs.length) {
      const tab = tabs[tr.i];
      box.appendChild(el('div', 'nw-tour-step', t('networth.tour.support_step', { n: tr.i + 1, total: tabs.length, tab: esc(TAB_LABEL[tab]) })));
      if (tr.error) box.appendChild(el('div', 'nw-notice nw-error', esc(tr.error)));
      const last = tr.lastThumb;
      if (last) { const im = document.createElement('img'); im.className = 'nw-tour-last'; im.src = last; im.alt = ''; box.appendChild(im); }
      // how the last picture was cut - a whole-screen one means the stash frame was not found
      if (last && tr.lastSource && tr.lastSource !== 'found') box.appendChild(el('div', 'nw-dim', t('networth.tour.support_src_' + tr.lastSource.replace('-', '_'))));
      const btns = el('div', 'nw-tour-btns');
      if (tr.busy) {
        const busy = el('div', 'nw-sample-busy');
        busy.appendChild(el('span', 'nw-spin'));
        busy.appendChild(el('span', 'nw-busy-lab', t('networth.tour.support_busy')));
        btns.appendChild(busy);
      } else {
        const cap = el('button', 'nw-modal-opt nw-modal-new', t('networth.tour.support_capture', { tab: esc(TAB_LABEL[tab]), hotkey: esc(state.hotkey) }));
        cap.dataset.shoot = '1';
        cap.onclick = async () => {
          tr.busy = true; tr.error = null; render();
          const r = await window.api.stashSupportShot(tab).catch((e) => ({ ok: false, error: String(e) }));
          tr.busy = false;
          if (r && r.ok) { tr.status[tab] = { state: 'ok' }; tr.lastThumb = r.thumb; tr.lastSource = r.source; tr.i++; }
          else {
            const code = (r && r.error) || '?';
            tr.error = code === 'game-window-not-found' ? t('networth.sample.capture_no_game')
              : code === 'game-window-black' ? t('networth.sample.capture_black')
                : t('networth.sample.capture_failed', { error: code });
          }
          render();
        };
        btns.appendChild(cap);
        const sk = el('button', 'nw-modal-opt', t('networth.tour.skip'));
        sk.onclick = () => { tr.status[tab] = { state: 'skip' }; tr.i++; tr.error = null; render(); };
        btns.appendChild(sk);
      }
      box.appendChild(btns);
    } else {
      box.appendChild(el('div', 'nw-modal-sub', t('networth.tour.support_summary', { done, total: tabs.length })));
    }
    const fin = el('button', 'nw-modal-opt' + (tr.i >= tabs.length ? ' nw-modal-new' : ''), t('networth.tour.support_done', { n: done }));
    fin.onclick = () => { window.api.stashSupportOpenFolder().catch(() => {}); state.tour = null; render(); };
    box.appendChild(fin);
    const cancel = el('button', 'nw-modal-cancel', t('networth.tour.close'));
    cancel.onclick = () => { state.tour = null; render(); };
    box.appendChild(cancel);
    back.appendChild(box);
    back.onclick = null;
    return back;
  }

  function startSampleFlow() {
    return window.api.stashSampleReset().then(() => {
      state.sample = { shots: [], error: null, sending: false, done: 0 };
      render();
    });
  }

  // Dismissable: for someone whose counts are right, a permanent "send screenshots if
  // it's broken" is noise. The same flow lives permanently in Settings -> Net Worth, so
  // dismissing here abandons nothing.
  function experimentalBanner() {
    if (state.bannerHidden) return null;
    const b = el('div', 'nw-exp');
    b.appendChild(el('div', 'nw-exp-body', t('networth.experimental.explain')));
    const btn = el('button', 'nw-exp-btn', t('networth.experimental.submit_button'));
    btn.onclick = () => { startSampleFlow(); };
    b.appendChild(btn);
    const x = el('button', 'nw-exp-x', '✕');
    x.title = t('networth.experimental.dismiss_title');
    x.onclick = () => {
      state.bannerHidden = true;
      try { window.api.setStashBannerHidden(true); } catch { /* keeps for this session */ }
      render();
    };
    b.appendChild(x);
    return b;
  }

  function render() {
    const root = $('networth-root'); if (!root) return;
    // root is the scroll container: emptying it throws the scroll position away, so a
    // save/paste in the OCR-debug panel used to jump the list - keep it
    const scrollTop = root.scrollTop;
    root.innerHTML = '';
    const wrap = el('div', 'nw');

    const gt = grandTotals();
    const rows = state.rows.length;
    const included = state.rows.filter((r) => r.included).length;
    const header = el('div', 'nw-header');
    const totBox = el('div', 'nw-grand');
    totBox.appendChild(el('div', 'nw-grand-lab', rows ? tn('networth.header.tabs_included', rows, { included, total: rows }) : t('networth.header.no_tabs_captured')));
    const gline = el('div', 'nw-grand-val' + (rows && gt.edited ? ' nw-edited' : ''));
    gline.appendChild(el('span', 'nw-total-lab', t('networth.header.total_label')));
    gline.insertAdjacentHTML('beforeend', unitsHtml(rows ? gt.ex : null, gt.prices));
    if (rows && gt.mirrors != null) gline.appendChild(el('span', 'nw-mirror',
      `(${fmtNum(gt.mirrors)}<img class="nw-mirror-ic" src="${MIRROR_ICON}" alt="${t('networth.grand.mirror_alt')}">)`));
    totBox.appendChild(gline);
    header.appendChild(totBox);
    const controls = el('div', 'nw-controls');
    if (state.busy) {
      const q = state.queued > 1 ? ' (' + state.queued + ')' : '';
      controls.appendChild(el('span', 'nw-scanning', t('networth.status.scanning') + q));
    } else if (state.lastScan && state.lastScan.fresh) {
      controls.appendChild(el('span', 'nw-scan-ok', esc('✓ ' + (TAB_LABEL[state.lastScan.tab] || state.lastScan.tab) + ' · ' + fmtTime(state.lastScan.at, true))));
    }
    const gear = el('button', 'nw-gear', '⚙'); gear.title = t('networth.header.settings_tooltip', { hotkey: state.hotkey });
    gear.onclick = () => { if (window.openNetWorthSettings) window.openNetWorthSettings(); };
    controls.appendChild(gear);
    header.appendChild(controls);
    wrap.appendChild(header);
    if (state.wizard) wrap.appendChild(wizardCard());
    { const xb = experimentalBanner(); if (xb) wrap.appendChild(xb); }
    { const lg = reliabilityLegend(); if (lg) wrap.appendChild(lg); }
    // the "Nicht mitzählen" lists with their switches, right on the tab - an item left out
    // must never be a surprise
    { const ch = window.NwSkipGroups && window.NwSkipGroups.chips(render); if (ch) wrap.appendChild(ch); }

    if (state.notice) {
      const n = el('div', 'nw-notice nw-' + state.notice.kind, esc(state.notice.msg));
      if (state.notice.pickTab) n.appendChild(unknownPicker());
      if (state.notice.actions) {
        const row = el('div', 'nw-notice-actions');
        for (const a of state.notice.actions) {
          const btn = el('button', 'nw-set-btn' + (a.ghost ? ' nw-set-btn-ghost' : ''), esc(a.label));
          btn.onclick = (e) => { e.stopPropagation(); state.notice = null; a.fn(); render(); };
          row.appendChild(btn);
        }
        n.appendChild(row);
      }
      wrap.appendChild(n);
    }

    const pending = state.busy && state.phase === 'detecting' ? state.pendingTab : null;
    if (!rows && !state.busy) {
      wrap.appendChild(el('div', 'nw-empty',
        t('networth.empty.instructions', { hotkey: esc(state.hotkey) }) + '<br>'
        + t('networth.empty.explain') + '<br>'
        + t('networth.empty.supported_tabs', { tabs: esc(Object.values(TAB_LABEL).join(', ')) })
        ));
      if (!state.wizard) {
        const tb = el('button', 'nw-set-btn', t('networth.tour.start'));
        tb.title = t('networth.tour.start_title');
        tb.onclick = () => startTour();
        wrap.appendChild(tb);
        const wz = el('button', 'nw-set-btn', t('networth.wizard.start'));
        wz.onclick = () => startWizard();
        wrap.appendChild(wz);
      }
    } else {
      for (const row of state.rows) wrap.appendChild(rowCard(row));
      // Dropping BELOW the last card had no target at all: every handler sat on a card, so
      // the gap under the list showed the no-drop cursor and no indicator. The container
      // takes the drop past the last card and sends it to the end, which is what dragging
      // down there obviously means.
      wrap.ondragover = (e) => {
        if (state.dragId == null) return;
        const cards = wrap.querySelectorAll('.nw-card');
        const last = cards[cards.length - 1];
        if (!last || e.clientY <= last.getBoundingClientRect().bottom) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        wrap.querySelectorAll('.nw-card').forEach((n) => n.classList.remove('nw-drop', 'nw-drop-before', 'nw-drop-after'));
        last.classList.add('nw-drop-after');
      };
      wrap.ondrop = (e) => {
        if (state.dragId == null) return;
        const cards = wrap.querySelectorAll('.nw-card');
        const last = cards[cards.length - 1];
        if (!last || e.clientY <= last.getBoundingClientRect().bottom) return;
        e.preventDefault();
        const moved = state.rows.find((r) => r.id === state.dragId);
        if (moved) { state.rows.splice(state.rows.indexOf(moved), 1); state.rows.push(moved); }
        state.dragId = null; render();
      };
      if (state.busy) wrap.appendChild(busyCard(pending));
      if (rows) {
        const footer = el('div', 'nw-footer');
        const clear = el('button', 'nw-reset', t('networth.footer.clear_tally'));
        clear.onclick = () => { state.rows = []; state.expanded = {}; state.notice = null; render(); };
        footer.appendChild(clear);
        if (anyEdits()) {
          const re = el('button', 'nw-reset nw-reset-edits', t('networth.footer.reset_edits'));
          re.title = t('networth.footer.reset_edits_title');
          re.onclick = () => { for (const r of state.rows) for (const ln of r.result.lines) { ln.userCount = undefined; ln.excluded = false; } render(); };
          footer.appendChild(re);
        }
        wrap.appendChild(footer);
      }
    }
    root.appendChild(wrap);
    if (state.modal) root.appendChild(modalEl());
    if (state.sample) root.appendChild(sampleModalEl());
    if (state.tour) root.appendChild(tourModalEl());
    // tell main whether the scan key should take tour pictures
    if (!!state.tour !== tourHotkeyOn) { tourHotkeyOn = !!state.tour; try { window.api.stashTourHotkey(tourHotkeyOn); } catch {} }
    root.scrollTop = scrollTop;
    persistRows();
  }

  // staged events from main drive live feedback (works even while hidden)
  if (window.api) {
    // a capture always brings the tally into view - the tab can be hidden via
    // App Settings, but its hotkey still works, and a capture nobody can see
    // would look broken
    if (window.api.onStashCapturing) window.api.onStashCapturing(() => {
      state.busy = true; state.phase = 'scanning'; state.pendingTab = null; state.notice = null;
      if (window.showNetWorthTab) window.showNetWorthTab();
      render();
    });
    if (window.api.onStashDetected) window.api.onStashDetected((tab) => { state.busy = true; state.phase = 'detecting'; state.pendingTab = tab; render(); });
    if (window.api.onStashCaptured) window.api.onStashCaptured((res) => {
      // another capture may still be in flight - only clear the spinner when the queue
      // has actually drained, which main reports
      if (!state.queued) { state.busy = false; state.phase = 'idle'; state.pendingTab = null; }
      // a fresh frame means the OCR-debug images (if the toggle is on) are stale - drop
      // the cache so the next render re-fetches instead of showing the previous capture's
      // crop under this scan's numbers
      for (const k of Object.keys(dbgImgCache)) delete dbgImgCache[k];
      wizardOnScan(res);
      applyResult(res);
      calCheckResult(res);
      // first scan of a tab: its boxes were put onto the cells (main.js autoPlaceNewTab)
      if (res && res.autoPlaced && !state.notice) { state.notice = { kind: 'ok', msg: t('networth.notice.auto_placed', { tab: TAB_LABEL[res.tab] || res.tab, n: res.autoPlaced }) }; render(); }
      detectOffer(res);
      reviewOffer(res);
    });
    if (window.api.onStashQueued) window.api.onStashQueued((info) => {
      state.queued = (info && info.depth) || 0;
      if (!state.queued) { state.busy = false; state.phase = 'idle'; state.pendingTab = null; }
      render();
    });
    if (window.api.onStashTuneProgress) window.api.onStashTuneProgress((m) => {
      if (!state.tuning || m.tab !== state.tuning.tab) return;
      const tabName = TAB_LABEL[m.tab] || m.tab;
      state.notice = { kind: 'info', msg: m.phase === 'tune-slot'
        ? t('networth.tune.progress_slots', { tab: esc(tabName), done: m.done, total: m.total })
        : t('networth.tune.progress', { tab: esc(tabName), pct: Math.min(99, Math.round(100 * m.done / Math.max(1, m.total))) }) };
      render();
    });
    if (window.api.onStashAdjusted) window.api.onStashAdjusted(() => {
      if (state.wizard && state.wizard.step === 3) { state.wizard.step = 4; render(); }
    });
    if (window.api.onStashCalibrateState) window.api.onStashCalibrateState((st) => {
      if (!st) return;
      if (st.phase === 'window') state.notice = { kind: 'warn', msg: t(st.note ? 'networth.calibrate.window_not_found' : 'networth.calibrate.window') };
      else if (st.phase === 'cancelled') state.notice = { kind: 'warn', msg: t('networth.calibrate.cancelled') };
      render();
    });
    if (window.api.onStashCalibrated) window.api.onStashCalibrated((res) => {
      state.busy = false; state.phase = 'idle'; state.pendingTab = null; state.calibrated = true;
      const scale = res && typeof res.calScale === 'number' ? res.calScale : 1;
      const small = scale < 0.92;
      const smallMsg = small ? t('networth.calibrate.small_panel_warning', { scalePercent: Math.round(scale * 100) }) : '';
      if (state.wizard && state.wizard.step === 1) state.wizard.step = 2; // calibrated - now scan
      if (res && res.scanning) { // saved; the test scan runs and reports like any scan
        const f = res.fit || {};
        const how = f.cells && !f.error ? t(res.auto ? 'networth.calibrate.by_auto' : 'networth.calibrate.by_cells', { cells: f.cells, of: f.of }) : t('networth.calibrate.by_hand');
        state.calCheck = { how, small: smallMsg };
        state.notice = { kind: small || f.error ? 'warn' : 'ok', msg: how + ' ' + t('networth.calibrate.saved_scanning', { smallPanelWarning: smallMsg }) };
        render(); return;
      }
      if (res && res.ok && !res.mismatch) {
        wizardOnScan(res);
        applyResult(res);
        state.notice = { kind: small ? 'warn' : 'ok', msg: t('networth.calibrate.success', { tabName: TAB_LABEL[res.tab] || res.tab, readCount: res.readCount, slotCount: res.slotCount, smallPanelWarning: smallMsg }) };
      } else {
        state.notice = { kind: 'warn', msg: t('networth.calibrate.no_tab_read', { hotkey: state.hotkey, smallPanelWarning: smallMsg }) };
      }
      render();
    });
  }

  // collapse / expand every tab card at once: any open -> close all, else open all
  { const f = document.getElementById('nw-fold-all'); if (f) f.addEventListener('click', () => {
    const anyOpen = state.rows.some((r) => state.expanded[r.id]);
    for (const r of state.rows) state.expanded[r.id] = !anyOpen;
    render();
  }); }
  window.NetWorth = { render, capture, renderSettings };
})();
