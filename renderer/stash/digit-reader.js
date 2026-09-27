'use strict';
// Port of iou_reader_final.py — game-glyph digit reader for PoE2 currency tabs.
// Pure JS on typed arrays: Otsu -> 4-conn labeling -> IoU sliding-window match ->
// greedy assembly -> gap-fill -> leading-"1" edge filter, with a grey-opening
// tophat fallback for bright-on-bright cells.
//
// Images are represented as a "value channel": Uint8Array of max(R,G,B), row-major,
// length = w*h. Binary images are Uint8Array of 0/1, same layout.
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DigitReader = api;
})(typeof self !== 'undefined' ? self : this, function () {

  // ---- primitives ----------------------------------------------------------

  // Otsu threshold over a flat Uint8Array (matches numpy hist w/ 256 bins 0..256).
  function otsu(data) {
    const hist = new Float64Array(256);
    for (let i = 0; i < data.length; i++) hist[data[i]]++;
    const tot = data.length;
    let sumall = 0;
    for (let t = 0; t < 256; t++) sumall += t * hist[t];
    let wB = 0, sumB = 0, best = -1, thr = 150;
    for (let t = 0; t < 256; t++) {
      wB += hist[t];
      if (wB === 0) continue;
      const wF = tot - wB;
      if (wF <= 0) break;
      sumB += t * hist[t];
      const mB = sumB / wB, mF = (sumall - sumB) / wF;
      const v = wB * wF * (mB - mF) * (mB - mF);
      if (v > best) { best = v; thr = t; }
    }
    return thr;
  }

  // Crop [x0,x1) x [y0,y1) from a value channel, clamped to bounds.
  // Returns { data, w, h }.
  function crop(V, W, H, x0, y0, x1, y1) {
    // whole pixels: a strip saved by the align tool is fractional (21.94 x 9.65 reference
    // px); at reference scale that went in unrounded, the array index was fractional and
    // every pixel read as undefined -> an empty cell, nothing read (reported at 1080p;
    // the scaled paths round before they get here)
    x0 = Math.max(0, Math.round(x0)); y0 = Math.max(0, Math.round(y0));
    x1 = Math.min(W, Math.round(x1)); y1 = Math.min(H, Math.round(y1));
    const w = Math.max(0, x1 - x0), h = Math.max(0, y1 - y0);
    const out = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      const s = (y0 + y) * W + x0, d = y * w;
      for (let x = 0; x < w; x++) out[d + x] = V[s + x];
    }
    return { data: out, w, h };
  }

  // Bilinear resample of a value-channel {data,w,h} to (nw,nh). Used to normalise a
  // calibrated (non-1080) cell crop back to reference scale so the fixed-size 0-9
  // templates match regardless of the user's resolution.
  function resample(sub, nw, nh) {
    const { data, w, h } = sub;
    if (nw === w && nh === h) return sub;
    const out = new Uint8Array(nw * nh);
    const stepX = w / nw, stepY = h / nh;
    // Minification must area-average, exactly like resampleRGBA below - a game digit's
    // strokes are 1-2px, and bilinear only samples a 2x2 neighbourhood regardless of how
    // far it is shrinking, so at a real minify (readCellEx's per-cell native crop at
    // extreme display scale) it is effectively point-sampling: which source pixels land
    // in that 2x2 window depends on the crop's exact sub-pixel phase, so the SAME glyph
    // shrunk from two frames that differ by a fraction of a source pixel can binarize to
    // different strokes entirely - "348" read as "38" one time and "1" the next, with the
    // crop itself unchanged. This was unreachable dead code until per-cell scaling had a
    // real caller (readCellEx's scale!=1 branch); nothing here was ever a minify before.
    if (stepX > 1 || stepY > 1) {
      const clampX = (v) => (v < 0 ? 0 : v > w - 1 ? w - 1 : v);
      const clampY = (v) => (v < 0 ? 0 : v > h - 1 ? h - 1 : v);
      for (let y = 0; y < nh; y++) {
        const fy0 = y * stepY, fy1 = fy0 + stepY;
        const iy0 = Math.floor(fy0), iy1 = Math.ceil(fy1) - 1;
        for (let x = 0; x < nw; x++) {
          const fx0 = x * stepX, fx1 = fx0 + stepX;
          const ix0 = Math.floor(fx0), ix1 = Math.ceil(fx1) - 1;
          let sum = 0, wsum = 0;
          for (let yy = iy0; yy <= iy1; yy++) {
            const wy = Math.min(yy + 1, fy1) - Math.max(yy, fy0);
            if (wy <= 0) continue;
            const cy = clampY(yy);
            for (let xx = ix0; xx <= ix1; xx++) {
              const wx = Math.min(xx + 1, fx1) - Math.max(xx, fx0);
              if (wx <= 0) continue;
              const ww = wx * wy;
              sum += data[cy * w + clampX(xx)] * ww;
              wsum += ww;
            }
          }
          out[y * nw + x] = wsum > 0 ? Math.round(sum / wsum) : 0;
        }
      }
      return { data: out, w: nw, h: nh };
    }
    for (let y = 0; y < nh; y++) {
      let fy = (y + 0.5) * stepY - 0.5; let y0 = Math.floor(fy); const wy = fy - y0;
      let y1 = y0 + 1; y0 = Math.max(0, Math.min(h - 1, y0)); y1 = Math.max(0, Math.min(h - 1, y1));
      for (let x = 0; x < nw; x++) {
        let fx = (x + 0.5) * stepX - 0.5; let x0 = Math.floor(fx); const wx = fx - x0;
        let x1 = x0 + 1; x0 = Math.max(0, Math.min(w - 1, x0)); x1 = Math.max(0, Math.min(w - 1, x1));
        const a = data[y0 * w + x0], b = data[y0 * w + x1], c = data[y1 * w + x0], d = data[y1 * w + x1];
        const top = a + (b - a) * wx, bot = c + (d - c) * wx;
        out[y * nw + x] = Math.round(top + (bot - top) * wy);
      }
    }
    return { data: out, w: nw, h: nh };
  }

  // Resample an RGBA/BGRA region of a frame to (nw,nh), so a panel captured above the
  // reference resolution can be normalised ONCE, whole, before anything reads it.
  // Minification area-averages (a game digit's strokes are 1-2px, and point-sampling
  // a non-integer shrink drops them outright); magnification is bilinear.
  // src rect is given in frame px and may be fractional; it is clamped to the frame.
  function resampleRGBA(buf, W, H, sx0, sy0, sw, sh, nw, nh) {
    const out = new Uint8Array(nw * nh * 4);
    const stepX = sw / nw, stepY = sh / nh;
    const minify = stepX > 1 || stepY > 1;
    const clampX = (v) => (v < 0 ? 0 : v > W - 1 ? W - 1 : v);
    const clampY = (v) => (v < 0 ? 0 : v > H - 1 ? H - 1 : v);
    for (let y = 0; y < nh; y++) {
      for (let x = 0; x < nw; x++) {
        const d = (y * nw + x) * 4;
        if (minify) {
          // area average over the full source footprint of this output pixel
          const fx0 = sx0 + x * stepX, fx1 = fx0 + stepX;
          const fy0 = sy0 + y * stepY, fy1 = fy0 + stepY;
          const ix0 = Math.floor(fx0), ix1 = Math.ceil(fx1) - 1;
          const iy0 = Math.floor(fy0), iy1 = Math.ceil(fy1) - 1;
          let r = 0, g = 0, b = 0, a = 0, wsum = 0;
          for (let yy = iy0; yy <= iy1; yy++) {
            const wy = Math.min(yy + 1, fy1) - Math.max(yy, fy0);
            if (wy <= 0) continue;
            const cy = clampY(yy);
            for (let xx = ix0; xx <= ix1; xx++) {
              const wx = Math.min(xx + 1, fx1) - Math.max(xx, fx0);
              if (wx <= 0) continue;
              const p = (cy * W + clampX(xx)) * 4, ww = wx * wy;
              r += buf[p] * ww; g += buf[p + 1] * ww; b += buf[p + 2] * ww; a += buf[p + 3] * ww;
              wsum += ww;
            }
          }
          if (wsum > 0) {
            out[d] = Math.round(r / wsum); out[d + 1] = Math.round(g / wsum);
            out[d + 2] = Math.round(b / wsum); out[d + 3] = Math.round(a / wsum);
          }
        } else {
          const fx = sx0 + (x + 0.5) * stepX - 0.5, fy = sy0 + (y + 0.5) * stepY - 0.5;
          const x0 = Math.floor(fx), y0 = Math.floor(fy);
          const wx = fx - x0, wy = fy - y0;
          const xa = clampX(x0), xb = clampX(x0 + 1), ya = clampY(y0), yb = clampY(y0 + 1);
          const pA = (ya * W + xa) * 4, pB = (ya * W + xb) * 4, pC = (yb * W + xa) * 4, pD = (yb * W + xb) * 4;
          for (let c = 0; c < 4; c++) {
            const top = buf[pA + c] + (buf[pB + c] - buf[pA + c]) * wx;
            const bot = buf[pC + c] + (buf[pD + c] - buf[pC + c]) * wx;
            out[d + c] = Math.round(top + (bot - top) * wy);
          }
        }
      }
    }
    return out;
  }

  // Local threshold - what the eye does: a digit is a THIN bright stroke inside a black
  // outline. A white top-hat (V minus its grey opening with a kernel wider than a stroke)
  // keeps exactly the bright structures narrower than the kernel and flattens anything
  // wider to ~0 - so a digit stroke survives while a flat bright surface (white marble, a
  // blue backdrop, a broad highlight) disappears, even where it is as bright as the digit,
  // which no global floor can separate. (A plain "brighter than the neighbourhood mean"
  // test was tried first: it also lights up the bright surface right next to the outline,
  // drawing a halo around every digit.) A pixel is ink if it stands out by more than
  // `offset` above that local base; `floor` still applies as a minimum brightness. Kernel in
  // cell px (reference size, strokes ~2px): 5 is wider than any stroke, narrower than a
  // digit's closed counters.
  const LOCAL_KERNEL = 5;
  function binarizeLocal(sub, offset, floor, kernel) {
    const { data, w, h } = sub;
    const opening = greyOpening(sub, kernel || LOCAL_KERNEL);
    const b = new Uint8Array(data.length);
    for (let i = 0; i < data.length; i++) {
      const v = data[i];
      if (v >= floor && v - opening.data[i] > offset) b[i] = 1;
    }
    return { data: b, w, h };
  }

  // the black/white cut as P asks for it: local when P.localThr is set, else global
  function binarizeP(sub, P) {
    // kernel is in cell px: at matchScale 2 a stroke is twice as wide, so is the kernel
    // (kept odd for the rank filter)
    const k = P.matchScale > 1 ? (Math.round(LOCAL_KERNEL * P.matchScale) | 1) : LOCAL_KERNEL;
    return P.localThr ? binarizeLocal(sub, P.localThr, P.floor, k) : binarize(sub, P.floor);
  }

  function binarize(sub, floor) {
    const thr = Math.max(otsu(sub.data), floor);
    const b = new Uint8Array(sub.data.length);
    for (let i = 0; i < b.length; i++) b[i] = sub.data[i] > thr ? 1 : 0;
    return { data: b, w: sub.w, h: sub.h };
  }

  // Remove white blobs smaller than minArea px (8-connected, so a digit's diagonal
  // strokes stay one blob). A digit at reference size is 15+ px of ink; a highlight on the
  // icon art that is as white and as grey as a digit - which saturation/contrast/floor
  // therefore can't remove - is usually a speck of a few px. Size is what tells them apart.
  // In place; minArea <= 1 is a no-op.
  function dropSmallBlobs(bin, minArea) {
    if (!minArea || minArea <= 1) return bin;
    const { data, w, h } = bin;
    const seen = new Uint8Array(data.length);
    const stack = [], blob = [];
    for (let i = 0; i < data.length; i++) {
      if (!data[i] || seen[i]) continue;
      stack.length = 0; blob.length = 0;
      stack.push(i); seen[i] = 1;
      while (stack.length) {
        const j = stack.pop(); blob.push(j);
        const x = j % w, y = (j - x) / w;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy; if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx; if (xx < 0 || xx >= w) continue;
            const k = yy * w + xx;
            if (data[k] && !seen[k]) { seen[k] = 1; stack.push(k); }
          }
        }
      }
      if (blob.length < minArea) for (const j of blob) data[j] = 0;
    }
    return bin;
  }

  // 4-connectivity connected components (scipy.ndimage.label default structure).
  // Returns [{ mask:{data,w,h}, x, area }] where mask is cropped to the bbox and
  // x is the component's min-x in strip coords.
  // S = cell scale relative to reference (matchScale): every size limit grows with it
  // eight: also join diagonal neighbours - a thin diagonal stroke (the 7's, at 1080p)
  // can touch only corner to corner and falls apart into pieces with 4-neighbours
  function components(bin, S, eight) {
    S = S || 1;
    const { data, w, h } = bin;
    const lbl = new Int32Array(w * h);
    const stack = [];
    const comps = [];
    let n = 0;
    for (let i0 = 0; i0 < w * h; i0++) {
      if (!data[i0] || lbl[i0]) continue;
      n++;
      lbl[i0] = n; stack.length = 0; stack.push(i0);
      let xMin = w, xMax = -1, yMin = h, yMax = -1, area = 0;
      while (stack.length) {
        const p = stack.pop();
        const px = p % w, py = (p - px) / w;
        area++;
        if (px < xMin) xMin = px; if (px > xMax) xMax = px;
        if (py < yMin) yMin = py; if (py > yMax) yMax = py;
        if (px > 0) { const q = p - 1; if (data[q] && !lbl[q]) { lbl[q] = n; stack.push(q); } }
        if (px < w - 1) { const q = p + 1; if (data[q] && !lbl[q]) { lbl[q] = n; stack.push(q); } }
        if (py > 0) { const q = p - w; if (data[q] && !lbl[q]) { lbl[q] = n; stack.push(q); } }
        if (py < h - 1) { const q = p + w; if (data[q] && !lbl[q]) { lbl[q] = n; stack.push(q); } }
        if (eight) {
          for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
            const nx = px + dx, ny = py + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const q = ny * w + nx; if (data[q] && !lbl[q]) { lbl[q] = n; stack.push(q); }
          }
        }
      }
      const bw = xMax - xMin + 1, bh = yMax - yMin + 1;
      // digit-sized: height 7-16, width 1-13, area>=5 (reference px, times S)
      if (bh >= 7 * S && bh <= 16 * S && bw >= 1 && bw <= 13 * S && area >= 5 * S * S) {
        const mask = new Uint8Array(bw * bh);
        for (let yy = yMin; yy <= yMax; yy++)
          for (let xx = xMin; xx <= xMax; xx++)
            if (lbl[yy * w + xx] === n) mask[(yy - yMin) * bw + (xx - xMin)] = 1;
        comps.push({ mask: { data: mask, w: bw, h: bh }, x: xMin, area });
      }
    }
    return comps;
  }

  function inkSum(m) { let s = 0; const d = m.data; for (let i = 0; i < d.length; i++) s += d[i]; return s; }

  // Jaccard IoU of two equal-size binary masks.
  function iou(a, b) {
    let inter = 0, uni = 0;
    const da = a, db = b;
    for (let i = 0; i < da.length; i++) {
      const x = da[i], y = db[i];
      if (x & y) inter++;
      if (x | y) uni++;
    }
    return uni > 0 ? inter / uni : 0;
  }

  // ---- template extraction -------------------------------------------------

  // gtPos: [[cx, cy, "value"], ...]
  function extractTemplates(V, W, H, gtPos, P) {
    const acc = {}; // char -> [mask{data,w,h}]
    for (const [cx, cy, val] of gtPos) {
      const sub = crop(V, W, H, cx - P.stripWidth, cy - P.up, cx + P.stripWidth, cy + P.dn);
      if (!sub.w || !sub.h) continue;
      const bin = binarize(sub, P.floor);
      const comps = components(bin);
      if (!comps.length || comps.length !== val.length) continue;
      comps.sort((a, b) => a.x - b.x);
      for (let i = 0; i < val.length; i++) {
        const ch = val[i];
        (acc[ch] || (acc[ch] = [])).push(comps[i].mask);
      }
    }
    const templates = {}, counts = {};
    for (const ch of Object.keys(acc)) {
      const glyphs = acc[ch];
      if (!glyphs.length) continue;
      // median-ink representative: argsort(inks)[len//2]
      const inks = glyphs.map((g, i) => ({ ink: inkSum(g), i }));
      inks.sort((a, b) => (a.ink - b.ink) || (a.i - b.i)); // stable by original index
      const medIdx = inks[Math.floor(glyphs.length / 2)].i;
      templates[ch] = glyphs[medIdx];
      counts[ch] = glyphs.length;
    }
    return { templates, counts };
  }

  // ---- IoU matching --------------------------------------------------------

  // Slide template across a binary strip; best vertical offset per x column.
  // Returns [{ x, dy, score }].
  //
  // Same scores as the plain version (copy the window, IoU against the template), just
  // counted cheaper - reported: the essence tab took ~22 s at 5K where the currency tab
  // took ~5 s. Profiled: ~93% of a read was in here. Essence slots have no shipped 5K
  // filters, so every slot runs the full 8-floor sweep (readCellAdaptive), and at
  // matchScale 2 each window is 4x the pixels over 2x the positions. Two changes, both
  // exact (masks are 0/1, so IoU = inter / (templateInk + winInk - inter)):
  //  - the window's ink comes from a summed-area table of the strip (one lookup instead of
  //    copying Tw x Th pixels) - a mostly blank window fails minInkFrac without being read;
  //  - the overlap is counted over the TEMPLATE's ink pixels only (offsets cached per
  //    template and strip width) instead of over the whole window.
  // Measured: every read of every capture we hold (1080p/1440p, all tabs, high-res on and
  // off, 5K currency + essence) is identical, count and confidence.
  function integralOf(strip) {
    const { data: S, w: Wd, h: Hd } = strip;
    const I = new Int32Array((Wd + 1) * (Hd + 1));
    for (let y = 0; y < Hd; y++) {
      let row = 0;
      for (let x = 0; x < Wd; x++) {
        row += S[y * Wd + x];
        I[(y + 1) * (Wd + 1) + x + 1] = I[y * (Wd + 1) + x + 1] + row;
      }
    }
    return I;
  }
  const inkOffsCache = new WeakMap(); // template -> Map(strip width -> Int32Array)
  function inkOffsets(tmpl, Wd) {
    let byW = inkOffsCache.get(tmpl);
    if (!byW) { byW = new Map(); inkOffsCache.set(tmpl, byW); }
    let offs = byW.get(Wd);
    if (!offs) {
      const { data: T, w: Tw, h: Th } = tmpl, list = [];
      for (let ty = 0; ty < Th; ty++) for (let tx = 0; tx < Tw; tx++) if (T[ty * Tw + tx]) list.push(ty * Wd + tx);
      offs = Int32Array.from(list);
      byW.set(Wd, offs);
    }
    return offs;
  }
  function slideMatch(strip, tmpl, dyLo, dyHi, minInkFrac, integral) {
    const { data: S, w: Wd, h: Hd } = strip;
    const { w: Tw, h: Th } = tmpl;
    if (Tw > Wd) return [];
    const I = integral || integralOf(strip);
    const offs = inkOffsets(tmpl, Wd);
    const templateInk = offs.length;
    const minInk = minInkFrac * templateInk;
    const W1 = Wd + 1;
    const out = [];
    const xEnd = Math.max(1, Wd - Tw + 1);
    for (let x = 0; x < xEnd; x++) {
      let bestDy = null, bestScore = 0;
      for (let dy = dyLo; dy <= dyHi; dy++) {
        const yCenter = ((Hd / 2) | 0) + dy;
        const yStart = yCenter - (Th / 2 | 0);
        const yEnd = yStart + Th;
        if (yStart < 0 || yEnd > Hd) continue;
        const x1 = Math.min(x + Tw, Wd); // a template wider than the strip is caught above
        const winInk = I[yEnd * W1 + x1] - I[yStart * W1 + x1] - I[yEnd * W1 + x] + I[yStart * W1 + x];
        if (winInk < minInk) continue;
        const base = yStart * Wd + x;
        let inter = 0;
        for (let k = 0; k < offs.length; k++) inter += S[base + offs[k]];
        const uni = templateInk + winInk - inter;
        const score = uni > 0 ? inter / uni : 0;
        if (score > bestScore) { bestScore = score; bestDy = dy; }
      }
      if (bestDy !== null && bestScore > 0) out.push({ x, dy: bestDy, score: bestScore });
    }
    return out;
  }

  // grayscale erosion/dilation with square kernel k (reflect border) -> opening.
  function greyOpening(sub, k) {
    const eroded = rankFilter(sub, k, true);
    return rankFilter(eroded, k, false); // dilation of the erosion
  }
  function rankFilter(img, k, isMin) {
    const { data, w, h } = img;
    const out = new Uint8Array(w * h);
    const r = Math.floor(k / 2);
    const reflect = (i, n) => { // scipy 'reflect' (d c b a | a b c d | d c b a)
      if (n === 1) return 0;
      const period = 2 * n;
      let m = ((i % period) + period) % period;
      return m < n ? m : period - 1 - m;
    };
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = isMin ? 255 : 0;
        for (let dy = -r; dy <= r; dy++) {
          const yy = reflect(y + dy, h);
          for (let dx = -r; dx <= r; dx++) {
            const xx = reflect(x + dx, w);
            const v = data[yy * w + xx];
            acc = isMin ? (v < acc ? v : acc) : (v > acc ? v : acc);
          }
        }
        out[y * w + x] = acc;
      }
    }
    return { data: out, w, h };
  }

  const OVERLAP = 0.20; // hardcoded in the Python accept/gap logic
  // A real number's digits are always tightly kerned - this is the widest gap (reference
  // px) worth still calling "the same number". Shared by readCellEx's post-filter (a
  // trailing cluster past this gap is unrelated art) and detectDigitSpan below (the pre-
  // pass that finds how far the real number actually extends before any art starts).
  const MAX_DIGIT_GAP = 15;

  function overlaps(x, tw, accepted) {
    for (const a of accepted) {
      const xo = Math.max(0, Math.min(x + tw, a.x + a.tw) - Math.max(x, a.x));
      const minW = Math.min(tw, a.tw);
      // Tolerate <=1px of template-width slop so tightly-kerned digits (e.g. "41"
      // where a wide template's edge grazes the next digit) aren't dropped; real
      // double-detections of one glyph overlap far more than 1px.
      if (xo > OVERLAP * minW && xo > 1) return true;
    }
    return false;
  }

  // How many digits are actually here, and how far right do they extend? Connected
  // components already segments digit-plausible-sized ink blobs (see components()) -
  // walking them left to right and stopping at the first gap wider than a real number
  // ever kerns finds the number's own extent BEFORE any template matching happens, so
  // whatever sits past it (typically an item icon bleeding into the wide capture strip)
  // can be masked out of the search outright instead of hoping a threshold or a post-hoc
  // filter catches it once it has already been mismatched as a digit.
  function detectDigitSpan(bin, S) {
    S = S || 1;
    const comps = components(bin, S).sort((a, b) => a.x - b.x);
    if (!comps.length) return null;
    let endX = comps[0].x + comps[0].mask.w;
    let count = 1;
    for (let i = 1; i < comps.length; i++) {
      const gap = comps[i].x - endX;
      if (gap > MAX_DIGIT_GAP * S) break;
      endX = comps[i].x + comps[i].mask.w;
      count++;
    }
    return { count, startX: comps[0].x, endX };
  }

  // Read one cell -> string, or "?" if unreadable.
  function readCellEx(V, W, H, cx, cy, templates, P, scale) {
    scale = scale && scale > 0 ? scale : 1;
    // Independent left/right extent (default: both = stripWidth, i.e. today's symmetric
    // box - unset, nothing changes for anyone). Digits are left-anchored and background
    // art (an item's icon) sits to their right, so a short number leaves a wide, empty-
    // looking gap on the right that is really "icon, not yet ruled out" - a floor tuned
    // to keep the digit intact often lets a bright icon highlight through there too,
    // because the two aren't separable by brightness alone at that point (see the OCR
    // debug panel's discussion). Narrowing stripRight removes that art from the search
    // entirely rather than hoping a threshold or a post-hoc filter catches it.
    const stripL = P.stripLeft != null ? P.stripLeft : P.stripWidth;
    const stripR = P.stripRight != null ? P.stripRight : P.stripWidth;
    let sub;
    if (scale !== 1) {
      // calibrated non-reference resolution: crop the scaled window, then resample
      // back to reference size so the fixed 0-9 templates + reference P still apply.
      // P.matchScale (default 1, EXPERIMENTAL): shrink less aggressively - to
      // matchScale x reference size instead of 1x - for a sharper glyph at the cost of
      // a bigger sliding-match window. templates must be pre-scaled by the same factor
      // (see upscaleTemplate) or the sizes won't line up.
      const targetScale = scale / (P.matchScale || 1);
      const swL = Math.round(stripL * scale), swR = Math.round(stripR * scale), up = Math.round(P.up * scale), dn = Math.round(P.dn * scale);
      const raw = crop(V, W, H, cx - swL, cy - up, cx + swR, cy + dn);
      if (!raw.w || !raw.h) return { text: '?', conf: 0, glyphs: [] };
      sub = resample(raw, Math.max(1, Math.round(raw.w / targetScale)), Math.max(1, Math.round(raw.h / targetScale)));
    } else {
      sub = crop(V, W, H, cx - stripL, cy - P.up, cx + stripR, cy + P.dn);
    }
    if (!sub.w || !sub.h) return { text: '?', conf: 0, glyphs: [] };
    const bin = dropSmallBlobs(binarizeP(sub, P), P.minBlob);
    // cell scale vs reference (matchScale): the pixel limits below were measured on
    // reference-size digits and grow with it
    const S = P.matchScale > 1 ? P.matchScale : 1;

    // Auto-detect how far the real number extends and mask off everything past it -
    // skipped when a user has manually pinned stripRight for this exact slot (see the OCR
    // debug panel), which already built a tighter bin above and means "trust my number,
    // not the detector". A few reference px of margin keeps a slightly-wider-than-expected
    // last digit (or its own anti-aliased edge) from being clipped by the mask itself.
    if (P.stripRight == null && !P.noAutoRight) {
      const span = detectDigitSpan(bin, S);
      if (span) {
        const cutX = Math.min(bin.w, span.endX + 3 * S);
        for (let y = 0; y < bin.h; y++)
          for (let x = cutX; x < bin.w; x++) bin.data[y * bin.w + x] = 0;
      }
    }

    let cands = collect(bin, templates, P.iouThresh, P);

    // FALLBACK: grey tophat for bright-on-bright cells (marble/gold faces).
    if (!cands.length) {
      let ks = Math.max(3, Math.floor(Math.min(sub.h, sub.w) / 4));
      if (ks > 1 && ks % 2 === 0) ks += 1;
      try {
        const opening = greyOpening(sub, ks);
        const top = new Uint8Array(sub.data.length);
        for (let i = 0; i < top.length; i++) {
          let v = sub.data[i] - opening.data[i];
          top[i] = v < 0 ? 0 : (v > 255 ? 255 : v);
        }
        const tImg = { data: top, w: sub.w, h: sub.h };
        const thr = Math.max(otsu(top), P.floor - 20);
        const btop = { data: new Uint8Array(top.length), w: sub.w, h: sub.h };
        for (let i = 0; i < top.length; i++) btop.data[i] = top[i] > thr ? 1 : 0;
        const tc = collect(btop, templates, P.iouThresh * 0.70, P);
        if (tc.length) {
          const trial = tc.slice().sort((a, b) => a.x - b.x).map(c => c.ch).join('');
          const ones = (trial.match(/1/g) || []).length;
          if (!(ones >= 2 || trial === '11' || trial === '111')) cands = tc;
        }
        void tImg;
      } catch (e) { /* proceed with empty */ }
    }

    if (!cands.length) return { text: '?', conf: 0, glyphs: [] };

    // Pick ONE winner per contested footprint, then greedily accept non-overlapping
    // winners. P.preferWideOnTie (opt-in, default off - existing regimes are unaffected):
    // when two candidates at close scores compete for the same ink, a thin "1" can score
    // deceptively high against just ONE stroke of a wider digit (e.g. "4"'s vertical) and
    // win outright, silently eating the wider glyph's position - "348" reads "318".
    // Preferring the wider template on a near-tie favours the full-glyph match.
    //
    // Two earlier attempts at this both broke on real captures:
    //  - a single comparator returning b.tw-a.tw within 0.08 of score, b.score-a.score
    //    otherwise, isn't transitive (A~B by width, B~C by width, A and C differ by score
    //    alone), so Array.sort - which only assumes a strict weak order - gave a result
    //    that depended on cands' incoming order, not just the scores: same candidates,
    //    different collect() iteration order, different winner. Measured: "261" lost its
    //    "6" to an unrelated "1".
    //  - sorting by score then merging *consecutive* candidates within 0.08 of each
    //    other's neighbour (or of a running chain start) is transitive, but still wrong:
    //    it ties candidates by score alone regardless of WHERE they sit. A dominant "3" at
    //    one x and a middling "1" at a completely different, non-overlapping x can end up
    //    "tied" by score with nothing to do with each other, while the "1" and the real
    //    "4" it should be competing against (close by score, close by position) end up
    //    split into different chains because the "1" chained onto the "3" first. Measured:
    //    still broke "348" into "318" this way.
    //
    // The two candidates a width-preference should ever compare are ones that can never
    // BOTH be accepted anyway - i.e. their footprints overlap (directly, or transitively
    // through a shared neighbour). So: group into overlap-connected clusters first (a
    // property of x/width alone, unaffected by score), then resolve one winner per
    // cluster (highest score; on a near-tie within that cluster, widest template), then
    // run the ordinary greedy accept over just the per-cluster winners.
    function clusterByOverlap(items) {
      const clusters = items.map((c) => [c]);
      for (let merged = true; merged;) {
        merged = false;
        for (let i = 0; i < clusters.length && !merged; i++) {
          for (let j = i + 1; j < clusters.length; j++) {
            if (clusters[i].some((a) => clusters[j].some((b) => overlaps(a.x, a.tw, [b])))) {
              clusters[i] = clusters[i].concat(clusters[j]);
              clusters.splice(j, 1);
              merged = true;
              break;
            }
          }
        }
      }
      return clusters;
    }
    const TIE = 0.08;
    const winners = clusterByOverlap(cands).map((cluster) => {
      cluster.sort((a, b) => b.score - a.score);
      if (!P.preferWideOnTie) return cluster[0];
      const top = cluster[0].score;
      const tied = cluster.filter((c) => top - c.score < TIE);
      tied.sort((a, b) => b.tw - a.tw);
      return tied[0];
    });
    winners.sort((a, b) => b.score - a.score);
    // Winners first, then every other candidate by score. A cluster is joined through
    // ANY overlap chain, so at a loose iouThresh (the extreme-scale regime) weak junk
    // candidates between two real digits can chain them into one cluster - and the old
    // one-winner-per-cluster rule then silently dropped the runner-up even though it
    // doesn't overlap the winner at all: "262" read "62" with the "2" matched at 0.96.
    // Letting losers in afterwards, under the same no-overlap rule, keeps the winner's
    // priority for the contested ink but recovers a real digit beside it.
    const winnerSet = new Set(winners);
    // only confident losers (a real digit scores ~0.9+; junk bridging clusters sits at
    // the loose threshold), so this recovers digits without letting icon noise back in
    const REST_MIN = 0.85;
    const rest = cands.filter((c) => !winnerSet.has(c) && c.score >= REST_MIN).sort((a, b) => b.score - a.score);
    const accepted = [];
    for (const c of winners.concat(rest)) if (!overlaps(c.x, c.tw, accepted)) accepted.push(c);

    // GAP-FILL between and after digits (lower threshold second pass)
    gapFill(bin, templates, accepted, P);

    // left-to-right
    accepted.sort((a, b) => a.x - b.x);

    // POST-FILTER: drop a leading spurious "1" (edge bleed) with no left ink,
    // clustered with another "1".
    const filtered = [];
    const minX = accepted.length ? accepted[0].x : Infinity;
    for (const c of accepted) {
      if (c.x === minX && c.ch === '1') {
        let hasLeftInk = false;
        if (c.x > 0) {
          const x0 = Math.max(0, c.x - 2 * S);
          for (let y = 0; y < bin.h && !hasLeftInk; y++)
            for (let x = x0; x < c.x; x++) if (bin.data[y * bin.w + x]) { hasLeftInk = true; break; }
        }
        if (!hasLeftInk && c.x > 2 * S) {
          const near = accepted.some(o => o.ch === '1' && o.x !== c.x && Math.abs(o.x - c.x) <= 4 * S);
          if (near) continue;
        }
      }
      filtered.push(c);
    }

    // POST-FILTER: drop a trailing cluster separated from the rest by a gap wider
    // than gapFill's own "plausible missing digit" range (MAX_DIGIT_GAP). A real
    // number's digits are always tightly kerned, so a gap that wide means whatever
    // comes after was never part of the number - typically a desaturated icon edge
    // (icon art sits right after short numbers inside the wide capture strip)
    // that happened to score above threshold on its own, read as a stray "1".
    for (let i = 1; i < filtered.length; i++) {
      const gap = filtered[i].x - (filtered[i - 1].x + (filtered[i - 1].tw || 0));
      if (gap > MAX_DIGIT_GAP * S) { filtered.length = i; break; }
    }
    if (!filtered.length) return { text: '?', conf: 0, glyphs: [] };
    // confidence = mean IoU match score of the accepted glyphs (gap-filled ones default
    // to the base threshold). Surfaced per-line in the UI so misreads are easy to spot.
    const scores = filtered.map((c) => (typeof c.score === 'number' ? c.score : P.iouThresh));
    const conf = scores.reduce((a, b) => a + b, 0) / scores.length;
    // DEBUG: which template key won each accepted position, and at what score - so a
    // misread can be inspected ("why did it pick THIS glyph") instead of guessed at.
    // Gap-filled glyphs (no c.score) are marked estimated rather than given a fake score.
    const glyphs = filtered.map((c) => ({
      ch: c.ch, x: c.x, dy: c.dy != null ? c.dy : null, // where it matched (the debug panel's difference picture)
      score: typeof c.score === 'number' ? +c.score.toFixed(3) : null,
      gapFilled: typeof c.score !== 'number',
    }));
    return { text: filtered.map((c) => c.ch).join(''), conf, glyphs };
  }

  // string-only wrapper: back-compat for callers that just want the count text.
  function readCell(V, W, H, cx, cy, templates, P, scale) {
    return readCellEx(V, W, H, cx, cy, templates, P, scale).text;
  }

  // DEBUG ONLY: expose the exact intermediate images readCellEx works from - the
  // shrunk-to-reference-size cell it hands to binarize/template matching, and the
  // binarized result - so a misread can be inspected visually instead of guessed at.
  // Not used by the live reader; see main.js's stash-debug-live tooling.
  function debugShrunkCell(V, W, H, cx, cy, P, scale) {
    scale = scale && scale > 0 ? scale : 1;
    const stripL = P.stripLeft != null ? P.stripLeft : P.stripWidth;
    const stripR = P.stripRight != null ? P.stripRight : P.stripWidth;
    let sub;
    if (scale !== 1) {
      // same shrink as readCellEx, matchScale included, so the view/teach cell IS the
      // cell that gets matched
      const targetScale = scale / (P.matchScale || 1);
      const swL = Math.round(stripL * scale), swR = Math.round(stripR * scale), up = Math.round(P.up * scale), dn = Math.round(P.dn * scale);
      const raw = crop(V, W, H, cx - swL, cy - up, cx + swR, cy + dn);
      sub = resample(raw, Math.max(1, Math.round(raw.w / targetScale)), Math.max(1, Math.round(raw.h / targetScale)));
    } else {
      sub = crop(V, W, H, cx - stripL, cy - P.up, cx + stripR, cy + P.dn);
    }
    return { shrunk: sub, binarized: dropSmallBlobs(binarizeP(sub, P), P.minBlob) };
  }

  // Binarisation floors tried per cell by readCellAdaptive, spanning "dim glyph on bright
  // art" to "bright glyph on dark art". P.floor (122) sits in the middle.
  const ADAPTIVE_FLOORS = [80, 95, 110, 122, 135, 150, 165, 180];

  /**
   * Read one cell, choosing the binarisation threshold PER CELL instead of trusting one
   * global floor.
   *
   * A single floor silently assumes every machine draws the glyph edge the same way, and
   * it does not - the same digit is a different number of ink pixels depending on the
   * renderer, and one threshold that suits the capture the templates were cut from will
   * thin or fatten everyone else's glyphs past matching. Sweeping and keeping the most
   * confident read is the cheapest way to stop guessing.
   *
   * Measured on the two ground-truthed real captures we hold:
   *   ultrawide  8/28 -> 13/28      community 1920x1080  13/35 -> 24/35
   * and the reference capture is unchanged at 34/35, because its own floor is in the set.
   */
  function readCellAdaptive(V, W, H, cx, cy, templates, P, scale) {
    // Keep the read from whichever threshold is most confident AND most complete.
    // Consensus voting was tried instead and is too conservative: on the ultrawide
    // capture the correct digits only survive one specific threshold, so requiring
    // agreement gave back every point the sweep had won (13/28 -> 8/28). The artefact
    // that motivated consensus - art at the strip edge read as a trailing "1" - is
    // handled precisely, by the edge filter in readCellEx, instead of by distrusting
    // every minority reading.
    let best = null;
    for (const floor of ADAPTIVE_FLOORS) {
      const r = readCellEx(V, W, H, cx, cy, templates, floor === P.floor ? P : Object.assign({}, P, { floor }), scale);
      if (!r.text || r.text === '?') continue;
      // Length cap 3 meant a 4-digit read and a 3-digit read carried the SAME length
      // weight, so the shorter read won on confidence alone and the last digit was
      // dropped. Measured over 13 captures at cap 6: one slot fixed (a real 4112 read
      // as 411), no correct answer broken, one already-wrong slot changed to a
      // different wrong answer. The cap still exists so a strip of art cannot win by
      // being long.
      const score = r.conf * Math.min(r.text.length, 6);
      if (!best || score > best.score) best = { text: r.text, conf: r.conf, score, floor, glyphs: r.glyphs };
    }
    return best
      ? { text: best.text, conf: best.conf, floor: best.floor, glyphs: best.glyphs }
      : { text: '?', conf: 0, glyphs: [] };
  }

  // collect candidates over all templates at a given IoU threshold.
  function collect(strip, templates, thresh, P) {
    const out = [];
    const integral = integralOf(strip); // once per strip, shared by every template
    for (const ch of Object.keys(templates)) {
      const t = templates[ch];
      const ms = slideMatch(strip, t, P.dyLo, P.dyHi, P.minInkFrac, integral);
      for (const m of ms) if (m.score >= thresh) out.push({ x: m.x, dy: m.dy, ch, score: m.score, tw: t.w });
    }
    return out;
  }

  function gapFill(bin, templates, accepted, P) {
    const S = P.matchScale > 1 ? P.matchScale : 1;
    const sorted = accepted.slice().sort((a, b) => a.x - b.x);
    const stripW = bin.w;
    const gapThresh = Math.max(0.70, P.iouThresh - 0.06);

    const subStrip = (gs, ge) => {
      const w = ge - gs, h = bin.h;
      const d = new Uint8Array(w * h);
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) d[y * w + x] = bin.data[y * bin.w + gs + x];
      return { data: d, w, h };
    };
    const regionInk = (gs, ge) => {
      let s = 0;
      for (let y = 0; y < bin.h; y++) for (let x = gs; x < ge; x++) s += bin.data[y * bin.w + x];
      return s;
    };

    // gaps BETWEEN consecutive digits
    for (let i = 0; i < sorted.length - 1; i++) {
      const gs = sorted[i].x + sorted[i].tw, ge = sorted[i + 1].x;
      const gw = ge - gs;
      if (gw >= 4 * S && gw <= 15 * S && regionInk(gs, ge) > 20 * S * S) {
        const region = subStrip(gs, ge);
        const gc = collect(region, templates, gapThresh, P).map(c => ({ ...c, x: gs + c.x }));
        gc.sort((a, b) => b.score - a.score);
        for (const c of gc) if (!overlaps(c.x, c.tw, accepted)) { accepted.push(c); break; }
      }
    }

    // gap AFTER the last digit (missing trailing digit)
    if (sorted.length >= 2) {
      const last = sorted[sorted.length - 1];
      const lastEnd = last.x + last.tw;
      const gwA = stripW - lastEnd;
      if (gwA >= 4 * S && gwA <= 15 * S) {
        const ink = regionInk(lastEnd, stripW);
        const density = gwA > 0 ? ink / gwA : 0;
        if (ink > 120 * S * S && density > 12 * S) {
          const region = subStrip(lastEnd, stripW);
          const gc = collect(region, templates, gapThresh, P).map(c => ({ ...c, x: lastEnd + c.x }));
          gc.sort((a, b) => b.score - a.score);
          for (const c of gc) if (!overlaps(c.x, c.tw, accepted)) { accepted.push(c); break; }
        }
      }
    }
  }

  // Default winning params (currency tab: 48/49).
  const DEFAULTS = {
    // stripWidth 17 (was 15): a 4-digit count built from WIDE digits (1084, 1608)
    // overflowed the 30px strip, the edge filter executed the protruding last digit as
    // presumed art, and the read came back confidently short - divine 1084 read 108 at
    // 0.99. Swept 15/17/18/20 over five ground-truthed captures: 17 fixes those and an
    // ultrawide slot (137 -> 143 correct), wider adds nothing.
    floor: 122, up: 12, dn: 12, stripWidth: 17,
    iouThresh: 0.76, dyLo: -2, dyHi: 3, minInkFrac: 0.45,
    // speck filter (dropSmallBlobs): white blobs under this many px are icon highlights,
    // not digits - the smallest digit exemplar in the bank is 15 px of ink, so 5 leaves a
    // wide margin while clearing the typical 1-4 px glint
    minBlob: 5,
  };

  // Max saturation (max-min) for a pixel to count as "flat white" text. Stack
  // counts are flat white with a black outline; icon art is saturated/blended, so
  // gating max(R,G,B) by low saturation isolates the digits and drops the icon.
  const DESAT_SAT = 40;

  // Value channel = max(R,G,B) but ONLY for low-saturation (near-white) pixels;
  // saturated icon pixels -> 0. Order-agnostic (RGBA or BGRA) since max/min/sat
  // don't depend on channel order. This is the channel the stash reader uses.
  function valueChannelDesatMax(buf, W, H, sat) {
    sat = sat == null ? DESAT_SAT : sat;
    const V = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      const a = buf[p], g = buf[p + 1], c = buf[p + 2];
      let mx = a, mn = a;
      if (g > mx) mx = g; if (g < mn) mn = g;
      if (c > mx) mx = c; if (c < mn) mn = c;
      V[i] = (mx - mn) <= sat ? mx : 0;
    }
    return V;
  }

  // Local-contrast gate: neighbourhood radius in REFERENCE px (callers scale it for a
  // native-resolution buffer). Stack counts are flat white WITH a black outline, so a
  // real digit pixel always has a dark pixel within ~2px; a bright spot in the icon art
  // (a highlight, a white gem facet) is usually bright over a bright/mid surround. Floor
  // and saturation both look at the pixel alone and can't tell those apart - this looks
  // at how much darker the pixel's surroundings get.
  const CONTRAST_RADIUS = 2;

  // Keep a pixel of V only if it is at least `contrast` brighter than the darkest pixel
  // within `radius` of it. The darkness is measured on the PLAIN max(R,G,B) channel, not
  // on V - V zeroes every saturated pixel, and those artificial zeros would make every
  // bright pixel next to coloured art look high-contrast. contrast 0 = off (V returned
  // untouched), so a slot without an override reads exactly as before.
  function contrastGate(V, buf, W, H, contrast, radius) {
    if (!contrast) return V;
    const r = Math.max(1, Math.round(radius == null ? CONTRAST_RADIUS : radius));
    const L = valueChannelFromRGBA(buf, W, H);
    // separable min filter (erode rows, then columns): O(W*H*r) instead of O(W*H*r^2)
    const rowMin = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      const o = y * W;
      for (let x = 0; x < W; x++) {
        let m = 255;
        const x0 = x - r < 0 ? 0 : x - r, x1 = x + r >= W ? W - 1 : x + r;
        for (let k = x0; k <= x1; k++) if (L[o + k] < m) m = L[o + k];
        rowMin[o + x] = m;
      }
    }
    const out = new Uint8Array(V);
    for (let y = 0; y < H; y++) {
      const y0 = y - r < 0 ? 0 : y - r, y1 = y + r >= H ? H - 1 : y + r;
      for (let x = 0; x < W; x++) {
        const i = y * W + x;
        if (!out[i]) continue;
        let m = 255;
        for (let k = y0; k <= y1; k++) { const v = rowMin[k * W + x]; if (v < m) m = v; }
        if (out[i] - m < contrast) out[i] = 0;
      }
    }
    return out;
  }

  // Saturation + brightness/contrast on the colour source BEFORE any filter, image-editor
  // style. Saturation first: each channel is pulled toward the pixel's grey (the MEAN of
  // its channels - order-agnostic, like everything here, since the buffer may be RGBA or
  // BGRA) by satPct/100: 0 = fully grey, 100 = unchanged, 200 = twice as colourful. This
  // matters because the reader's brightness is max(R,G,B): a pure red (255,0,0) is as
  // "bright" as white to it, but greyed out it is 85 - clearly darker than a white digit.
  // Then out = (v - 128) * gain/100 + 128 + bright, clamped. Returns a new buffer (alpha
  // untouched); all-neutral settings return buf itself.
  function adjustRGBA(buf, W, H, bright, gain, satPct) {
    bright = bright || 0; gain = gain == null ? 100 : gain; satPct = satPct == null ? 100 : satPct;
    if (!bright && gain === 100 && satPct === 100) return buf;
    const lut = new Uint8Array(256), k = gain / 100, sk = satPct / 100;
    for (let v = 0; v < 256; v++) {
      const o = Math.round((v - 128) * k + 128 + bright);
      lut[v] = o < 0 ? 0 : (o > 255 ? 255 : o);
    }
    const clamp = (v) => (v < 0 ? 0 : (v > 255 ? 255 : Math.round(v)));
    const out = Buffer.alloc(W * H * 4);
    for (let p = 0; p < W * H * 4; p += 4) {
      let a = buf[p], g = buf[p + 1], c = buf[p + 2];
      if (sk !== 1) {
        const m = (a + g + c) / 3;
        a = clamp(m + (a - m) * sk); g = clamp(m + (g - m) * sk); c = clamp(m + (c - m) * sk);
      }
      out[p] = lut[a]; out[p + 1] = lut[g]; out[p + 2] = lut[c]; out[p + 3] = buf[p + 3];
    }
    return out;
  }

  // Plain max(R,G,B) value channel (kept for the reference file-screenshot path).
  function valueChannelFromRGBA(buf, W, H, bgra) {
    const V = new Uint8Array(W * H);
    for (let i = 0, p = 0; i < W * H; i++, p += 4) {
      const a = buf[p], b = buf[p + 2];
      const c0 = bgra ? b : a, c2 = bgra ? a : b; // r/b swap for BGRA
      const g = buf[p + 1];
      let m = c0 > g ? c0 : g; if (c2 > m) m = c2;
      V[i] = m;
    }
    return V;
  }

  // Build a MULTI-RENDERING bank from a baked templates file that carries `variants`.
  //
  // The same digit is drawn differently on different machines - not a different size (the
  // font is fixed at 11px everywhere we have measured) but a different set of lit pixels.
  // One exemplar per digit therefore only ever reads well on renderings close to the
  // capture it was cut from. Extra exemplars are additive: leave-one-out across three
  // ground-truthed captures (each read using ONLY the other captures' templates) went
  //   ultrawide 13/28 -> 15/28    capture A 24/35 -> 33/35    capture B 19/33 -> 32/33
  // and the reference is unaffected, because nothing is removed.
  //
  // Each exemplar needs a distinct key so it can compete as its own template; the keys
  // are mapped back to digits by `unmap` after assembly. Extended with Greek letters
  // (49/52 Latin slots were already spoken for by 5 baked variants - a 6th would have
  // silently dropped 7 of its 10 digits) - Greek never collides with real OCR'd digit
  // output, so it is safe filler for more variant capacity without touching `unmap`'s
  // per-character replace logic.
  // one stand-in character per template beyond the base set. Was 100: the shipped
  // variants use 60, so learned groups beyond that were silently dropped - now roomy
  // (Cyrillic added: 164)
  const ALT_POOL = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
    + 'αβγδεζηθικλμνξοπρστυφχψωΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩ'
    + 'абвгдежзийклмнопрстуфхцчшщъыьэюяАБВГДЕЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯ';
  function bankFromJSON(obj) {
    const bank = templatesFromJSON(obj);
    const back = new Map();
    // DEBUG: which baked source each key came from, so a misread can say "the '4' that
    // won came from cap-1920x1080-a at score .81" instead of just a bare character.
    const src = new Map();
    for (const ch of Object.keys(bank)) src.set(ch, 'base');
    const variants = (obj && obj.variants) || [];
    let slot = 0;
    for (const v of variants) {
      const t = templatesFromJSON(v.templates || v);
      for (const ch of Object.keys(t)) {
        if (slot >= ALT_POOL.length) break;
        const key = ALT_POOL[slot++];
        bank[key] = t[ch];
        back.set(key, ch);
        src.set(key, v.source || 'variant');
      }
    }
    const unmap = (text) => String(text || '').replace(/./g, (c) => (back.has(c) ? back.get(c) : c));
    const sourceOf = (key) => src.get(key) || 'unknown';
    return { bank, unmap, sourceOf, variantCount: variants.length };
  }

  // Rehydrate a baked template set ({ templates: { ch: {w,h,data:[…]} } } or the
  // bare { ch: {w,h,data} } map) into the {data:Uint8Array,w,h} form readCell wants.
  function templatesFromJSON(obj) {
    const src = obj && obj.templates ? obj.templates : obj;
    const out = {};
    for (const ch of Object.keys(src || {})) {
      const t = src[ch];
      out[ch] = { w: t.w, h: t.h, data: Uint8Array.from(t.data) };
    }
    return out;
  }

  // EXPERIMENTAL: nearest-neighbour pixel duplication, factor x. Templates are already
  // binary bitmaps (no anti-aliasing to interpolate), so exact integer duplication is a
  // faithful enlargement - unlike resampling a real capture, there is no new information
  // to invent or blur away. Pairs with P.matchScale in readCellEx.
  function upscaleTemplate(t, factor) {
    factor = Math.max(1, Math.round(factor));
    if (factor === 1) return t;
    const w = t.w * factor, h = t.h * factor;
    const out = new Uint8Array(w * h);
    for (let y = 0; y < t.h; y++) {
      for (let x = 0; x < t.w; x++) {
        const v = t.data[y * t.w + x];
        if (!v) continue;
        for (let dy = 0; dy < factor; dy++) {
          const row = (y * factor + dy) * w;
          for (let dx = 0; dx < factor; dx++) out[row + x * factor + dx] = 1;
        }
      }
    }
    return { w, h, data: out };
  }
  function upscaleTemplateBank(bank, factor) {
    const out = {};
    for (const ch of Object.keys(bank)) out[ch] = upscaleTemplate(bank[ch], factor);
    return out;
  }

  return {
    otsu, crop, binarize, binarizeLocal, binarizeP, dropSmallBlobs, components, iou, slideMatch, greyOpening, resampleRGBA, resample,
    ADAPTIVE_FLOORS, extractTemplates, readCell, readCellEx, readCellAdaptive, valueChannelFromRGBA, valueChannelDesatMax, adjustRGBA,
    templatesFromJSON, bankFromJSON, DEFAULTS, DESAT_SAT, contrastGate, CONTRAST_RADIUS, debugShrunkCell, detectDigitSpan,
    upscaleTemplate, upscaleTemplateBank,
  };
});
