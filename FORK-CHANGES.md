# Fork changes on top of POE2 Prices v3.0.7

This fork of [POE2-VibeTools/poe2-currency-overlay](https://github.com/POE2-VibeTools/poe2-currency-overlay)
starts from tag `v3.0.7` and adds controller support, fixes for the German client, and a
reworked stash (Net Worth) digit reader with a tuning panel. It was built and tested by one
player on a **German client at 5120×2880 (5K)** with a **DualSense** controller. Everything
here is offered back upstream: take what is useful, leave what is setup-specific (marked
below).

- Branch: `de-controller-ocr` in [Squallsnext/poe2-currency-overlay](https://github.com/Squallsnext/poe2-currency-overlay),
  on top of upstream `master` (`20ea30a`, v3.0.7 + changelog)
- One commit per step, in the order the work was done, so single features can be
  cherry-picked or reverted on their own (see "Where things live" at the end).

---

## 1. German client fixes

| Problem | Cause | Fix | File |
|---|---|---|---|
| Rare *Aufseher-Tafel* (Overseer Tablet) price check fails with `trade2 search failed (400): Unknown item base type` | The item model preferred the raw localized nameplate line as `query.type`, but searches go to the English trade host | Prefer the parser DB's canonical `refName` (`unique.base` for uniques) over `parsed.baseType` | `renderer/item/item-tab.js` |
| Unique items not found on trade from a German client | Unique `name` was the localized title | Use `info.refName` before the title | `renderer/item/item-tab.js` |
| German "Außergewöhnlich…" (exceptional) items not parsed | Missing `ITEM_EXCEPTIONAL` pattern | Added `^Außergewöhnlich(?:e\|er\|es\|en) (.*)$` | `renderer/vendor/ee2/data/de/client_strings.js` |
| Lesser/Greater/Perfect **Rebirth Rune** not recognised (no price check, no search) | GGG renamed them in German to "Kleine/Große/Perfekte Wiederbelebungsrune"; the vendored EE2 data (and poe2db) still say "…Wiedergeburt-Rune" | New `scripts/ee2-name-aliases.mjs`: a commented list of renamed items, appended as extra name records (old names keep working); index rebuilt with `gen-ee2-index.mjs de` (ref/stat indexes byte-identical); display names regenerated | `scripts/ee2-name-aliases.mjs`, `renderer/vendor/ee2/data/de/items.ndjson`, `items-name.index.bin`, `renderer/i18n/game-names.js` |
| German requirement line not parsed for Dexterity | `REQUIRES_LINE` expected `Geschick ` / `Ges ` with a trailing space | Removed the stray spaces | same |

The tablet fix was confirmed against the live trade API (`Aufseher-Tafel` → 400,
`Overseer Tablet` → 200) and in game. A standalone patch and notes are in
`patches/0001-Fix-localized-rare-tablet-base-type-search.patch` and
`poe2-prices-v307-de-rare-tablet-fix.md` on `main`.

---

## 2. Controller support (DualSense)

**Why not the browser Gamepad API:** every overlay window is shown without taking focus,
and `navigator.getGamepads()` only updates for a focused page. So input is read from raw
HID reports instead (`node-hid`, new dependency), in `gamepad.js`.

- USB DualSense profile (`054c:0ce6`); the button layout lives in a data table
  (`CONTROLLER_PROFILES`), so another controller is one more entry, not a rewrite.
  Bluetooth is out of scope (different report layout).
- Button numbering follows the standard gamepad mapping (`0` = Cross, `2` = Square, …),
  see `dualsense-gamepad-button-map.md`.
- **Every hotkey action can also be bound to a controller button** (Settings → the
  "Controller" field next to each hotkey, click and press a button):
  toggle overlay, **close overlay** (new, hide-only, like Escape), item check pin/temp
  (toggles on a second press), stash capture, reprice toggle, reprice read, reprice paste,
  and each chat command hotkey.
- Defaults: Square = start reprice read, Cross = paste reprice result.
- Config: `gamepadBindings` (action → button index), `commandHotkeys[].gamepad`.

### Reprice with a controller

- **Read** (Square): same as right-clicking – reads the price in the Set Item Price dialog
  and computes the new one.
- **Paste** (Cross): sends Ctrl+A, Ctrl+V – **only** within 5 s of a successful
  clipboard-writing read while reprice mode is on. It never fires on a stale clipboard or
  during normal play.

---

## 3. Reprice reader

- **Two-frame confirmation:** a value is accepted only when two consecutive frames read the
  same number. A frame caught while the dialog is still drawing in read "14" as a confident
  "11"; the rule then produced a wrong price.
- **Faster polling:** sleep between looks 40 → 10 ms. Each look already waits for the next
  video frame (≤45 ms), which is the real pacing.
- **Debug crops (`read-diag`, dev builds)** are written only while the OCR debug switch is
  on, and asynchronously. Before, a PNG was written synchronously on *every* poll.
- 5120×2880 added to the supported resolution list.

---

## 4. Net Worth (stash) digit reader

### 4.1 Bugs fixed

1. **Preview ≠ live read.** The OCR debug preview read native pixels, while the live reader
   first normalises the panel to reference size (1.15–1.5× regime), and it matched only the
   shipped templates, not the learned ones. The panel could say "would read 211" for a slot
   the scan read as 261. Teaching cut glyphs from yet another variant (per-cell rescale, no
   overrides). **All three now share one path:** `renderer/stash/read-pipeline.js`
   (`buildChannel`, `slotPos`, `slotParams`, `buildBank`, `readSlot`).
2. **Slot read at NaN position.** An override holding only floor/saturation (no `cx/cy`)
   made the worker use `ov.cx` → `undefined`. Fixed with `!= null` checks.
3. **Leading digit dropped at loose thresholds ("262" → "62").** In the extreme-scale regime
   (`iouThresh` 0.66), weak junk candidates between two real digits chained them into one
   overlap cluster, and "one winner per cluster" discarded the runner-up even though it did
   not overlap the winner (the "2" had matched at 0.96). Teaching could not fix this.
   Now, after the cluster winners, other candidates scoring ≥ 0.85 are accepted under the
   same no-overlap rule (`digit-reader.js`, `readCellEx`).
4. **Size limits hard-coded to reference px.** `components()`, digit-span detection, edge
   filter, gap fill, speck area and the dy window now scale with the matching scale.

### 4.2 High-resolution matching (4K/5K)

On 5K the panel is ~2.7× reference; the reader cropped each cell natively and shrank it to
reference size (~9 px digits), discarding most of the detail. The existing experimental
`matchScale` is now usable:

- `matchScale: 2` keeps the cell at 2× reference. Reference templates are upscaled ×2;
  **templates taught at ×2 are stored separately** (`learned.byScale[2]`) and join the ×2
  bank as-is, so the ×2 bank sharpens as the user teaches.
- Only enabled where the capture has the pixels (`cellScale > 1`), capped at
  `floor(cellScale)`.
- Global setting **"Read counts at high resolution"** (`stashHiRes`, default off);
  a per-slot value overrides it.
- In practice on 5K: reads that failed at ×1 (e.g. "8" for 348) read correctly at ×2.

### 4.3 New per-slot filters

All optional, default neutral, saved per slot in `stashSlotOverrides` and used by scan,
preview and teach alike:

| Setting (key) | What it does |
|---|---|
| Saturation % (`satPct`) | Real saturation on the colour source (0 = grey = mean of channels). The reader's brightness is `max(R,G,B)`, so pure red/blue counted as bright as white; greyed out, red 255 → 85, white stays 255. |
| Brightness / image contrast (`bright`, `gain`) | Classic brightness/contrast on the colour source before every filter. |
| Colour limit (`desatSat`, existing) | Pixels more colourful than this are removed. Slider now goes up to 255 (= off). |
| Contrast (`contrast`) | Local contrast gate: keep a pixel only if something within ~2 px is this much darker (digits have a black outline, highlights usually don't). |
| Local cut (`localThr`) | Alternative to the global floor: white top-hat (V minus grey opening, kernel 5 at reference size). Keeps thin bright strokes that stand out from their surroundings; removes flat bright surfaces even when they are as bright as the digit (white digit on white marble). A plain "brighter than local mean" test was tried first and drew a halo around every digit. |
| Speck filter (`minBlob`) | After binarisation, drop white blobs smaller than N px. **On by default (5)**; the smallest digit exemplar is 15 px. |
| Floor (`floor`, existing) | The panel now shows the cut **actually used** (`max(floor, Otsu)`), which explains why a low floor often "does nothing". |
| Resolution (`matchScale`) | See 4.2. |

### 4.4 OCR debug panel (Settings → Net Worth → "Show OCR debug images")

- Three views of the same window: **original**, **greyscale as the reader gets it**
  (after colour/contrast filters), **black/white** after the cut.
- "würde lesen / would read" runs the live reader's exact path and shows the number of
  templates compared and how many exemplars were taught per digit.
- **Save** stores only the sliders actually moved (an untouched floor stays adaptive);
  saved sliders are marked with •; **Back to automatic** clears the slot.
- **Standard** / **All filters off** presets (preview only).
- **Copy / Paste** settings between slots (paste saves directly).
- **Apply to whole tab:** saves the current slot's sliders onto every slot of that stash
  tab (with a confirmation), for the common case of one well-tuned slot fitting the tab.
- **Per-tab debug:** the global "Show OCR debug images" switch only adds a **Debug** button
  to each tab card; previews (each a full re-read) are built only for tabs switched on
  there. With four tabs debugging at once, the load was noticeable.
- **One slot at a time:** inside a debugged tab each row has a 🔍 button; only the picked
  row builds images, sliders and live previews.
- **Previews and teach work on a window around the slot** (`cropAroundSlot`, 64 reference
  px each way) instead of the whole screen in the native regimes. At 5K that is a
  ~340×340 cut instead of 5120×2880 per slider move; reads are identical (checked on
  synthetic 1×, 1.07× and 2.67× frames). A scan (F7) is unaffected - it reads every slot
  in one pass anyway.
- **Learn from this image**: teaches from exactly the black/white cell on screen with the
  current (even unsaved) sliders; reports "found N parts, expected M digits" instead of
  learning garbage.
- **Learning only when useful:** the row's ✓ appears below 75 % confidence, and "learn"
  refuses a number the preview already reads correctly at ≥75 % (copies of confident reads
  only drown out variety in the median template). A wrong read is always teachable.
- After a ✓ the slot is re-read immediately, so its percentage updates without a rescan.
- The settings section is collapsible per slot (closed by default); re-renders keep the
  scroll position instead of jumping.
- The right-edge trim slider was removed (it cuts off 4-digit counts); a reset also clears
  an old saved right edge.

### 4.5 Slot alignment tool ("Ausrichten")

> Where per-player settings live: alignment, per-slot reader settings and switches are in
> the player's own `config.json` (`stashSlotOverrides`, …), learned digits in
> `learned-digit-templates.json`, both under the app's userData folder. Nothing of one
> player's setup is in the code.

New in this fork. It started as a dev-only page written next to each scan's debug images
(`stash-debug-live`, output "copy the deltas and send them to a developer"), which does not
scale past one machine. It now opens as a real window from the app, and **Save writes
straight into the config**, so a player whose setup misreads a slot fixes it themselves.

**Why it matters:** the built-in calibration expects the player to line the capture up with
the stash panel's green frame. Controller players (and the controller UI) don't get that
frame, so every tab ended up a few px off the grid and slots read wrong. The align tool
fixes the reading boxes directly on the captured image instead. Verified in game on the
Currency and Ritual tabs at 5K.

**Where:** on every scanned tab card, the **"Ausrichten" / Align** button (it needs the
captured frame, so it exists only after a scan of that tab). The supported tabs are listed
in the empty Net Worth view and in its settings.

**What it shows:** the captured stash panel with one box per stack-count reading window,
coloured by the last read: red = unread, yellow = unsure (65–80 %), green = good (≥80 %).
Only red/yellow boxes are shown by default ("also show good slots" reveals the rest).

**How to use it:**
- **Drag** a box so it sits on the number; **arrow keys** move the selected box by 1 px,
  **Shift + arrow** by 5 px.
- **Width / Height** resize **all** boxes at once (the hidden good ones too), so a box that
  reaches into the neighbouring icon can be tightened for the whole tab.
- **Row align (key R):** select the first box of a row; every box to its right whose centre
  is within 10 reference px above/below takes the same height (y only, x untouched). The
  tolerance is below the gap to the offset half-rows (~19 px), so neighbouring rows are
  never pulled in. Made for controller players, who cannot line boxes up by dragging onto
  the game's frame and always end up a few px off.
- **Column align (key S):** select the top box of a column; every box below it whose centre
  is within 25 reference px left/right takes the same x (y untouched). Wider than the row
  tolerance because hand-placed boxes drift sideways more, still under half the column
  spacing.
- **Move all (key A):** while on, dragging or nudging the selected box moves every box
  by the same offset – for a tab that is consistently off (calibration not quite hit):
  align one box and the rest follows. Checked in headless Chromium (keys, drag, undo).
- **Snap to frame (key F):** align one box by hand and select it; every other box (or only
  the marked ones) is placed at the same spot relative to its own cell frame. Each frame's
  top-left corner is found in the captured panel as the strongest long straight
  vertical/horizontal edge near the expected spot (icon art has short, curved edges). This
  avoids a shared offset drifting across a wide row. Tested in headless Chromium on a real
  5K capture of the currency tab's bottom rows: 13 boxes placed up to ±12 px off all
  landed on their numbers, spaced 162/163 px, rows level.
  Reported afterwards: a second F pulled boxes away that already sat perfectly, and the
  arrow keys scrolled the window instead of moving the box. Reproduced and fixed:
  - the search range grows with the box (at 5K ~35 px), and within it the strongest line
    can be the wrong one: the neighbour cell's frame ~15 px (reference) further out is
    nearly as strong as the cell's own (7586 vs 6815), and a digit "1" is a straight
    stroke that beat the frame outright (6318 vs 3985). With a 25 px range the old
    search moved perfectly placed boxes 31 px off. Now: a line only counts where it runs
    along (nearly) all of a ~3-box-height run (second-weakest of 6 pieces), and of all
    clear lines the one whose light/dark pattern is most like the leader's wins, ties
    to the nearest - a box that already sits right stays exactly where it is.
  - **Suchbereich** (px, how far a box may jump) and **Sicherheit** (%, how strong and
    how alike the found line must be compared to the leader's) are adjustable and
    remembered; a box below Sicherheit is not moved but outlined dashed. A status line
    says how many boxes snapped / already sat / were unsure.
  - arrow keys: after clicking a checkbox the focus stayed on it and the key handler
    ignored every INPUT; a click into the picture no longer moved focus (the lasso
    prevents the default). Now checkboxes don't block the keys and a click on the
    picture or a box drops focus from any field.
  Re-tested headless: all boxes ≤1 px at ranges 14/25/35 px, pressing F twice, from
  exact and from shifted positions, and at 2.5× scale with boxes up to ±30 px off.
  (An edge-profile match over the whole surroundings was tried too and was less exact.)
- **Marking:** Ctrl+click boxes or drag a lasso on an empty area; moving one marked box
  moves the marked group only (Esc clears).
- **Undo (Ctrl+Z)** for drags, nudges and both align actions (50 steps).
- **Grid** toggle with adjustable spacing, plus a dashed guide line through the selected
  box's centre. Both settings are remembered.
- **Save & apply** writes per-slot `cx, cy, stripWidth, up, dn` (reference-space) into
  `stashSlotOverrides[tab][apiId]`; the next scan uses them. **Copy deltas** still copies
  them as JSON for a developer.

**Implementation:** `stash-adjust-open` / `stash-adjust-save` in `main.js` (window built by
`buildAdjustWindowHtml`, preload `renderer/stash/adjust-preload.js`). Overrides are merged
per slot (`mergeSlotOverrides`), so an alignment save and a debug-panel save (floor,
filters…) never overwrite each other. Positions are in reference space, so they survive
resolution changes as long as the panel is detected. New slots added to a tab map (e.g.
the extra Exalted cells, 4.7) appear in the tool automatically.

**Typical workflow for a bad slot:**
1. Scan → the row is red or reads wrong.
2. **Align** – is the box on the number? If not, drag it there and save. Rescan.
3. Still wrong → OCR debug panel (4.4): tune the filters for that slot, check "would
   read", **Save**. Rescan.
4. Reads the right number but unsure (< 75 %) → **✓** or **Learn from this image**.
5. Several slots with the same kind of background → **Copy** on the good one, **Paste** on
   the others.

### 4.6 Other Net Worth changes

- **Implausible prices on thin markets** (`sanitizeThinPrices` in `main.js`, applied when
  a price category is loaded, so the currency tab, price checks and Net Worth all get it):
  poe2scout's current price for a rarely traded item can come from a handful of fills
  (base Rebirth Rune: 339 Ex on 6 trades; the days before 5–20 Ex; GGG's exchange 5 Ex).
  A price more than 3× off its reference is replaced: reference = the GGG Currency
  Exchange rate against Exalted when ≥5 units traded, else – only if the item is thin
  *right now* (latest daily quantity < 20) – the median of the last days. Raw price kept
  (`priceRaw`, `priceSource`); Net Worth shows such values with "≈" and explains on hover.
  Checked against live data (Forbidden Rites): core currency untouched (0 of 38 changed),
  34 of 142 runes and 23 of 82 essences corrected; Rebirth Rune 339 → 22 Ex.

- **Own price per item + "sources disagree" warning** (`priceRefs` / `applyPriceRules`
  in `main.js`, `config.priceOverrides`). Some prices cannot be fixed from the data at
  all: Greater Rebirth Rune showed 19.7 Ex (poe2scout), 7.6 Ex (exchange vs Exalted,
  70 units), 18 Ex (vs Divine) and 318 Ex (vs Chaos) – while it actually sold at 4 for
  1 Ex. So the player can set their own price per unit: click the value of a Net Worth
  line, or "Own price" on the item tab's price card (`0.25`, `0,25` or `1/4`; empty /
  "Reset" = back to the feed). It wins everywhere (currency tab, price check, Net Worth,
  exchange-only items), marked "✎". Every item also carries its independent sources
  (poe2scout, recent median while thin, exchange vs Exalted with ≥5 units); when they are
  more than 3× apart the value is marked "⚠" and the hover/card lists them.
  Two things were measured and deliberately **not** done (live data, 635 items):
  - Exchange rates via Chaos/Divine are not used as a source: nobody pays less than one
    whole Chaos/Divine, so for anything cheap they sit far too high (a 0.3 Ex item bought
    for 1 Chaos "costs" 66 Ex). Counting them flagged 297 of 635 items.
  - An uncertain price is not replaced by a flat 1 Ex: even the direct sources disagree
    >3× on 113 of 635 items, including e.g. Kopec's Orb of Sacrifice (193 feed vs 54
    exchange), where 1 Ex would be far more wrong than either source.

- **"Wrong tab?"** on every tab card: tab detection correlates the panel's edge structure
  against one baked fingerprint per tab, and on a setup unlike the baked one two tabs can
  swap (Kalguuran runes were detected as Ancient Augment at 5K). The player picks the right
  tab; that capture's fingerprint is stored as an extra detection template for it
  (`stashUserTabSigs`, newest 3 per tab, merged into detection as `tab@uN`) and the same
  frame is read again as that tab. The next scan of it on that setup is recognised.

- **Setup wizard** ("Einrichtung starten", in the empty Net Worth view and in its settings):
  five steps that move on by themselves – 1. calibrate (skippable when auto-detect works),
  2. scan, 3. open Align and fit the boxes (advances when the alignment is saved; new
  `stash-adjusted` event), 4. rescan, 5. result with the number of unsure slots and a
  one-click switch to OCR debug + confidence. "Next tab" repeats 2–5. Aimed at controller
  players, who otherwise have to discover calibration, Align and the debug panel alone.
- **Release notes:** a fork entry in the in-app Release notes viewer lists these changes,
  including the German client fixes. Its version string differs from the app version, so it
  never triggers the "What's new" popup.

- **Ritual tab:** slot R1-3 "Call of the Shadows" (`call-of-the-shadows`) added – it was one
  of the unmapped empties. Position extrapolated from the row spacing and confirmed in game
  (reads ×1 at 96 %).

- **The Net Worth list survives a restart** (rows, counts, corrections, include/exclude,
  order; `localStorage` key `nwRows.v1`). Before, it lived only in memory. Prices are the
  ones from the scan; the captured screenshots are not kept, so the debug panel/Align for a
  restored row asks for a rescan (this also fixes an endless re-request loop when a slot
  had no capture).

- Debug images of every scan (`writeStashDebug`, dev builds) are written only while the
  OCR debug switch is on.
- "Often misread" row tints (`SLOT_RELIABILITY`) behind a new setting
  (`stashShowReliability`, **default off** in this fork – upstream may prefer on). The table
  is a static measurement from other captures; per-slot tuning makes it stale.
- Supported resolutions list and hints mention 5120×2880.
- Currency tab map recalibrated after the in-game UI text size was increased
  (`currency-tab-map.js`); slot alignment tool ("Ausrichten") writes per-slot
  `cx/cy/stripWidth/up/dn` overrides (see 4.5).

### 4.7 Calibration window (4K/5K, taskbar)

- **Exact capture size:** the screenshot size is taken from the capture Chromium actually
  returns instead of `display.size × scaleFactor`, which on 5K/scaled displays came back a
  few pixels short and skewed the calibration box.
- **No taskbar offset:** the screenshot covers the full display, including the strip
  Windows reserves for the taskbar. The calibration window was constrained to the work
  area, so the image was drawn shifted against the pixels the user aligned. It now goes
  real fullscreen on the display bounds (`setBounds(disp.bounds)` + `setFullScreen`).
- **Separate X/Y scale** between capture pixels and window pixels, recomputed on resize,
  so the box and magnifier stay accurate from top to bottom.
- Diagnostics: an on-screen line with capture/window/display sizes (only while OCR debug
  is on), and `userData/calibration-debug.log`.
- **Texts via i18n:** the window loads the app's own `en.js`/`de.js` catalogs and gets the
  UI language from main (`calib.*` keys); other languages fall back to English like the
  main window. The stash guidance now describes the target as the *inner item field*
  (what works with the reader's aspect clamp), in both languages.

**Needs testing:** verified only on one 5K display with the taskbar at the bottom. Not
tested: 1080p/1440p, 150 %/200 % Windows scaling at other resolutions, taskbar left/right
or auto-hide, multi-monitor with the game on a secondary display.

### 4.8 Setup-specific parts – already removed from this branch

These existed in the player's own build and were **deliberately left out** here:

- The currency tab coordinates recalibrated for an enlarged in-game UI text and three extra
  Exalted cells in the bottom rows (last commits restore the shipped
  `currency-tab-map.js`). Each player now aligns with the align tool instead; the generic
  `priceAs` / `suffix` slot fields remain for maps that want duplicate slots.
- Tuning scripts, scratch data and debug images from the 5K work (`analyze-*.js`,
  `sweep-*.js`, `build-5k-digit-variant.js`, `test-5k-digit-variant.js`,
  `extract-strip-digits.js`, `scratch-*.json`, `debug-*.png`) and a pnpm lockfile.
  `package-lock.json` only gains the three packages `node-hid` needs.

## 5. New config keys

| Key | Default | Meaning |
|---|---|---|
| `gamepadBindings` | `{ repriceRead: 2, repricePaste: 0 }` | Controller button per action |
| `commandHotkeys[].gamepad` | – | Controller button per chat command |
| `stashSlotOverrides[tab][apiId]` | – | Per-slot position (4.5) + reader settings (4.3) |
| `stashShowOcrDebug` | `false` | Debug panel; also gates debug file writes |
| `stashHiRes` | `false` | Global ×2 matching (4K/5K) |
| `stashUserTabSigs` | `{}` | Extra tab-detection fingerprints from "Wrong tab?" |
| `stashShowReliability` | `false` | "Often misread" row tints |
| `priceOverrides` | `{}` | `apiId → { ex, at }`: the player's own price per unit |

Learned templates (`userData/learned-digit-templates.json`) gained `byScale[ms]` for
high-resolution templates; "Forget template" clears both.

---

## 6. Testing – what was and was not verified

- **Verified in game** by the user (German client, 5K, DualSense): tablet price check,
  controller read/paste, the align tool, the debug panel workflow, ×2 matching on real slots (e.g. 348,
  261/262), the 262 → 62 fix, filters on difficult icons (white marble "4", gold skull
  highlights).
- **Synthetic tests only** for the reader internals (digits drawn from the template bank
  onto artificial backgrounds, incl. a 2.67× upscale for the 5K regime): local cut, speck
  filter, contrast gate, cluster fix, ×2 learning. These show the mechanisms work; they are
  **not** a measurement on ground-truthed captures.
- **Not re-measured:** the upstream eval harnesses (`dev/stash-matcher/*`,
  `scripts/test-stash-*.js`) were not run, because the fixture screenshots are not in the
  repo. Before merging reader changes upstream, please re-run them – especially for the
  cluster fix (4.1.3), which changes candidate selection in every regime.

---

## 7. Where things live (for maintaining or extending the fork)

Each feature sits mostly in its own file; the shared files only get a hook.

| Feature | Own files | Hooks in shared files |
|---|---|---|
| German client fixes | – | `renderer/item/item-tab.js` (base type / unique name), `renderer/vendor/ee2/data/de/client_strings.js` |
| Controller input | `gamepad.js` (HID reading, button map in `CONTROLLER_PROFILES`) | `main.js`: `GAMEPAD_ACTIONS`, `startGamepadListener`, `capture-gamepad-button` / `set-gamepad-binding`; `renderer/renderer.js`: binding inputs; `renderer/index.html`: controller fields |
| Reprice controller paste, 2-frame confirmation | – | `reprice.js`: `pasteIfReady`, `prevBase` in `attempt()` |
| Stash read path (scan = preview = teach) | `renderer/stash/read-pipeline.js` | `renderer/stash/reader-worker.js` (scan), `main.js`: `stash-slot-debug-image`, `stash-teach-count` |
| Reader filters (local cut, speck filter, contrast gate, saturation, ×2 scaling) | `renderer/stash/digit-reader.js` (`binarizeLocal`, `dropSmallBlobs`, `contrastGate`, `adjustRGBA`, scale factor `S`) | per-slot values: `stashSlotOverrides` via `main.js` `stash-slot-save-read-settings` |
| Align tool | window built in `main.js` `buildAdjustWindowHtml` (self-contained HTML+JS), `renderer/stash/adjust-preload.js` | `stash-adjust-open` / `stash-adjust-save`, button in `networth-ui.js` `rowCard` |
| OCR debug panel, setup wizard, "Wrong tab?", list persistence | `renderer/stash/networth-ui.js` (sections marked by comments: debug panel, `startWizard`/`wizardCard`, `persistRows`, tab fix) | `main.js`: `stash-correct-tab`, `stash-adjusted` event |
| Tab detection with player fingerprints | – | `reader-worker.js` `detectTab`, config `stashUserTabSigs` |
| Calibration window | `renderer/stash/calibrate.html` / `calibrate.js` (`calib.*` i18n keys) | `main.js` calibration window setup |
| Texts | – | `renderer/i18n/en.js`, `de.js` (other languages fall back to English) |

To add a controller: one entry in `CONTROLLER_PROFILES` (`gamepad.js`). To add a tab: a
`*-tab-map.js` with `STATIC_SLOTS`, registered in `reader-worker.js` `TABS` and
`main.js` `TAB_MAPS`. To add a reader filter: a function in `digit-reader.js`, a key in
`read-pipeline.js` (`channelOpts` / `slotParams`), one slider spec in the debug panel's
`specs` list in `networth-ui.js`, and the key in `stash-slot-save-read-settings`.

