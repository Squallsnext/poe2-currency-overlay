(function () {
  const shot = document.getElementById('shot');
  const boxEl = document.getElementById('box');
  const loupe = document.getElementById('loupe');
  const lcanvas = loupe.querySelector('canvas');
  const lctx = lcanvas.getContext('2d');
  const vguide = document.getElementById('vguide');
  const hguide = document.getElementById('hguide');
  const coordsEl = document.getElementById('coords');
  const debugEl = document.getElementById('debug');
  // Texts come from the app's catalogs (loaded by calibrate.html) in the UI language main
  // passes in calib-init; missing keys fall back to English, then to the key itself.
  let uiLang = 'en';
  function t(key) {
    const C = window.I18N_CATALOGS || {};
    const cur = C[uiLang] || {}, en = C.en || {};
    return cur[key] !== undefined ? cur[key] : (en[key] !== undefined ? en[key] : key);
  }
  function applyI18n() {
    for (const node of document.querySelectorAll('[data-i18n]')) node.innerHTML = t(node.dataset.i18n);
  }
  const imgObj = new Image();
  // per-axis capture-px <-> css-px scale. The window's client height often differs
  // slightly from the screenshot height (DPI / work-area), so a single scale skews the
  // loupe vertically (accurate at the top, drifting toward the bottom). Keep them separate.
  let sX = 1, sY = 1; // css px per capture px
  let capW = 1, capH = 1;
  let displayInfo = null;
  let box = { x: 120, y: 120, w: 400, h: 400 }; // CSS px
  let minBox = 40; // smallest box the user can drag to; reprice lowers it
  const capToCssBox = (b) => ({ x: b.x * sX, y: b.y * sY, w: b.w * sX, h: b.h * sY });
  const cssToCapBox = (b) => ({ x: toCapX(b.x), y: toCapY(b.y), w: toCapX(b.w), h: toCapY(b.h) });
  function updateScale() {
    sX = innerWidth / capW;
    sY = innerHeight / capH;
    updateDebug();
  }
  function updateDebug() {
    if (!debugEl) return;
    const d = displayInfo || {};
    const b = d.bounds || {};
    const w = d.workArea || {};
    const wb = d.windowBounds || {};
    debugEl.textContent =
      `cap ${capW}x${capH}  css ${innerWidth}x${innerHeight}  scale ${sX.toFixed(5)},${sY.toFixed(5)}\n`
      + `display ${d.id || '?'} @${d.scaleFactor || '?'}  bounds ${b.x || 0},${b.y || 0} ${b.width || 0}x${b.height || 0}  `
      + `work ${w.x || 0},${w.y || 0} ${w.width || 0}x${w.height || 0}  win ${wb.x || 0},${wb.y || 0} ${wb.width || 0}x${wb.height || 0}`;
  }

  function clampBox() {
    // 40px is a sensible floor for a stash panel and a ceiling for a price box - the
    // reprice region is often SMALLER than the old minimum, so the box could not be made
    // to fit it at all.
    const W = innerWidth, H = innerHeight, MIN = minBox;
    box.w = Math.max(MIN, box.w); box.h = Math.max(MIN, box.h);
    box.x = Math.max(0, Math.min(box.x, W - box.w));
    box.y = Math.max(0, Math.min(box.y, H - box.h));
  }
  const toCapX = (cx) => Math.round(cx / sX);
  const toCapY = (cy) => Math.round(cy / sY);
  function draw() {
    clampBox();
    boxEl.style.left = box.x + 'px'; boxEl.style.top = box.y + 'px';
    boxEl.style.width = box.w + 'px'; boxEl.style.height = box.h + 'px';
    coordsEl.textContent = `${toCapX(box.w)} x ${toCapY(box.h)} px  @ ${toCapX(box.x)}, ${toCapY(box.y)}`;
  }

  const Z = 9, D = 168; // loupe magnification (odd, so a source pixel maps to an odd block) + diameter
  function showLoupe(cssX, cssY, handle) {
    if (!imgObj.width) return;
    loupe.style.display = 'block';
    // source rect in capture px, centered on the tracked point (per-axis scale)
    const srcCx = cssX / sX, srcCy = cssY / sY;
    const srcSize = D / Z; // capture px shown across the loupe
    lctx.imageSmoothingEnabled = false;
    lctx.clearRect(0, 0, D, D);
    lctx.drawImage(imgObj, srcCx - srcSize / 2, srcCy - srcSize / 2, srcSize, srcSize, 0, 0, D, D);
    // highlight the SELECTED pixel row + column (a 1-source-pixel band, Z loupe-px thick),
    // so the user places the edge ON a pixel line rather than on the gap between two.
    lctx.fillStyle = 'rgba(240,192,112,.30)';
    lctx.fillRect(0, D / 2 - Z / 2, D, Z);       // selected row
    lctx.fillRect(D / 2 - Z / 2, 0, Z, D);       // selected column
    lctx.strokeStyle = 'rgba(255,255,255,.95)'; lctx.lineWidth = 1;
    lctx.strokeRect(D / 2 - Z / 2 + 0.5, D / 2 - Z / 2 + 0.5, Z - 1, Z - 1); // the exact pixel
    // position the loupe diagonally OUTWARD from the grabbed corner so it never hides it
    const gap = 20; let lx, ly;
    if (handle === 'nw') { lx = cssX - gap - D; ly = cssY - gap - D; }
    else if (handle === 'ne') { lx = cssX + gap; ly = cssY - gap - D; }
    else if (handle === 'sw') { lx = cssX - gap - D; ly = cssY + gap; }
    else if (handle === 'se') { lx = cssX + gap; ly = cssY + gap; }
    else if (handle === 'n') { lx = cssX + gap; ly = cssY - gap - D; }
    else if (handle === 's') { lx = cssX + gap; ly = cssY + gap; }
    else if (handle === 'w') { lx = cssX - gap - D; ly = cssY + gap; }
    else { lx = cssX + gap; ly = cssY + gap; } // e / move
    lx = Math.max(6, Math.min(lx, innerWidth - D - 6));
    ly = Math.max(6, Math.min(ly, innerHeight - D - 6));
    loupe.style.left = lx + 'px'; loupe.style.top = ly + 'px';
    // full-screen guide lines at the tracked point
    vguide.style.display = hguide.style.display = 'block';
    vguide.style.left = Math.round(cssX) + 'px';
    hguide.style.top = Math.round(cssY) + 'px';
  }
  function hideLoupe() { loupe.style.display = vguide.style.display = hguide.style.display = 'none'; }

  // the point the loupe tracks = the moving corner/edge
  function anchor(handle) {
    let x = box.x + box.w / 2, y = box.y + box.h / 2;
    if (handle.includes('w')) x = box.x; if (handle.includes('e')) x = box.x + box.w;
    if (handle.includes('n')) y = box.y; if (handle.includes('s')) y = box.y + box.h;
    return { x, y };
  }

  let drag = null;
  function onDown(e, handle) {
    e.preventDefault(); e.stopPropagation();
    drag = { handle, sx: e.clientX, sy: e.clientY, box: Object.assign({}, box) };
    const a = handle === 'move' ? { x: e.clientX, y: e.clientY } : anchor(handle);
    showLoupe(a.x, a.y, handle);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }
  function onMove(e) {
    if (!drag) return;
    const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy, b = drag.box, h = drag.handle;
    if (h === 'move') { box.x = b.x + dx; box.y = b.y + dy; }
    else {
      if (h.includes('e')) box.w = b.w + dx;
      if (h.includes('s')) box.h = b.h + dy;
      if (h.includes('w')) { box.x = b.x + dx; box.w = b.w - dx; }
      if (h.includes('n')) { box.y = b.y + dy; box.h = b.h - dy; }
    }
    draw();
    const a = h === 'move' ? { x: e.clientX, y: e.clientY } : anchor(h);
    showLoupe(a.x, a.y, h);
  }
  function onUp() {
    drag = null; hideLoupe();
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
  }

  boxEl.addEventListener('pointerdown', (e) => { if (e.target === boxEl) onDown(e, 'move'); });
  document.querySelectorAll('.hand').forEach((h) => h.addEventListener('pointerdown', (e) => onDown(e, h.dataset.h)));

  document.getElementById('ok').addEventListener('click', () => {
    window.calibrateApi.confirm({ x: toCapX(box.x), y: toCapY(box.y), w: toCapX(box.w), h: toCapY(box.h) });
  });
  document.getElementById('cancel').addEventListener('click', () => window.calibrateApi.cancel());
  document.getElementById('snap').addEventListener('click', () => {
    window.calibrateApi.snap({ x: toCapX(box.x), y: toCapY(box.y), w: toCapX(box.w), h: toCapY(box.h) });
  });
  window.calibrateApi.onSnapped((f) => {
    if (!f || !(f.w > 0) || !(f.h > 0)) return;
    box = capToCssBox(f);
    draw();
    boxEl.classList.remove('snapped'); void boxEl.offsetWidth; boxEl.classList.add('snapped');
  });
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') window.calibrateApi.cancel(); });
  window.addEventListener('resize', () => {
    const cur = cssToCapBox(box);
    updateScale();
    box = capToCssBox(cur);
    draw();
  });

  window.calibrateApi.onInit((data) => {
    shot.src = data.dataUrl; imgObj.src = data.dataUrl;
    uiLang = data.lang || 'en';
    applyI18n();
    // the capture/window/display diagnostics line only while OCR debug is on
    if (debugEl) debugEl.hidden = !data.debug;
    capW = data.capW || 1;
    capH = data.capH || 1;
    displayInfo = data.display || null;
    updateScale();
    // why this window opened at all: the automatic search did not find the currency tab
    if (data.note) { const msg = document.querySelector('.msg'); if (msg) msg.innerHTML = '<b>' + t(data.note) + '</b><br>' + msg.innerHTML; }
    const s = data.seedBox;
    box = capToCssBox(s);
    // The same window calibrates the Net Worth stash panel and the Reprice price box.
    // Auto-snap looks for the stash panel's coloured border, which does not exist around
    // a price field, so it is hidden there rather than offered and useless.
    if (data.target === 'reprice' || data.target === 'reprice-icon') {
      document.body.classList.add('for-reprice');
      minBox = 8;
      const snapBtn = document.getElementById('snap');
      if (snapBtn) snapBtn.style.display = 'none';
      const msg = document.querySelector('.msg');
      if (msg) msg.innerHTML = t(data.target === 'reprice-icon' ? 'calib.msg_reprice_icon' : 'calib.msg_reprice_num');
      // the illustration is a stash grid with item cells - nothing to do with a price box
      const ex = document.getElementById('ex');
      if (ex) ex.style.display = 'none';
      const note = document.querySelector('.bar-note');
      if (note) note.style.display = 'none';
      const ok = document.getElementById('ok');
      if (ok) ok.textContent = t('calib.confirm');
    }
    draw();
  });
})();
