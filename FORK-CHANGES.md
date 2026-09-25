# Fork changes on top of POE2 Prices v3.0.7

This fork of [POE2-VibeTools/poe2-currency-overlay](https://github.com/POE2-VibeTools/poe2-currency-overlay)
starts from tag `v3.0.7` and adds controller support, fixes for the German client, and a
reworked stash (Net Worth) digit reader with a tuning panel. It was built and tested by one
player on a **German client at 5120×2880 (5K)** with a **DualSense** controller. Everything
here is offered back upstream: take what is useful, leave what is setup-specific (marked
below).

- Branch with all changes: `claude/vibrant-hawking-by7wqx`
- Base: `v3.0.7` (`483a7af`)

---

## 1. German client fixes

| Problem | Cause | Fix | File |
|---|---|---|---|
| Rare *Aufseher-Tafel* (Overseer Tablet) price check fails with `trade2 search failed (400): Unknown item base type` | The item model preferred the raw localized nameplate line as `query.type`, but searches go to the English trade host | Prefer the parser DB's canonical `refName` (`unique.base` for uniques) over `parsed.baseType` | `renderer/item/item-tab.js` |
| Unique items not found on trade from a German client | Unique `name` was the localized title | Use `info.refName` before the title | `renderer/item/item-tab.js` |
| German "Außergewöhnlich…" (exceptional) items not parsed | Missing `ITEM_EXCEPTIONAL` pattern | Added `^Außergewöhnlich(?:e\|er\|es\|en) (.*)$` | `renderer/vendor/ee2/data/de/client_strings.js` |
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

### 4.7 Setup-specific – probably not for upstream as-is

- **Extra Exalted slots** `exalted-2..4` in the dynamic bottom rows of the currency tab
  (row 1 cell 1, row 2 cells 1–2), priced as Exalted via a new `priceAs` slot field and shown
  as "Exalted Orb #2" etc. This matches one player's habit of parking overflow Exalted there.
  The `priceAs` / `suffix` mechanism itself is generic.
- **Currency tab coordinates** (`currency-tab-map.js` STATIC_SLOTS) were recalibrated in
  code for one player's *enlarged in-game UI text*. For upstream, keep the original
  coordinates: with the align tool (4.5) each player now stores their own offsets in their
  config, so the shipped defaults should stay the standard-UI ones.
- Root-level dev scripts and scratch data from tuning (`analyze-*.js`, `sweep-*.js`,
  `build-5k-digit-variant.js`, `scratch-*.json`, `debug-*.png`, `pnpm-*.yaml`) are not
  meant to be merged.

---

## 5. New config keys

| Key | Default | Meaning |
|---|---|---|
| `gamepadBindings` | `{ repriceRead: 2, repricePaste: 0 }` | Controller button per action |
| `commandHotkeys[].gamepad` | – | Controller button per chat command |
| `stashSlotOverrides[tab][apiId]` | – | Per-slot position (4.5) + reader settings (4.3) |
| `stashShowOcrDebug` | `false` | Debug panel; also gates debug file writes |
| `stashHiRes` | `false` | Global ×2 matching (4K/5K) |
| `stashShowReliability` | `false` | "Often misread" row tints |

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
