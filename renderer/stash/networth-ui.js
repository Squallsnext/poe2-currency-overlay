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
  const fmtEx = (n) => n == null ? t('networth.value.none') : Math.round(n).toLocaleString('en-US') + ' ' + unit(t('networth.unit.ex_label'), 'exalted');
  const fmtDiv = (n) => n == null ? null : (n >= 100 ? Math.round(n) : n.toFixed(1)).toLocaleString('en-US') + ' ' + unit(t('networth.unit.div_label'), 'divine');
  const fmtCount = (n) => Number(n).toLocaleString('en-US');

  const state = { rows: [], expanded: {}, nextId: 1, dup: false, sortLayout: false, showMissing: false, showConfidence: false, showOcrDebug: false, calibrated: false, hotkey: 'F7', dragId: null, busy: false, phase: 'idle', pendingTab: null, queued: 0, notice: null, modal: null };
  // apiId -> {rawUrl, binUrl} | 'loading', for the OCR-debug toggle. Cleared on every
  // fresh capture (see onStashCaptured below) and per-slot after a teach/forget, since
  // either changes what the NEXT fetch of that slot would show.
  const dbgImgCache = {};
  // OCR-debug "copy settings": slider values copied from one slot, to paste onto another.
  // In memory only (per app session) - pasting just moves the target's sliders, saving
  // is still an explicit "Speichern" there.
  let dbgClipboard = null;
  const TAB_LABEL = { currency: t('networth.tab.currency'), abyss: t('networth.tab.abyss'), essence: t('networth.tab.essence'), runes: t('networth.tab.runes'), 'runes-kalguuran': t('networth.tab.runes_kalguuran'), ritual: t('networth.tab.ritual'), soulcore: t('networth.tab.soulcore'), idol: t('networth.tab.idol'), 'ancient-augment': t('networth.tab.ancient_augment'), delirium: t('networth.tab.delirium'), breach: t('networth.tab.breach'), expedition: t('networth.tab.expedition') };
  const MIRROR_ICON = 'https://web.poecdn.com/gen/image/WzI1LDE0LHsiZiI6IjJESXRlbXMvQ3VycmVuY3kvQ3VycmVuY3lEdXBsaWNhdGUiLCJzY2FsZSI6MSwicmVhbG0iOiJwb2UyIn1d/26bc31680e/CurrencyDuplicate.png';

  if (window.api && window.api.getConfig) window.api.getConfig().then((c) => { state.dup = !!(c && c.stashDupTabs); state.sortLayout = !!(c && c.stashSortLayout); state.showMissing = !!(c && c.stashShowMissing); state.showConfidence = !!(c && c.stashShowConfidence); state.showOcrDebug = !!(c && c.stashShowOcrDebug); state.calibrated = !!(c && c.stashCalibration); state.hotkey = (c && c.stashHotkey) || 'F7'; state.bannerHidden = !!(c && c.stashBannerHidden); render(); }).catch(() => {});

  const rowsOfType = (tab) => state.rows.filter((r) => r.tab === tab);
  function labelFor(row) {
    const same = rowsOfType(row.tab);
    const base = TAB_LABEL[row.tab] || row.tab;
    return same.length <= 1 ? base : t('networth.row.label_with_index', { tabName: base, index: same.indexOf(row) + 1 });
  }
  // Rows land in CAPTURE order, not completion order. Reads run in a pool so a small tab
  // can finish before a big one grabbed earlier; main stamps each capture with a sequence
  // and the row is inserted against it.
  function addRow(res) {
    const row = { id: state.nextId++, tab: res.tab, result: res, included: true, seq: res.seq };
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

  function capture() {
    // no busy gate: grabs queue in main and reads run behind them, so pressing the
    // hotkey tab-after-tab is the point rather than something to guard against
    state.notice = null;
    try { window.api.stashCaptureStart(); } catch (e) { state.notice = { kind: 'err', msg: t('networth.notice.capture_unavailable') }; render(); }
  }

  // Fold a capture result into the tally. Dedup-by-type unless the duplicate
  // setting is on, in which case ask what to do when the type already exists.
  function applyResult(res) {
    // remembered so Settings can offer manual calibration only once auto-detection
    // has actually come up empty
    if (res && typeof res.autoFound === 'boolean') state.autoFound = res.autoFound;
    if (!res || !res.ok) { state.notice = { kind: 'err', msg: t('networth.notice.capture_failed', { error: res && res.error || 'unknown error' }) }; return render(); }
    if (res.mismatch) { state.notice = { kind: 'warn', msg: t('networth.notice.mismatch', { readCount: res.readCount || 0, supportedTabs: Object.values(TAB_LABEL).join(', ') }) }; return render(); }
    state.notice = null;
    const existing = rowsOfType(res.tab);
    if (!existing.length) { addRow(res); return render(); }
    if (!state.dup) { existing[0].result = res; return render(); } // single row per type: update it
    state.modal = { res, existing };                               // duplicates on: ask
    render();
  }

  // effective per-line values, honouring manual count edits (userCount) + toggles (excluded)
  const effCount = (ln) => (ln.userCount != null ? ln.userCount : ln.count) || 0;
  const lineOn = (ln) => !ln.excluded;
  const lineVal = (ln) => (lineOn(ln) && ln.price != null) ? effCount(ln) * ln.price : 0;
  const rowTotalEx = (res) => (res.lines || []).reduce((s, ln) => s + lineVal(ln), 0);
  const rowEdited = (res) => (res.lines || []).some((ln) => ln.userCount != null);

  function grandTotals() {
    let ex = 0, divPrice = null, mirrorPrice = null, edited = false;
    for (const r of state.rows) {
      if (!r.included) continue;
      ex += rowTotalEx(r.result);
      if (rowEdited(r.result)) edited = true;
      if (r.result.divPrice) divPrice = r.result.divPrice;
      if (r.result.mirrorPrice) mirrorPrice = r.result.mirrorPrice;
    }
    return { ex, div: divPrice ? ex / divPrice : null, mirrors: mirrorPrice && ex >= mirrorPrice ? Math.floor(ex / mirrorPrice) : null, edited };
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
    toggles.appendChild(mkToggle(state.showConfidence, t('networth.settings.toggle_confidence_label'),
      t('networth.settings.toggle_confidence_sub'),
      (v) => { state.showConfidence = v; try { window.api.setStashShowConfidence(v); } catch {} }));
    toggles.appendChild(mkToggle(state.showOcrDebug, t('networth.settings.toggle_ocr_debug_label'),
      t('networth.settings.toggle_ocr_debug_sub'),
      (v) => { state.showOcrDebug = v; try { window.api.setStashShowOcrDebug(v); } catch {} }));
    root.appendChild(toggles);
    // Settings above, recovery tools below - the divider keeps users from reading
    // calibration/submission as steps they are meant to take. Same shape as the Reprice
    // card: the supported list first, the screenshot path for sizes NOT on it, manual
    // calibration last for sizes that ARE on it.
    root.appendChild(el('div', 'set-divider', t('ui.settings.troubleshoot_heading')));

    const res = el('div', 'set-field');
    const resIn = el('div', 'set-inline');
    resIn.appendChild(el('label', null, t('networth.settings.supported_res_label')));
    resIn.appendChild(el('span', 'set-sub', '1920×1080, 2560×1440'));
    res.appendChild(resIn);
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
    const btns = el('div', 'nw-set-cal-btns');
    const calBtn = el('button', 'nw-set-btn', state.calibrated ? t('networth.settings.cal_button_recalibrate') : t('networth.settings.cal_button_calibrate'));
    calBtn.onclick = () => { try { window.api.stashCalibrateStart(); } catch {} };
    btns.appendChild(calBtn);
    if (state.calibrated) {
      const clr = el('button', 'nw-set-btn nw-set-btn-ghost', t('networth.settings.cal_reset_button'));
      clr.title = t('networth.settings.cal_reset_title');
      clr.onclick = () => { try { window.api.clearStashCalibration(); } catch {} state.calibrated = false; renderSettings(root); render(); };
      btns.appendChild(clr);
    }
    cal.appendChild(btns);
    root.appendChild(cal);
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
    head.appendChild(title);

    // Only offered when something on this tab actually needs it - a slot the reader
    // itself flags as low-confidence or unread. Opens the same drag-to-fix tool the
    // dev-only debug output has had for a while, as a real window; saving writes
    // straight into config so the fix applies from the very next scan.
    if ((r.lines || []).some((ln) => ln.missing || (ln.conf != null && ln.conf < 0.80)) && window.api.stashAdjustOpen) {
      const adj = el('button', 'nw-card-adjust', t('networth.row.adjust_label'));
      adj.title = t('networth.row.adjust_title');
      adj.onclick = async (e) => {
        e.stopPropagation();
        const res = await window.api.stashAdjustOpen(row.tab).catch(() => ({ ok: false }));
        if (!res || !res.ok) console.warn('stash-adjust-open:', res && res.reason);
      };
      head.appendChild(adj);
    }
    const rowEx = rowTotalEx(r);
    const tot = el('div', 'nw-card-total' + (rowEdited(r) ? ' nw-edited' : ''));
    tot.appendChild(el('span', 'nw-ex', fmtEx(rowEx)));
    if (r.divPrice) tot.appendChild(el('span', 'nw-div', fmtDiv(rowEx / r.divPrice)));
    head.appendChild(tot);
    head.onclick = (e) => { if (e.target === cb) return; state.expanded[row.id] = !open; render(); };

    // per-row remove
    const del = el('button', 'nw-del', '✕'); del.title = t('networth.row.remove_title');
    del.onclick = (e) => { e.stopPropagation(); state.rows = state.rows.filter((x) => x !== row); render(); };
    head.appendChild(del);
    card.appendChild(head);
    if (!open) return card;

    const list = el('div', 'nw-lines');
    const byVal = (a, b) => (lineVal(b) - lineVal(a)) || ((b.count || 0) - (a.count || 0));
    const bySlot = (a, b) => (a.slot || 0) - (b.slot || 0);
    const all = r.lines.slice();
    const owned = all.filter((ln) => !ln.missing).sort(state.sortLayout ? bySlot : byVal);
    const missing = all.filter((ln) => ln.missing).sort(bySlot); // shown only with "Show missing", at the bottom
    const shown = state.showMissing ? owned.concat(missing) : owned;
    for (const ln of shown) {
      // Rows our own testing says to distrust are marked, so a wrong number is visible
      // rather than silently averaged into the total. `rel` is measured per slot against
      // every ground-truthed capture we hold; a user edit clears the flag, because once
      // they have typed the real number there is nothing left to doubt.
      const relFlag = ln.userCount == null ? (ln.rel || null) : null;
      const line = el('div', 'nw-line'
        + (ln.userCount != null ? ' nw-line-edited' : '')
        + (ln.excluded ? ' nw-line-off' : '')
        + (ln.missing ? ' nw-line-missing' : '')
        + (relFlag ? ' nw-line-rel-' + relFlag : ''));
      if (relFlag) {
        line.title = relFlag === 'low'
          ? t('networth.line.unreliable_low')
          : t('networth.line.unreliable_mixed');
      }
      const tg = el('input', 'nw-line-inc'); tg.type = 'checkbox'; tg.checked = !ln.excluded; tg.title = t('networth.row.include_title');
      tg.onclick = (e) => { e.stopPropagation(); ln.excluded = !tg.checked; render(); };
      line.appendChild(tg);
      if (ln.icon) { const img = el('img', 'nw-ic'); img.src = ln.icon; img.onerror = () => img.remove(); line.appendChild(img); }
      else line.appendChild(el('div', 'nw-ic nw-ic-none'));
      line.appendChild(el('div', 'nw-name', esc(window.gameName(ln.name)))); // feed is English; show the client's own name
      if (state.showConfidence && ln.conf != null) {
        const pct = Math.round(ln.conf * 100);
        const cl = pct >= 88 ? 'ok' : (pct >= 80 ? 'mid' : 'low');
        const cf = el('div', 'nw-conf nw-conf-' + cl, pct + '%');
        cf.title = t('networth.line.confidence_title');
        line.appendChild(cf);
        // Low confidence but already-correct reads (a thin margin at OCR time, not a
        // wrong value) never reach the teach pipeline otherwise - it only fires on an
        // actual correction. This is an explicit, deliberate "yes" from the user, so it's
        // safe to feed the same way: unlike the count field's blur handler, it can't fire
        // from an idle click that never checked the number.
        if (cl === 'low' && effCount(ln) > 0 && window.api.stashTeachCount) {
          const okBtn = el('button', 'nw-conf-confirm', '✓');
          okBtn.title = t('networth.line.confirm_title');
          okBtn.onclick = async (e) => {
            e.stopPropagation();
            okBtn.disabled = true;
            let res;
            try { res = await window.api.stashTeachCount(ln.apiId, String(effCount(ln))); }
            catch { res = { ok: false }; }
            if (res && res.ok) {
              okBtn.classList.add('nw-conf-confirm-done');
              okBtn.textContent = '✓';
              okBtn.title = t('networth.line.confirm_done_title');
            } else {
              // Segmentation couldn't isolate one glyph per digit for this exact frame
              // (touching digits, icon bleed, ...) - the teach pipeline refuses rather
              // than guessing, so say so instead of showing a false "learned" tick.
              okBtn.classList.add('nw-conf-confirm-failed');
              okBtn.textContent = '!';
              okBtn.title = t('networth.line.confirm_failed_title');
              okBtn.disabled = false;
            }
          };
          line.appendChild(okBtn);
        }
      }
      const cnt = el('div', 'nw-cnt'); cnt.innerHTML = `<span class="nw-x">×</span>${esc(fmtCount(effCount(ln)))}`;
      cnt.title = t('networth.line.edit_count_title');
      cnt.onclick = (e) => { e.stopPropagation(); startEdit(ln, cnt); };
      line.appendChild(cnt);
      line.appendChild(el('div', 'nw-val', ln.price == null ? t('networth.line.no_price') : fmtEx(lineVal(ln))));
      const rb = el('button', 'nw-line-reset' + ((ln.userCount != null || ln.excluded) ? '' : ' nw-line-reset-off'), '↺');
      rb.title = t('networth.line.reset_title');
      rb.onclick = (e) => { e.stopPropagation(); ln.userCount = undefined; ln.excluded = false; render(); };
      line.appendChild(rb);
      list.appendChild(line);
      // OCR-debug toggle: the exact crop the reader worked from, so a problem slot can be
      // judged by eye - raw (native pixels, upscaled) and the binarized cell it actually
      // template-matched against - plus a way to fix it from right there: type the real
      // number (the count field above already teaches on a real correction) or confirm it
      // (the checkmark above already teaches on confirmation), and if the digit templates
      // themselves seem to be the problem, forget them and let them rebuild from scratch.
      if (state.showOcrDebug && !ln.missing && window.api.stashSlotDebugImage) {
        const dbg = el('div', 'nw-dbg');
        const cached = dbgImgCache[ln.apiId];
        if (cached === 'loading') {
          dbg.textContent = '…';
        } else if (cached && cached.ok) {
          const imgs = el('div', 'nw-dbg-imgs');
          // original | the greyscale the reader works from after colour limit/contrast
          // (removed pixels black) | the black/white cell floor cuts from it
          const rawImg = el('img', 'nw-dbg-img'); rawImg.src = cached.rawUrl; rawImg.title = t('networth.line.debug_img_raw');
          const filtImg = el('img', 'nw-dbg-img'); filtImg.src = cached.filtUrl; filtImg.title = t('networth.line.debug_img_filtered');
          const binImg = el('img', 'nw-dbg-img'); binImg.src = cached.binUrl; binImg.title = t('networth.line.debug_img_binarized');
          imgs.appendChild(rawImg); imgs.appendChild(filtImg); imgs.appendChild(binImg);
          dbg.appendChild(imgs);

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
          const showPreview = (p) => {
            previewLabel.textContent = t('networth.line.debug_preview', { text: p ? p.text : '?', pct: p ? Math.round(p.conf * 100) : 0 });
          };
          showPreview(cached.preview);
          let debounceT = null;
          const refreshPreview = () => {
            clearTimeout(debounceT);
            debounceT = setTimeout(async () => {
              // an untouched, unsaved floor previews the adaptive sweep, like the live read
              const v = values();
              if (!touched.has('floor') && saved.floor == null) v.floor = null;
              const res = await window.api.stashSlotDebugImage(ln.apiId, v).catch(() => null);
              if (!res || !res.ok) return;
              rawImg.src = res.rawUrl; filtImg.src = res.filtUrl; binImg.src = res.binUrl;
              showPreview(res.preview);
              Object.assign(cached, { defaults: res.defaults, effFloor: res.effFloor, rawUrl: res.rawUrl, filtUrl: res.filtUrl, binUrl: res.binUrl, preview: res.preview });
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
            try { await window.api.stashSlotSaveReadSettings(ln.apiId, out); } catch {}
            delete dbgImgCache[ln.apiId];
            render();
          };
          resetBtn.onclick = async (e) => {
            e.stopPropagation();
            resetBtn.disabled = true;
            try { await window.api.stashSlotSaveReadSettings(ln.apiId, null); } catch {}
            delete dbgImgCache[ln.apiId];
            render();
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
          pasteBtn.onclick = (e) => { e.stopPropagation(); if (dbgClipboard) setAll(dbgClipboard, true); };
          presetRow.appendChild(stdBtn); presetRow.appendChild(offBtn);
          presetRow.appendChild(copyBtn); presetRow.appendChild(pasteBtn);
          btnRow.appendChild(saveBtn);
          if (hasSaved) btnRow.appendChild(resetBtn);
          btnRow.appendChild(status);
          updateStatus();
          controls.appendChild(previewLabel);
          for (const sp of specs) controls.appendChild(sliders[sp.key].row);
          controls.appendChild(presetRow);
          controls.appendChild(btnRow);
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
            const learnMsg = el('span', 'nw-dbg-floor-val');
            learnBtn.onclick = async (e) => {
              e.stopPropagation();
              const value = learnIn.value.replace(/[^0-9]/g, '');
              if (!value) return;
              learnBtn.disabled = true;
              const v = values();
              if (!touched.has('floor') && saved.floor == null) v.floor = cached.floor; // the floor the preview used
              let res;
              try { res = await window.api.stashTeachCount(ln.apiId, value, v); } catch { res = { ok: false }; }
              learnBtn.disabled = false;
              if (res && res.ok) {
                learnMsg.textContent = t('networth.line.debug_learn_ok', { value });
                refreshPreview(); // the reader's answer with the newly learned digits
              } else if (res && res.reason === 'segment-mismatch') {
                learnMsg.textContent = t('networth.line.debug_learn_parts', { found: res.found, want: res.want });
              } else {
                learnMsg.textContent = t('networth.line.debug_learn_failed');
              }
            };
            learnRow.appendChild(learnIn); learnRow.appendChild(learnBtn); learnRow.appendChild(learnMsg);
            controls.appendChild(learnRow);
          }
          if (ln.count != null && window.api.stashForgetDigits) {
            const forget = el('button', 'nw-dbg-forget', t('networth.line.forget_button'));
            forget.title = t('networth.line.forget_title');
            forget.onclick = async (e) => {
              e.stopPropagation();
              forget.disabled = true;
              try { await window.api.stashForgetDigits(String(ln.count)); } catch {}
              delete dbgImgCache[ln.apiId];
              render();
            };
            controls.appendChild(forget);
          }
          dbg.appendChild(controls);
        } else {
          dbg.textContent = '…';
          dbgImgCache[ln.apiId] = 'loading';
          window.api.stashSlotDebugImage(ln.apiId).then((res) => {
            dbgImgCache[ln.apiId] = res || { ok: false };
            render();
          }).catch(() => { dbgImgCache[ln.apiId] = { ok: false }; render(); });
        }
        list.appendChild(dbg);
      }
    }
    card.appendChild(list);
    return card;
  }

  // click-to-edit a line's count; matching the original value clears the override
  function startEdit(ln, cntEl) {
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
      if (corrected && v > 0 && window.api.stashTeachCount) {
        window.api.stashTeachCount(ln.apiId, String(v)).catch(() => {});
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
    const anyLow = state.rows.some((r) => (r.result.lines || []).some((ln) => ln.rel === 'low' && ln.userCount == null));
    const anyMixed = state.rows.some((r) => (r.result.lines || []).some((ln) => ln.rel === 'mixed' && ln.userCount == null));
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
    gline.appendChild(el('span', 'nw-ex', fmtEx(rows ? gt.ex : null)));
    if (gt.div != null) gline.appendChild(el('span', 'nw-div', fmtDiv(gt.div)));
    if (rows && gt.mirrors != null) gline.appendChild(el('span', 'nw-mirror',
      `(${gt.mirrors.toLocaleString('en-US')}<img class="nw-mirror-ic" src="${MIRROR_ICON}" alt="${t('networth.grand.mirror_alt')}">)`));
    totBox.appendChild(gline);
    header.appendChild(totBox);
    const controls = el('div', 'nw-controls');
    if (state.busy) {
      const q = state.queued > 1 ? ' (' + state.queued + ')' : '';
      controls.appendChild(el('span', 'nw-scanning', t('networth.status.scanning') + q));
    }
    const gear = el('button', 'nw-gear', '⚙'); gear.title = t('networth.header.settings_tooltip', { hotkey: state.hotkey });
    gear.onclick = () => { if (window.openNetWorthSettings) window.openNetWorthSettings(); };
    controls.appendChild(gear);
    header.appendChild(controls);
    wrap.appendChild(header);
    { const xb = experimentalBanner(); if (xb) wrap.appendChild(xb); }
    { const lg = reliabilityLegend(); if (lg) wrap.appendChild(lg); }

    if (state.notice) wrap.appendChild(el('div', 'nw-notice nw-' + state.notice.kind, esc(state.notice.msg)));

    const pending = state.busy && state.phase === 'detecting' ? state.pendingTab : null;
    if (!rows && !state.busy) {
      wrap.appendChild(el('div', 'nw-empty',
        t('networth.empty.instructions', { hotkey: esc(state.hotkey) }) + '<br>'
        + t('networth.empty.explain') + '<br>'
        ));
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
      applyResult(res);
    });
    if (window.api.onStashQueued) window.api.onStashQueued((info) => {
      state.queued = (info && info.depth) || 0;
      if (!state.queued) { state.busy = false; state.phase = 'idle'; state.pendingTab = null; }
      render();
    });
    if (window.api.onStashCalibrated) window.api.onStashCalibrated((res) => {
      state.busy = false; state.phase = 'idle'; state.pendingTab = null; state.calibrated = true;
      const scale = res && typeof res.calScale === 'number' ? res.calScale : 1;
      const small = scale < 0.92;
      const smallMsg = small ? t('networth.calibrate.small_panel_warning', { scalePercent: Math.round(scale * 100) }) : '';
      if (res && res.ok && !res.mismatch) {
        applyResult(res);
        state.notice = { kind: small ? 'warn' : 'ok', msg: t('networth.calibrate.success', { tabName: TAB_LABEL[res.tab] || res.tab, readCount: res.readCount, slotCount: res.slotCount, smallPanelWarning: smallMsg }) };
      } else {
        state.notice = { kind: 'warn', msg: t('networth.calibrate.no_tab_read', { hotkey: state.hotkey, smallPanelWarning: smallMsg }) };
      }
      render();
    });
  }

  window.NetWorth = { render, capture, renderSettings };
})();
