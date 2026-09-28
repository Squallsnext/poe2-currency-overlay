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
- Authorship: written with AI assistance (Claude, Codex); tested in game and reviewed by
  **Squallsnext**. Commits made with Claude carry a `Co-Authored-By` trailer, the same
  way upstream's own history does.

---

## 1. German client fixes

| Problem | Cause | Fix | File |
|---|---|---|---|
| Rare *Aufseher-Tafel* (Overseer Tablet) price check fails with `trade2 search failed (400): Unknown item base type` | The item model preferred the raw localized nameplate line as `query.type`, but searches go to the English trade host | Prefer the parser DB's canonical `refName` (`unique.base` for uniques) over `parsed.baseType` | `renderer/item/item-tab.js` |
| Unique items not found on trade from a German client | Unique `name` was the localized title | Use `info.refName` before the title | `renderer/item/item-tab.js` |
| German "Außergewöhnlich…" (exceptional) items not parsed | Missing `ITEM_EXCEPTIONAL` pattern | Added `^Außergewöhnlich(?:e\|er\|es\|en) (.*)$` | `renderer/vendor/ee2/data/de/client_strings.js` |
| Lesser/Greater/Perfect **Rebirth Rune** not recognised (no price check, no search) | GGG renamed them in German to "Kleine/Große/Perfekte Wiederbelebungsrune"; the vendored EE2 data (and poe2db) still say "…Wiedergeburt-Rune" | New `scripts/ee2-name-aliases.mjs`: a commented list of renamed items, appended as extra name records (old names keep working); index rebuilt with `gen-ee2-index.mjs de` (ref/stat indexes byte-identical); display names regenerated | `scripts/ee2-name-aliases.mjs`, `renderer/vendor/ee2/data/de/items.ndjson`, `items-name.index.bin`, `renderer/i18n/game-names.js` |
| Uniques on a base whose translated name stands for several English bases fail to parse ("item.parse_error"): German *Trephina* (Ambosshammer = Anvil Maul **and** Forge Maul), *Volls Protektor*, *Wylunds Pfahl*; 3 in French, 7 in Spanish, 3 in Portuguese, 1 in Russian | `findInDatabase` filtered the unique's variants by the FIRST English base of that name only; for a unique on the second one nothing was left, `info[0]` was undefined and the parse threw | Match any English base of the name, and never filter down to nothing | `renderer/vendor/ee2/src/parser/Parser.ts` |
| A price check's result shown on ANOTHER item (reported: a result landed on a tablet checked meanwhile) | After each await the search wrote into whatever item was showing by then; a running search also blocked the next item's search | A search generation: a new item (or a history entry) bumps it, an outdated search drops its result and no longer blocks | `renderer/item/item-tab.js` |
| **Byrnabas** (unique belt) price check: trade2 400 "Unknown item name" | The vendored data's English name is misspelt "Brynabas" (every language); the trade search sends that name. The game, the icon file and poe2db say "Byrnabas" | `REF_FIXES` in `scripts/ee2-name-aliases.mjs` corrects refNames in place in all languages; indexes rebuilt. Next report, **Splitter von Lorrata**: refName "Splinter of Loratta" (the data's own English name says Lorrata; poe2db only knows Lorrata). A scan of every unique whose English name and refName disagree found one more: **The Road Warrior**, still searched under its old name "The Immortan". Both fixed; afterwards every refName in all six languages resolves through the rebuilt indexes (≈3,440 each, 0 failures) | `scripts/ee2-name-aliases.mjs`, `renderer/vendor/ee2/data/*/items.ndjson`, `items-ref.index.bin` |
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
  (toggles on a second press), stash capture, reprice toggle, reprice read, and each chat
  command hotkey.
- Default: Square = start reprice read.
- Config: `gamepadBindings` (action → button index), `commandHotkeys[].gamepad`.

- **Button combos** (e.g. **PS + L2** - PS is the one button the game does not use):
  recording a binding collects every button pressed until all are released again (it
  used to take the first press), so a combo is just pressing the buttons together. A
  binding is one index or a sorted array; a combo fires when exactly its buttons are
  held; a single-button binding does not fire while PS is held or while a combo
  containing it is what is held ("PS + Square" does not also trigger "Square").
  Old single-number bindings work unchanged. Tested with synthetic DualSense reports.

- **Mic mute button** (DualSense, index 18 - beyond the standard mapping) is bindable;
  the game does not read it, so it is a free button.
- **"Open overlay in front"** (new controller action, Settings → General): opens the
  overlay AND makes it the active window, like a mouse click on it - the game goes to
  the background, so the controller no longer drives it; pressed again while the
  overlay is in front, it closes it and hands focus back to the game. A controller
  press is not an input Windows credits to the app, so a plain `focus()` is refused
  while the game holds the foreground; `focus-native.js` got `focusOwn(title)`, the same
  AttachThreadInput / SetForegroundWindow combo it already uses to focus the game.
  **Not yet tested in game.** (Driving the overlay with the controller - move between
  buttons, confirm, back - is planned, low priority.)

- **Browsing items with the D-pad** (Settings → General, on by default; config
  `gamepadItemBrowse`; asked for: "look at an item, then the next: PS to close, D-pad, PS
  again - every time"). While a price check the controller opened is up, a D-pad press -
  which the game uses to move its cursor to the next slot - also checks the item under
  the cursor once it has rested for 350 ms (walking over five slots is one search, not
  five); the right stick (past half its travel, so drift never fires it) or the bound
  button closes it (the stick close follows who OPENED the check, not the browse
  setting: a controller-opened check always closes with the stick, an F6 one never). An empty slot copies nothing and the last result stays; the same
  item again is not searched again. The D-pad press reaches the game untouched (the app
  only listens to the HID reports); each press causes at most the one Ctrl+C the price
  check hotkey sends anyway. `gamepad.js` got `onStick`. Tested with synthetic DualSense
  reports; **not yet tested in game.**

### Reprice with a controller

- **Read** (Square): same as right-clicking – reads the price in the Set Item Price dialog
  and computes the new one.
- **No paste button, on purpose.** An earlier version of this fork had one (Cross sent
  Ctrl+A, Ctrl+V right after a read). It was taken out: `REPRICE.md` states "The app
  never sends a key or a click", and GGG's developer policy forbids macro invocations
  triggered "from reading the screen" and apps that "interact with the game". A key
  press prepared by a screen read is at best a grey zone, which has no place in a
  public build. You paste with Ctrl+V as before.

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
- **Own page, tidier bar, steps and help** (`renderer/stash/adjust.html/.css/.js`; was
  a template string inside `main.js`). Controls are grouped (Size · Snap · Align ·
  Selection · View); a step line (1 size → 2 set a model → 3 snap → 4 check dashed) lights
  the current step with a one-line tip; the full explanation moved into a help popup
  (`? Hilfe` / H). "Copy deltas" (a developer tool) sits in the help. Slots where
  nothing was read are grey ("leer?") instead of red - usually an empty slot, not an
  error.
- **Several models for snapping.** Every box moved by hand becomes a model (★); each
  box is compared with the model it resembles most. Reported: on the essence tab the
  gilded frames of higher tiers looked "unlike" a plain model and only snapped with the
  certainty at ~15 %. Now: set one gilded box by hand, press F again.
- **Unsure boxes explain themselves.** The dashed box shows the certainty it would have
  needed (e.g. "12 %"), its tooltip says which measure failed (vertical line, horizontal
  line, frame looks different), a thin preview shows where it would go with an arrow
  (e.g. "→14 ↓3"), the status line says at which certainty all would snap, and
  "Unsichere trotzdem einrasten" takes the previews on purpose (Ctrl+Z undoes).
  Snap range and certainty are remembered per tab.
- **Plausibility ("Sprung?").** When the boxes' jumps are alike (the whole tab shifted),
  a box jumping clearly differently is held back: on a test panel with painted-on ornate
  frames, three boxes snapped 8-26 px wrong while their lines looked certain. The check
  only runs when the other jumps really are uniform - with boxes each off by a different
  amount it held back 8 of 13 correct snaps, so there it stays off.
- **Move readout.** Moving the selected box shows how far ("x −13 · y +9 px") and
  whether the snap range fits (a bit more than that move; much more risks the
  neighbour's frame), with a button to take the recommended value.
- Letter shortcuts (F, H, R, S, A) work right after typing into a number field; Enter
  leaves the field.
- **Second round of player feedback** (German, essence tab):
  - nothing is preselected when the window opens (the preselected box was what the
    arrows moved after marking a group with the lasso); after a lasso the marked group
    moves with the arrows right away (its top-left box is selected), a plain click on
    empty space clears marking and selection;
  - models (★) no longer pile up: only a box moved ALONE becomes one (not a marked group,
    not "alle mitbewegen"), F uses them and clears them, "★ aufheben" / V clears by hand -
    before, every touched box stayed a model and clicking the dashed ones after a snap
    made them models too, an endless loop;
  - after a snap with dashed boxes, the next F (without marking) works on the dashed ones
    only - what already sits is left alone, and a hand-set ornate model is not measured
    against the plain frames;
  - the jump plausibility check ignores boxes that do not move (on a half-aligned tab the
    already-right half made the other half's correct jumps look odd);
  - the step guide is the loud part now (bigger, in its own band, the current step lit),
    the tools are calm; step 1 says to size for a 4-digit count with a few px to spare;
  - the window stays in front of the overlay and remembers its size and position
    (`adjustWinBounds`).
- Tested headless: plain panel - uniformly shifted, each box randomly ±12 px, already
  right - all ≤1 px, nothing falsely flagged; ornate test panel - 10 snapped, 3 flagged
  "Sprung?", a second model fixes two more. **Not yet tested on a real essence tab.**

- **All boxes shown by default** (was: only red/yellow, with a "show good ones too"
  tick box). Players ticked it every single time: a box that reads a one-digit count
  fine can sit off once the count has two digits. "Only red/yellow" is now an
  opt-in switch, highlighted and remembered.
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

**"Nach Regel setzen" (G) – box by a fixed rule, no model.** A player's tested 5K setup:
every box 125×55 px, 5 px right of and 6 px below the cell's *inner* frame corner (where
the frame band ends and the dark interior begins). The button finds that corner in every
cell (`innerCorners` in `frame-snap.js`) and places the box by the rule; empty cells and
cells whose frame differs by tier work too, since nothing is compared with a model.
- Finding the corner: along a cell-long run, the 4 px left of / above the line are frame
  (bright), the 7 px right of / below it interior (dark). Score = frame brightness minus
  the brightest interior pixel, 30th percentile over the run (a count or icon art covers
  only part of it). The frame's outer edge, the neighbour's inner edge (dark → bright)
  and the neighbour's outer edge (only 2-3 px before this cell's frame starts) all fail
  that test.
- First one shift for the whole tab (median of each cell's best over ±70 px at 5K - a tab
  sits off by up to ~25 px), then each cell on its own over ±30 px (tab maps place their
  centres by the digit, single cells are off by up to ~20 px - the essence map's second
  column by 21 px). Unsure (score < 15, or found at the edge of the range): the box keeps
  its spot, is dashed ("Ecke?") with a preview, and "Unsichere trotzdem einrasten" takes it.
- Rule values are editable (links / oben / B / H in the capture's pixels), stored in
  reference units for all tabs; default = the 5K measurement scaled with the panel.
- **Measured** on the player's 12 support pictures of 5K tabs (native size): 11 tabs,
  ~0.3-1 s each; unsure only where no cell is (two map slots of Kalguur runes and three
  ritual slots, one of them on the tribute badge) - all correct cells found. Against the
  player's hand-aligned boxes the spread inside a tab is ≤ 1 reference px; the saved size
  is exactly theirs (stripWidth 21.94, up/dn 9.65). Tested headless in the align page
  (essence 82/82). **Not yet tested in game.**
- **At 1080p** (the currency picture scaled down to 582 px, as a stand-in for a real 1080p
  capture): 37 of 38 boxes set, all on the count and inside their own cell (44×19 px),
  the one unsure is a map slot with no cell. Boxes aligned by hand at 5K do NOT carry over
  to 1080p exactly (reported: they sat half in the neighbour cell) - stored in reference
  units, they still hold that setup's small panel-box offsets; G at the new resolution
  places them anew. Also seen: `currency-tab-map.js` puts exalted #3/#4 one row too low
  (cy 709; the player's own alignment has them at ~653, next to #2).

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

- **"Don't count" lists** (`renderer/stash/skip-groups.js`, own module; Settings → Net
  Worth, config `stashSkipGroups`). Later in a league some items are no longer sold but
  only upgraded (three lesser runes → one normal, three normal → one greater), so their
  market price inflates the total with value that is never realised. The player makes
  named lists, marks items (search, "mark all matches", icons, client-language names),
  and one switch per list leaves them out of Net Worth – off at league start, on later.
  Any number of lists. A template creates "lesser & normal runes": the lesser and normal
  tier of every rune family that also has a greater/perfect tier (unique runes stay
  out). Every list also sits as a chip on the Net Worth tab (one click toggles it), and
  a left-out line is greyed with the list's name – nothing disappears silently.
  Tested headless: template picks exactly the tiered families; total 590 → 400 Ex with
  the switch on and back with the chip; the list is saved.

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
  **Fixed: stuck on "step 1 of 5" after calibrating** (reported at 1080p). Confirming the
  calibration called `doStashCapture`, which an upstream refactor had removed - the call
  threw, `stash-calibrated` was never sent, so neither the wizard nor the "calibrated"
  notice moved on (upstream bug, v3.0.7). Now the calibration is reported at once
  (wizard -> step 2, "saved, the open tab is being read as a test") and the test read runs
  as a normal scan (`captureAndBroadcast`), whose result moves the wizard on as usual.
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

### 4.6b Tab tour ("Fächer scannen")

Settings → Net Worth (next to calibration) and the empty Net Worth tab. Goes through every
supported tab: "open tab X in game, then take the picture" - the app hides the overlay
and captures the game window itself - or "not owned / skip". Chips jump to any tab.
Per picture (`main.js` `tourCapture`): the reader checks which tab it is; a mismatch
teaches the expected tab's fingerprint (like "Wrong tab?") and reads again; the capture
is kept for the align tool right away and the panel (with a margin) is saved to
`userData/tab-shots/<tab>.png` + `.json` (box, frame size, reads). The align tool falls
back to that saved picture when a tab has no recent scan, so aligning works after a
restart without scanning again. "Open picture folder" shows the files - meant as the
source for frame templates (also for lower resolutions).
Reworked after the first real run: a player with the wrong tab open got it learned as the
asked-for tab. Now a picture that is not the tab asked for is **not** learned or saved -
the player is asked plainly ("expected Essences, the picture shows Abyss - usually another
tab is open") with "take it again" or "it IS Essences - remember it" (only that learns the
fingerprint). A correctly recognised picture of a tab drops that tab's learned
fingerprints that do not resemble it (normalised correlation < 0.8) - this removes a
fingerprint learned by mistake, while real ones (a tab the baked template misses on this
setup) resemble the player's own tab and stay. The read line now says what unread slots
mostly are: "46 counts read · 36 slots without a number - mostly items you don't have
(yet); aligning only needed where the game shows a number". Tested headless with stubbed
captures (walk, skip, learned mismatch, align from the tour, summary); the capture
itself needs the real game and is **not yet tested in game**.

**Support pictures** ("Fach-Bilder für Support", next to "Fächer scannen"): the quick
version - picture only, no reading, no tab check, nothing learned. The panel is found by
its frame (panel-finder, fast; calibration / reference box as fallback), cut out with a
margin and saved to `userData/tab-shots/support/<tab>.png` (+ `.json`: frame size, box,
how it was found). After each picture it moves straight to the next tab; "Done - open
folder" closes the run and opens the folder. Tested headless with a stubbed capture.

**Found in the first real support run:** after two tabs the pictures showed the hideout's
map device. The panel is found by its frame colour, which is the colour the player gave
the tab; where it was not found, the crop fell back to the reference-size box (a 1920
layout), which at 5K is the middle of the screen. Now the fallback is where the panel was
found for an earlier tab of the same run (the stash does not move between tabs), then
the calibration, and without either the **whole screen** is saved - never a wrong crop.
The dialog says which was used. The full tour does the same: a tab whose frame is not
found is read again at the panel position of an earlier tab (`runReaderWorker` got an
optional `calBox`).

**Second real run - a wrong "panel" carried forward.** At 5K a 282×249 region near the
hideout's flame was accepted as the panel frame (its colour matched), and the fallback
above then reused it for every later tab ("earlier-tab"). A found panel must now be
plausible before it is used or remembered (`plausible` in `panel-finder.js`): height
28-90 % of the screen, width/height 0.7-1.35 (the real panel is ~0.96; checked against
1080p, 1440p at 70 % UI scale and 5K). Applied in the normal scan (`reader-worker.js`), the
tour and the support pictures; an implausible find counts as "not found".

**Scan key takes the tour picture.** Reported with a controller: clicking the dialog's
button took the player out of the stash every time - three tries per tab. While the tour
dialog is open, the stash scan key (F7) and its controller button press the dialog's
"take picture" button instead of starting a Net Worth scan (`captureAndBroadcast` checks
a flag the dialog sets; reset on reload), so the player stays in the game. German tab
label fixed: "Uralte Augmentation" (was "Uralte Aufwertungen").

**Automatic snapping in the full tour** (`tourAutoSnap`): after reading, the boxes read
with high confidence (≥ 0.9, up to 12) are models, every other box is snapped to its own
cell frame (`renderer/stash/frame-snap.js`, the align tool's logic moved into a shared
module), the tab is read again with the new positions, and they are saved only if that
read is not worse (same or more counts; counts read before not less sure). The trial
positions are handed to the reader synchronously and restored at once, so a config save
during the read cannot write them. The dialog says what happened ("12 boxes snapped
automatically, 48 instead of 46 counts read - kept" / "discarded" / "no model").
**Needs the real game to test** - the headless tests cover the shared snapping module
(same results as before in the align tool) and the dialog, not the full read-compare
cycle.

**Export settings** (next to the tour buttons): alignment and per-slot reader settings,
calibration, hi-res switch, learned tab fingerprints and learned digit templates into
the support folder as `einstellungen.json` (+ `learned-digit-templates.json`), folder
opens - meant for turning a well-tested setup into defaults for others.

### 4.6c Quieter Net Worth cards, fold-all

- "Wrong tab? / Align / Debug" on each tab card stay faint (18 %) until the card is
  hovered; a debug that is on stays visible.
- A small floating "⇕" (bottom right) on Currency and Net Worth collapses / expands
  everything at once (Currency: saved with the buckets).

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

### 4.7b Calibration from the currency tab's cells

With a controller UI the stash panel has no coloured border, so the calibration's
snap-to-border has nothing to hold on to and the box is only as exact as the drag -
several px different per player, enough at 1080p for the boxes to sit half in the
neighbour cell (reported). Now the dragged box is only a starting point: on confirm,
`cell-calibrate.js` looks for the inner frame corner of every currency-tab cell
(`frame-snap.js` innerCorners, as the align tool's "Nach Regel") and fits one scale +
position to them (least squares; near cells first, then farther ones, dropping any > 2
reference px off). The result is the calibration box; the test read follows at once and
its notice says how the box was measured and whether the read looks right (> 30 % of the
read slots unsure -> "calibrate again, or correct with Align").
- **Reference:** `currency-cells.js`, 38 inner corners in reference coordinates, measured
  on a real 5K capture. They agree with `currency-tab-map.js` (count centres = corner +
  (25.8, 12.1) within +-0.6 ref px) and with a hand-aligned setup (boxes = corner + the
  5/6 px rule within +-1 ref px), so the tab maps stay valid.
- **Measured** (the 5K currency picture, and scaled to 1080p / 1440p size): 37 of 38
  cells, box exact to <= 1 px; a rough box off by up to 60 px (5K) and 8 % in size still
  lands on the same box, 0.6 s at 5K, < 0.1 s at 1080p. The player's own screenshot of
  the currency tab in controller mode: 37 of 38, rms 0.17 ref px. Other tabs (11 tested)
  are rejected (at most 15 of 38 cells "fit" a runes/essence grid; 60 % needed) - the
  dragged box is kept and the notice asks for the currency tab.
- Calibration hint text: open the currency tab, a rough box is enough.
- **Not yet tested in game.**
- **Tested in game** (5K, controller mode): the boxes sat on every count right after it.

**Fully automatic ("Kalibrieren").** The calibration window opens only when needed:
`cell-calibrate.js search` looks for the currency tab on the screenshot - first where the
last calibration and the coloured border say (instant when the stash has not moved),
then everywhere: the capture shrunk to 1080 px high, every inner-corner-like spot found
once (running sums, one pass), and for UI scales 0.6-1.5 each spot votes for where the
panel would be if it were one of the 38 currency corners (votes counted with the 8
neighbouring bins). The best few places are checked by the exact fit above, which alone
decides. Found: saved, no window, test read, "calibrated automatically (37 of 38 cells)".
Not found: the window opens as before and says why. "Set the box by hand" opens the
window directly.
- **Measured** on composites (the currency picture pasted into 5K / 4K / 1440p / 1080p
  screens at keyboard and controller positions and UI 70-100 %, a runes panel beside it):
  all found, box exact to 1 px, 0.3-1.2 s; with no currency tab (runes + essences): not
  found, 0.9 s at 1080p, ~6 s at 5K before the window opens. Two of the player's real
  screenshots (keyboard layout at 2000x878, controller calibration view): found, 36-37 of
  38 cells.

**After the test read:** read fine -> "Scan the other tabs now?" with [Scan tabs] / [Later]
(outside the setup wizard, which has its own next step). The calibration settings are
grouped: Calibrate + Scan tabs; other ways (wizard, box by hand, reset); for support
(tab pictures, export). Tab tour order follows the game: the runes tab's five sub-tabs in
a row, ritual after them (it sat between Kalguur runes and soul cores - out of the runes
tab and back in).

**OCR debug for unread slots.** With a tab's debug on, its unread slots are listed too
and get the 🔍 (images, sliders, live preview). Before, only slots that had read a count
could be opened - reported at 1080p with 5K-tuned per-slot filters: nothing was read, so
nothing could be picked to tune.

**Fixed: nothing read at reference scale with aligned boxes** (1080p, reported: every slot
"leer?", and the debug view stayed at "…"). The align tool saves fractional strips
(21.94 x 9.65 reference px - the 125x55 px rule at 5K). At reference scale the reader
crops the frame directly and `crop()` took those coordinates unrounded: fractional array
indexes, every pixel `undefined`, an empty cell (the debug view's image then failed on a
43.88 px wide bitmap). Scaled captures round before cropping, so 5K was never affected.
`crop()` now rounds. Measured on the currency picture scaled to 1080p with the player's
5K boxes: 0 of 12 read before, 12 of 12 read after (counts depend on the filters). The
debug view now shows the error instead of a bare "…".

**Faster reads at 5K** (reported: a 1080p scan is done in 1-2 s, 5K with high resolution
takes long). Measured on the player's 5K currency tab with their per-slot filters:
- 17 s: every distinct per-slot filter setting rebuilt the pixel channel over the whole
  15-megapixel frame. Now, where slots are read from the native frame (5K/4K and
  near-1 setups), each slot's channel is built from a window around it only - the same
  cut the OCR debug preview already used (`RP.cropAroundSlot`) -> 7.6 s, identical reads.
- The rest was the per-slot threshold sweep at matching scale 2 (0.3-0.7 s a slot). Slots
  are independent, so they are split over helper threads (cores - 2, at most 6) that
  read the same frame from shared memory with the same code (`readOneSlot`) -> 4.2 s on
  a 4-core test machine (2 helpers), identical reads (38 of 38 records byte-equal);
  without per-slot filters 2.0 -> 1.2 s. If a helper fails, the slots are read on the
  one thread as before.

**Boxes onto the cells automatically.** Reported at 1080p: tabs other than currency
still had the shipped boxes, half on the cell frame. Now the first scan of a tab without
own positions (normal scan or the tab tour) places its boxes by the fixed rule
(`ruleProposal` in main.js - the align tool's "Nach Regel" logic: inner frame corner +
5/6 px, 125x55 at 5K, scaled), reads the frame again and keeps them only if the read is
not worse (`trialDeltas`, shared with the tour's model snapping, which stays as the
fallback). The notice says so ("Essenzen: Kästchen automatisch an die Zellen gesetzt").
Tested on the essence picture at 5K and scaled to 1080p: 82 of 82 cells found, reads
43 -> 45 of 82 at 1080p (a scaled picture is blurrier than the game's own 1080p text, so
the values there say little). **Not yet tested in game.**

**"Kalibrierung & Fächer zurücksetzen"** (settings, other ways): calibration, all box
positions and per-slot filters, and the learned tab fingerprints back to the start - two
clicks, and a backup of all of it goes to the support folder first
(`einstellungen-sicherung-<time>.json`). The tab tour's saved pictures are moved into
`tab-shots/sicherung-<time>/` as well - after a reset the tour showed every tab as done.

**Calibrating from the settings:** the settings close, the Net Worth view says what is
happening ("looking for the currency tab ..."), then the result and the offer to scan the
other tabs. If the calibration window has to open it says so, and cancelling it says
"nothing changed". Before, the result appeared behind the open settings (reported: waited,
not knowing it was done).

**Learning a count that "cannot be learned"** (reported at 1080p: a clean 7 that would
not go in). Teaching cuts one piece per digit from the black/white cell and refuses when
the number of pieces differs from the digits typed. It now tries, in order: plain pieces;
with diagonal neighbours joined (a thin stroke at 1080p touches only corner to corner and
fell apart - `components(bin, S, eight)`); without pieces under 70 % of the tallest (a
speck or item art beside the count). On the currency picture scaled to 1080p: 4 of 10
counts could not be taught before, 1 after. The learn result now stays in the debug
panel (it vanished with the re-render the learn itself triggers), with the error if any.

**Tour messages and the "not worse" check** (reported at 1080p: "no count sure enough
to snap to" on currency and abyss with 38/12 counts read; essence stayed on the shipped
boxes). The rule placement WAS kept there - the dialog only looked at the model count
(0 when the rule did the job). It now says "boxes placed onto the cells by the rule (x of
y): a instead of b counts read surely - kept", or that the rule was tried and discarded,
then what the model snapping did. And both compare SURE reads (>= 80 %) instead of all
reads: unsure "counts" are mostly item art in empty cells, which boxes on the right spot
drop - counting every read called the better boxes worse (essence: 54 -> 46).
(The rule result also has to reach the dialog: `stripAuto` passed only the model
fields, so the first version of this still said "no count sure enough".)

**Read filters shipped per resolution** (`renderer/stash/slot-defaults.js`). The per-slot
filters that make a count readable depend on how big the digits are drawn, and a 5K
player's tuning wiped out 1080p digits. Now, where a slot has no filter of its own:
- 4K/5K (panel read per cell, > 1.5x): the per-slot filters a player tuned on 5120x2880
  for the currency and runes tabs (107 slots);
- 1080p-sized panels (0.85-1.15x): that player's 1080p export - colour limit 5, specks
  under 12 px for the whole currency tab.
The player's own values always win, value by value; positions and matchScale are not
part of it. The same merge runs in the reader, the OCR debug preview and teaching.
Measured: with the player's 5K box positions and only the shipped filters, the 5K
currency read is identical to their own full settings (38 of 38 records).

**Tested on real 1080p and 1440p support pictures** (all 12 tabs each, from the player).
- Calibration from the cells: the saved box found again to the pixel at both sizes
  (0.2-0.3 s).
- Rule placement: at 1080p the runes tab lost five cells - the tab map's lesser column
  next to the gap between blocks is 22 px off, the per-cell range is ~10.5 reference px.
  A wider range for every cell cost cells elsewhere (essence at 1440p 82 -> 79), so cells
  not found get a second, wider search (16 reference px) whose find only counts if it is
  no other cell's and sits in line with its row (`innerCorners`). Now every cell of every
  tab is found at 1080p and 1440p, except slots where the map has no cell (ritual "Call of
  the Shadows", Kalguur "Aldur's Legacy"); the 5K pictures and the calibration search give
  the same results as before.
- Read filters for 1440p-sized panels (1.15-1.5x, `slot-defaults.js` 'mid'): the player's
  2560x1440 export (currency, runes, ritual, abyss). With their box positions and only the
  shipped filters, reads are identical to their own full settings (currency 38/38, ritual
  31/31, abyss 21/21).

**Guides and small fixes after a full 1080p/1440p setup run** (reported):
- OCR debug panel: a folded guide above the sliders (colour limit down, then specks /
  brightness / contrast, floor / local threshold, save / apply to tab, teaching, forget
  template). README: a short "setting it up" section. Align tool help: "the quickest way"
  (mark all, clear models, G, R/S for drift, save).
- Teaching a right-but-unsure read now works below **85 %** (was 75 %): reads between 75
  and 85 % could not be taught, and getting a digit in often meant deleting templates.
- Align tool: a slot whose override held only read filters (no position - "apply to
  whole tab" on a slot never aligned) got NaN coordinates: a box stuck at the left edge
  that could not be dragged, fixable only with "column". Now the map's spot is used.

**Measured cell corners in every tab map** (`CELL_CORNERS`, as a safeguard for other
setups). The tab maps place their slots at count centres, which sit a different distance
from the cell per column and digit count (up to 22 px at 1080p on runes). The automatic
box placement therefore had to search wide, and wide searches sometimes took a
neighbour's frame edge: runes at 1080p, the abyss omen row at 1440p (thin 2 px frames,
cells almost touching). Now each map carries the inner corner of every slot's cell,
measured on the player's 1080p and 1440p captures (both calibrated from the currency
cells; they agree within ~1 reference px). Two corners measured wrong at both sizes the
same way (abyss "Omen of the Liege", ritual "secret compartments" / "reinforcements") were
set from their row's pitch and confirmed: searched from there, both sizes find them within
0.3 px. `ruleProposal` starts from these corners and searches only 4 reference px around
them (one shift for the whole tab first, up to 25); slots without a corner (no cell there)
keep the old way. Result on all pictures (1080p, 1440p, 5K, 12 tabs each): every cell
found, none more than 2.5 reference px from its measured corner.
(Tried first and dropped: requiring a near-black line behind the frame - at 1080p that
line is often 1 px and not black, and half the cells were lost.)
The count centres (`STATIC_SLOTS`) are unchanged, so shipped reads without placement stay
as they were.

**Taught digits no longer push each other out** (reported: currency tuned to > 80 %, then
ritual taught - currency dropped again; abyss added - everything ~70 %, "not enough room
to teach all the different ones").
- The bank held ONE learned template per digit: the median of all exemplars (up to 30).
  Teaching a 4 in the ritual tab (other background, other filters -> a differently shaped
  glyph) shifted that median, and the currency 4 matched worse. Now the exemplars form up
  to 4 extra templates per digit, one per glyph size (the median of each size group),
  on top of the overall median (`learnedVariants` in read-pipeline.js). Exemplars per
  digit: 60 (was 30).
- The template key pool (`ALT_POOL`) had 100 keys; the shipped variants use 60, and
  anything past 100 was dropped without a word - the player's 5K set already came to 101
  at matching scale 2. Now 164.
- Measured on the 5K currency picture with the player's learned file: 38/38 read, one
  count fixed (269 was read 69), average confidence 88.3 -> 88.6 %, sure reads (>= 80 %)
  32 -> 32; single slots move a few points either way (the adaptive threshold can pick
  another floor when there are more templates).

**Tab tour reads land in the Net Worth list** (reported: after "scan tabs" none of the
tabs was in the list; each had to be scanned again). The tour reads every tab anyway;
its result now goes through the same pricing as a scan (`stashResultWithPrices`, split
out of `readStashFrame`) and is sent to the list like one (`publishTourRead`) - after the
automatic box placement, so the list shows the better read.

**Second opinion on prices: poe.ninja** (`ninja-feed.js`; reported: Orb of Transmutation
0.85 Ex in the app, 2.40 in game). poe.ninja's PoE2 exchange overview
(`/poe2/api/economy/exchange/current/overview?league=…&type=…`, no auth, built from GGG's
Currency Exchange) uses the same item ids as poe2scout and this app. It is fetched every
15 minutes for 12 categories (~510 items in Forbidden Rites) and becomes one more price
source: listed with the others in the price tooltip, and where it has at least 1 Divine
of volume behind an item and the price is more than 1.5x off it, its price is taken
(marked ≈, "price from poe.ninja - the feed said …"). Looser than the 3x outlier rule on
purpose - the transmutation case is 1.8x (poe.ninja: 1.51 Ex on 13 Div volume). Items
poe.ninja trades thinly (under 1 Div) are left alone. The player's own price still wins.
Config `ninjaCheck` (default on).
**Corrected the same day** (the player's screenshot of the in-game exchange: "2.40 : 1"
means 2.4 transmutations per Exalted = 0.42 Ex, not 2.40 Ex): poe.ninja's 1.51 Ex was
the WRONG direction - it values cheap items via the currency they trade most against,
here Divine, a detour far above their price (the warning in `priceRefs` above). GGG's
own direct rate against Exalted said 0.34 Ex on 2126 units - it was already there, but
only used at 3x off (0.85 vs 0.34 is 2.5x). Now:
- a direct Exalted rate with at least 50 units traded (`CX_TRUST_UNITS`) replaces a feed
  price already 1.5x off;
- poe.ninja replaces a price only where its own value is direct against Exalted
  (`maxVolumeCurrency`), never after the exchange's direct rate was taken; otherwise it
  is a listed source only.
Live check (Forbidden Rites): transmute 0.85 -> 0.34 (exchange), breach splinter 9 -> 3.03
(exchange; poe.ninja 3.69), alch 3.0 / chance 9.5 / greater transmutation 0.90 unchanged
(sources within 1.5x).

**"Leave out" with one click** (`skip-groups.js` `quickSkip`; asked for: building a list in
the settings first is a detour when a scan shows one thing that plainly should not count).
⊘ on a Net Worth line (shown on hover) puts the item into a "Nicht mitzählen" list right
there: with no list yet, one named "Aussortiert" is made, switched on, and the item goes
in; with exactly one list that is on, straight in; otherwise a small menu picks the list
(an off list is marked "still counts"). The ⊘ tag of a line already left out takes it
back out on a click. Same config as before (`stashSkipGroups`).

**Price check: an item that cannot be read says so** (reported: Trephina failed and the
overlay showed nothing at all). The parse-error notice only rendered inside an item's
panel; with no item open there was none, and with one open the old item's result stayed
as if it were the answer. Now a card on top names the item, the error and offers "copy
item text"; the view goes back to the landing page. A trade search the site rejects with "Unknown
item ..." (400) gets the same card ("the trade site does not know this item") - that is a
data bug, not a network hiccup. Each failed item is also appended
to `item-parse-errors.log` in the support folder.

**Price check: the same item again shows the saved result for 3 hours** (asked for:
checking an item a second time cost another trade search). `item-tab.js` `autoSearch`:
an item with the same base and every mod at the same value (`itemSig`, now stored with
each Recent-searches entry) found in the history within 3 h opens that entry - the
notice says how old it is, "Search" runs it live. Older entries (no signature) are not
used.

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

### 4.9 Currency tab: rate editor and pinned route window

- **Pinned tooltip no longer closes under you.** Clicking into a field of "Kurs
  fixieren" released the pinned tooltip (every click inside it counted as "click again
  to release"), and saving re-rendered the list, which threw the tooltip away - so there
  was no visible result either. Now clicks inside the editor never release it, and a
  save rebuilds only the tooltip; the list behind catches up when the pin is released.
- **Enter it the way the game shows it.** Each leg has two boxes, both sides ≥ 1 like the
  game and the bucket row's editor ("22.5 A = 1 B"), or "22.5:1" in one box - no more
  "1 Chaos = 0.0444". Labels keep the tier ("gr. chaos" instead of a second "chaos").
- **Feedback per leg:** "✓ übernommen", your rate with its age and the value the app
  computes from it, the feed's rate for comparison, or why an entry was not taken.
  ✕ (or both boxes empty + Enter) deletes your rate. Rates were and are stored in the
  config (`overrides.rates` + `ratesAt`) - they survive closing the overlay and restarts
  (unchanged; confirmed from the code path, not a behaviour change).
- **📌 pinned route window** (`renderer/route-pin.html/.css/.js`, `route-pin-preload.js`):
  the route in its own small always-on-top window that stays up while the overlay is
  closed, rate editor always open. It only displays: the overlay renderer computes the
  content (it holds rates and routes) and main relays it; entries come back as actions.
  Focus and caret survive content updates while typing.
- **German route texts rewritten** without "Cross", "Loop", "Slippage": "Tauschrunde:
  +8,2 % Gewinn pro Runde", "im direkten Tausch … laut Marktwert …", plus a **"Warum:"**
  sentence saying why the route exists (item cheaper/dearer on the direct pair than its
  market value, back via which currency). English gets the same "Why" line.
- **Every way to get the base currency**, cheapest first, with its cost in Ex per unit
  (★ cheapest, ✎ uses your rate); each gets a line in the rate editor. With your own
  rates in play, a verdict: "still the cheapest" or "now going via Divine is cheaper
  than via Exalted (6.3 % less)" (feed costs within 0.5 % count as a tie).
- **Vendor splits in arbitrage** (Settings → Currency, **off by default**; config
  `arbVendorSplit`). A vendor splits a higher tier into 3 of the tier below, free -
  never upwards (Perfect → 3 Greater → 3 normal; transmutation, augmentation, regal,
  exalted, chaos). With it on, a bucket row also looks for split routes: buy the item on
  the direct pair and split it (a Greater Chaos cheaper than 3 Chaos), sell the split
  lower tier back if it is not the base, or split the base into the item. The row's
  column shows the better of market and split route, a split route marked ⚒, with its
  own "Why" line; the split leg costs no gold in the estimate and is left out of the
  thinnest-leg check and the rate editor. Buying a higher tier and splitting it also
  appears as a way to get the base (cheapest major per tier, never paid with the base
  itself). Tested headless: Greater Chaos at 2.8 Chaos → +7.1 % ⚒ (market route alone
  +5.5 %); at 3.1 no split route, the market one is shown.
- Fixed on the way (German client): the route subline and the "thinnest leg" note showed
  no currency names - `abbr()` only knows English names; the full name is used now.
  The tooltip is capped at the window height and scrolls, since a route with every
  acquisition way and the editor can be taller than the overlay.
- Reported after the first round, fixed: emptying the size box while typing set the
  size to 0, and every rebuild after that dropped the size row - for all routes, with
  no way back in. An empty box now leaves the size alone; Enter takes the number. The
  rate editor in the 📌 window was always open and pushed the size out of reach - it is
  folded now and opens/closes with its "fix rate" button (also for recipe cards).
- Tested headless: an arbitrage row pinned, a click into a field keeps it open, Enter
  saves (config written, tooltip stays, "✓ saved" shown), "22,5:1" parsed, invalid input
  rejected with a message, ✕ clears, 📌 sends the route with the editor; the window page
  renders it, keeps a half-typed value across an update and sends the rate back.
  **Not yet tested in the real Electron app/game** (window placement, focus, always-on-top).

### 4.10 Recipes tab

Is it worth buying the parts, combining (or splitting at a vendor) and selling?
`renderer/recipes/recipes-data.js` (the recipes, shared by main and renderer) and
`renderer/recipes/recipes-tab.js` (the tab). Hideable like the other optional tabs.

- **Recipes:** combine - Origin Cradle + Origin Spark = Origin Core; split at a vendor -
  Perfect → 3 Greater and Greater → 3 normal for transmutation, augmentation, regal,
  exalted, chaos (the same tier list the currency arbitrage's vendor splits use; it moved
  into recipes-data.js). A new idea is one more entry in `COMBINES`.
- **Overview** sorted by profit per round, grouped; **card** per recipe: every part with
  its rate against the recipe's currency (ex / chaos / div, switchable and remembered),
  source mark (✎ your rate, ⚠ probably stale, ≈ from market values), traded volume per
  hour, and the 7-day change from the feed ("↗ +12 % · near 7-day high" - a trend, not a
  forecast). **Rounds** box: profit per round and in total, Ange's gold fee (per bought
  part and per unit received on the sale), the thinnest step against what you need.
- Rates are the Currency tab's: same overrides, same editor ("Kurs fixieren", two boxes
  like the game), same 📌 window (the card with the editor always open; the rounds box
  works there too). A rate set here applies everywhere and vice versa.
- Main now also loads the `fragments` category and ships the pairs of every recipe item
  (`fetchPrices`).
- Checked against live data (Forbidden Rites): Core 5198 Ex vs Cradle 2014 + Spark 2696
  = 4710 Ex, about +10 %. Tested headless with those numbers in divine: +1.00 div
  (+10.5 %) per round, 10 rounds +10 div and 15k gold; own rate "1 Spark = 5 div" →
  +15.4 %; split card and 📌 window render. **Not yet tested in the real app.**
### 4.11 Swap tab ("Tauschen")

Asked for: "I need Divine and have lots of Chaos - do I buy Exalted with Chaos and then
Divine? Thinking around three corners breaks me." `renderer/swap/swap-tab.js`: pick
"I have" / "I want", and "I need N" or "I spend N". The tab lists the direct trade and
every way through one major (Exalted, Chaos, Divine, Annulment), cheapest first (★),
each as the trades to make in game - how much to give, how much comes out, the rate the
way the game shows it (`legStr`), gold (Ange's fee per item received) - and how much
cheaper or dearer than direct. Priced with the Currency tab's own functions (your fixed
rates, then live, then GGG's exchange); ✎ = your rate, ⚠ = rate not current, "low
volume" when the amount is over a quarter of what traded in the last hour. You hand
over whole orbs, so the start amount is rounded up. Checked with the player's
screenshot rates (1 Chaos = 70.9 Ex, 1 Div = 532 Ex, direct 8.21 Chaos per Div):
via Exalted 7.50 Chaos per Div, 8.6 % cheaper, for 10 Div 7 Chaos saved - the same as
by hand. Hideable like Recipes (`showSwapTab`).
**Item -> Swap tab** (Settings → General, keyboard hotkey `swapHotkey` and controller action
`swapItem`, both unbound by default): hover a currency in game, press - the item is copied
(the price check's Ctrl+C, one per press) and, if the exchange trades it, the Swap tab
opens with it as "I have" and its stack size as "I spend" (German "Stapelgröße: 1.234/5000"
-> 1234). On any other item nothing happens and the overlay stays shut. Its own action on
purpose: on a controller the cursor always rests on a stash cell, so sharing the stash
scan's button would open the Swap tab on every scan.
**PS alone next to PS combos** (reported: PS and the mic button are the only buttons the
game ignores, so "PS + Mute" is the one free combo - while PS alone opens the price
check): PS alone fired the moment PS went down, so every PS combo also fired it. When
some binding is a combo containing PS, a PS-alone binding now fires on PS RELEASE, and
only if no other button was pressed meanwhile (`gamepad.js` got `onButtonUp`). Checked
with synthetic DualSense reports against the real dispatcher: PS -> price check,
PS + Mute -> Swap only, Mute -> stash scan; without a PS combo PS fires at once as before.
### 4.12 Fragment tab (sub-tab "Fragmente")

Asked for: the Fragment stash tab (patch 0.5) was not supported. `renderer/stash/
fragment-tab-map.js`, 20 slots: the three Crisis Fragments, Breach Splinter and
Breachstone, Origin Spark and Origin Cradle, Breachlord Sac, Shattered Triskelion and The
Triskelion Reforged, An Audience with the King, Head of the King, Call of the Shadows,
Simulacrum Splinter, Simulacrum, Raven's Reflection, Kulemak's Invitation and the Deadly /
Cowardly / Victorious Fate. Identities from the player's tooltips and item texts plus the
item art of the empty cells; positions measured on a screenshot (see the file's header).
Registered like every tab (main.js `TAB_MAPS`, reader-worker `TABS`, Net Worth label, last
stop of "scan tabs"). No shipped detection template: the tab tour (or "Wrong tab?") learns
its fingerprint on the first capture, the first scan places the boxes on the cells.
**Not yet tested on a real capture of the tab.**

Fixed after it shipped: 12 of its items also sit in another tab (breach splinter,
breachstone and breachlord sac in Breach; simulacrum, its splinter and Raven's Reflection
in Delirium; the Triskelions in Expedition; Kulemak's Invitation in Abyss; the three
King's items in Ritual). The slot tools looked an item up by name only, in whichever tab
was captured first - reported: the ritual row's "An Audience with the King ×2" showed the
fragment tab's picture with a 4, and ✓ / "learn" / a typed count would have taught that
4 as a 2. Preview, teach and "save settings" now take the row's tab (`findTabSlot(apiId,
tab)`; the panel caches key on tab + item). Tested in the browser with the same item in
two tabs: each row's calls carry its own tab.

### 4.13 Tab builder ("Neues Fach anlegen")

Asked for: a new stash tab should not have to wait for a release ("then 300 issues because
the calibration is off"). Settings → Net Worth → "Eigene Fächer" → **"+ Neues Fach anlegen"**
with the tab open in game:
- the app takes a picture and **finds the cells itself** (`renderer/stash/cell-finder.js`:
  dark areas on the parchment, at least 0.6 of a small cell each way, reading order;
  a second, looser pass for OWNED cells whose item art makes them too bright). Measured:
  Fragment tab screenshot 20/20 cells within 3.3 reference px of the hand measurement;
  real 1080p captures - currency 38/38, breach 29/29, ritual 29/30, essence 62/82 (the
  20 missing are the column of perfect essences, all owned and bright);
- `renderer/stash/builder.html/.js/.css`: the cells numbered on the picture; click one,
  type a few letters, pick the item from the list (the client's own names via
  game-names.js, English below, with icons), Enter = first match; it moves on to the next
  unnamed cell. "+ Zelle" adds a missed cell with a click, Entf removes one; unnamed cells
  are simply not saved;
- **"Speichern & paaren"** stores the tab (`config.stashUserTabMaps`, key `user-<name>`,
  cells in reference coordinates), learns its fingerprint from this picture (like the
  tour's "yes, this is that tab"), reads it and places the boxes by rule - the tour's own
  path (`tourAutoSnap`, `tourKeep`). From then on the scan key reads it.
- The tab joins everything else: `TAB_MAPS` in main.js is a proxy over the shipped maps
  plus `renderer/stash/user-tab-maps.js`; the reader thread gets the definitions with
  every read; Net Worth adds them to its tab names, so they are in the tour and in
  "Wrong tab?". Edit (tab open in game), **Export** (a file for the support folder, to be
  shipped for everyone) and Delete per tab.
Tested: the cell finder on the captures above, the window with the Fragment screenshot
(20 cells shown, German search "krisen" -> the three Crisis Fragments, Enter names and
moves on, save sends the named cells). **Not yet run in the Electron app / in game.**
### 4.14 Unsure numbers: checked right after the scan

Reported: after adding a tab everything sat right, but the Breach Splinter count was read
unsure - and that only shows with the OCR debug switched on: switch on, rescan, check,
switch off again. A number the reader does not know yet (a count that grew a digit) went
by unnoticed. Now every scan (scan key, tour, tab builder) lists its unsure numbers (under
the teach limit, 85 %) in a notice - "2 unsure in Fragments: Breach Splinter 62 %, ..." -
with **[Check now] [Later]**. Check now opens a bar on that tab that goes through them one
by one: the debug panel of that number (pictures, filters, "learn from this image"), the
confidence and ✓ - without the debug switch (`dbgActive` in networth-ui.js: the switch OR
a running check). **Done** closes it. With percentages hidden, an unsure number carries a
small "?" (red under 65 %) that opens the check for just that one. Tested in the browser
with a mocked scan (notice, bar, picture requested per number, next / done).
The number being checked is moved right under the bar (with its panel) until Done -
reported: the bar sits at the top, the item could be far down the list. A ✓ that cannot
teach (the black/white picture does not split into one part per digit) now says why in
the bar instead of only turning into a "!", and the bar says it is on purpose: nudge the
filters until each digit stands whole and alone, then again.

### 4.15 Net Worth values in Ex / Div / Chaos

Asked for: Divine next to Exalted in every line, and a choice - "some want only Ex, or
Chaos, I want all three". Settings → Net Worth → "Show values in: Exalted / Divine /
Chaos", any of them, at least one (`stashUnits`, default Exalted + Divine as before).
Lines, tab totals and the grand total show the picked ones in that order; a currency
without a known rate is left out. Scans now carry the Chaos price too (`chaosPrice`).
Numbers on Net Worth and the Swap tab follow the UI language (asked for: German "1.596 ex
· 3,0 div" instead of "1,596 ex · 3.0 div"; English stays as it was). A typed price
"1.000,5" reads as 1000.5. In the lines each currency is its own right-aligned column (Ex under Ex,
Div under Div - asked for), tabular figures.
### 4.16 Tab card: tools behind ⚙, unknown tabs asked right away

Asked for: "Wrong tab?" and "Align" in every card header are rarely needed now. They sit
behind one ⚙ on the card (with Debug when the debug switch is on); "Align" is also in the
unsure-numbers notice and in the check bar. A scan of a tab the reader does not know no
longer just says so: its picture is kept ("__unknown") and the notice asks "Which tab is
this?" - picking one pairs it from that picture (stash-correct-tab, like the tour) and
reads it; "+ New tab" opens the tab builder on the same picture. Tested in the browser
(⚙ menu, align call, unknown scan -> pick -> paired and listed).
The header reads title | total | ⚙ | ✕: the ⚙ sits at the far right, and the tab total is
drawn as fixed-width columns (Ex 96px, Div/Chaos 58px, tabular digits), so Ex lines up
under Ex and Div under Div across all cards instead of the ⚙ drifting with the total's width.
A tab recognised only NARROWLY is asked about: measured on the player's 1080p captures
with the shipped fingerprints, correct tabs led the runner-up by 0.20-0.65, the two
misreads (Kalguur runes and soul cores taken for Ancient Augments) by 0.08 and 0.21. Under
0.25 the scan asks "Recognised narrowly: X - Y looked almost the same. Is it X?"; yes
teaches X's fingerprint from this picture (the question does not come back), no opens the
card's tab picker. The scan result now carries `detect` for this.

### 4.17 Faster count reading (essence tab 22 s -> 3 s at 5K)

Reported: the essence tab took long. Measured at 5K (high-res on): currency 4.8 s,
essence 22 s. Essence slots have no shipped 5K filters, so all 82 run the full 8-floor
sweep, and 93 % of the time was the template slide (`slideMatch` in digit-reader.js).
It now takes the window's ink from a summed-area table of the strip (a blank window is
dropped without being read) and counts the overlap over the template's ink pixels only.
Exact, not an approximation (0/1 masks: IoU = inter / (templateInk + winInk - inter)):
all 1706 reads over every capture we hold (1080p + 1440p, every tab, high-res on and
off, 5K currency x2 and essence) came back identical, count and confidence. Times:
5K essence 22.1 -> 3.2 s, 5K currency 4.8 -> 1.1 s, 1440p essence 3.9 -> 0.75 s,
1080p essence 2.3 -> 0.54 s; the OCR debug preview and teaching use the same code.

### 4.18 A scan shows that it landed

Asked for: with the faster reader (4.17) a scan is quick and quiet - the fans spinning
up used to be the only sign - so on a tab-by-tab run you could not tell it had landed.
Each card now carries its scan time ("✓ 23:41", full time on hover, kept with the saved
rows), and for 4 s after a scan the header shows a green "✓ Essences · 23:41:05" and
that card's time lights up green. Tested in the browser (four scans, stamp, fade).

### 4.19 Teaching learns from the picture the reader actually used

Reported: a clean "3" could not be taught with ✓, after nudging a slider it suddenly
could, and a digit taught that way was unsure again on the next scan. Cause: the live read
sweeps its black/white floor per cell (readCellAdaptive) and matches at whichever floor
wins, but teaching cut the digits at the slot's saved floor or else the fixed default
(122) - a different picture, often broken into the wrong number of pieces, and when it did
split, a template the live read never sees. `RP.teachCut` (read-pipeline.js) now uses a
floor the player set as is; otherwise the live read's own winning floor first, then the
other sweep floors nearest to it, until the picture splits into one piece per digit.
Measured over the captures we hold (reads at 60 %+ taken as the value to teach):
5K essence 33 -> 45 of 45 teachable, 1080p essence 32 -> 49 of 53, 1080p ritual
12 -> 15 of 19, 1440p essence 34 -> 45 of 45; slots with a fixed floor unchanged. The
learn log names the floor used.

### 4.20 Confirmed counts and "Auto-tune"

Asked for by a player who kept nudging sliders per slot ("a 5 at 90 %, then the next 5
needs the same again") and found re-teaching the same digits over and over pointless.

**Confirmed counts (A).** ✓ on an unsure read, a typed correction and "learn from this
image" also store the count as confirmed for that tab and slot (`stashConfirmed`,
main.js `stash-confirm-count`). While a scan reads that same count there, it is not
listed as unsure, gets no "?" and no ✓ - its percentage shows green with a ✓ ("confirmed
by you"). A different count is checked again. The threshold itself stays: measured on the
player's 1080p captures, real misreads sit at 81-84 % too ("511" for 50, "2117" for
207), so lowering it would let those through unseen.

**Auto-tune (B)** - card ⚙ menu and the check bar ("Automatisch einstellen",
`renderer/stash/auto-tune.js`, worker mode `tune` in reader-worker.js, main.js
`stash-autotune`). On the tab's last capture it tries the read filters against the
counts known to be right (confirmed ones plus reads at 90 %+; at least 3): starting from
the player's own recipe (saturation 200 %, colour limit 5, contrast 75, specks 11 px)
and from the reader's defaults, then one slider at a time over a few stops, twice. A
slot scores its confidence when read right and -0.5 when wrong, so no wrong count can
pay for a higher percentage elsewhere. One setting for the whole tab is saved only if it
beats the tab as it reads now; the weakest slots (up to 10) then get their own search,
with their current settings as the one to beat. The tries run on the helper threads
(slots of one try spread out; the per-slot searches side by side). Saved settings are
backed up for "Undo" (`stashTuneBackup`), then the same picture is re-read. Measured on
the player's real 5K currency capture with their learned digits (every read taken as
known): unsure 10 -> 3, avg 88.6 -> 90.8 %, all 38 counts unchanged - the player's
hand-tuned slots beat any single tab setting there, the gain is in the per-slot search.
On an unlearned upscaled essence capture the filters barely moved the percentage (84.0
vs 83.8 %): there the ceiling is the learned digit shapes, not the filters. About 70 s
on a 4-core test box (2 helper threads); a 6-helper machine is roughly three times
faster. Browser-tested: confirm -> green, same count rescanned -> no question, tune
progress / result / undo.

### 4.21 Guards against teaching a wrong count

Reported: a count read as "6" at 90 % was really "61" - the thin 1 lost - and the player
only noticed right before pressing learn. Three guards, all measured on the captures we
hold (1080p, 1440p, 5K; reads at 85 %+):

- **At the scan: a digit the reader dropped.** `RP.digitsInPicture` counts the number's
  chain of pieces in the black/white picture at the read's own floor: from the left, a
  piece joins when it sits tight to the one before (<= 4 px), is digit-wide (<= 10 px)
  and digit-tall (0.8-1.25 x). Item art beside a short number sits further off or is
  wider/taller. More pieces than digits read -> the read carries `short` and counts as
  unsure whatever its percentage ("Careful: the picture shows 2 digits, 6 was read").
  Every count and percentage stayed identical (1706 reads); the flags found e.g.
  whetstone "1" at 100 % where the other resolution reads 138, chaos 111 vs 1193,
  artificer's 12 at 95 % vs 123, and the ritual omens "1" vs 13 - about 45 flags, 2-3 of
  them doubtful (a crest read 4 at both resolutions).
- **At teaching: more digits than typed.** When that picture shows more digits than the
  value being taught, teaching stops (`more-digits`) instead of searching for a floor
  where the extra one vanishes (which the floor search of 4.19 would otherwise find).
- **At teaching: a digit that looks like another.** Each glyph is compared with the
  SHIPPED digits only (`renderer/stash/learned-audit.js`, independent of anything
  learned): another digit fitting clearly better (+0.08 and 0.6+) stops it
  (`looks-like`, "digit 2 clearly looks like a 4 (74 %), not a 1 (66 %)"). No false
  alarm on any sure read. Both stops un-confirm the count and show why; a second press
  insists (`force`).
- **"Check learned digits"** (settings) runs the same comparison over every learned
  exemplar and removes the suspicious ones on request. On the player's learned file
  (117 digits): one "1" that is plainly a 4.

Auto-tune (4.20) no longer measures against reads flagged `short`.

### 4.22 Auto-tune aims at a clean picture, then learns from it

Reported with pictures after the first version (4.20): on the Abyss tab it turned the
Jawbone's picture dirtier for "96 % -> 96 %". It scored the reader's confidence - but the
confidence belongs to the digits learned so far, from the dirty pictures: the player's
clean "20" (saturation 200, colour limit 5, brightness -20, specks 20) read "0" at 80 %
because only one clean 2 had ever been learned. Now it works the player's way:

- **Clean picture.** Fixed: saturation 200 %, colour limit 5, brightness -20 (the
  player's settings); searched: specks 5-20 px, contrast, floor, a little brightness and
  picture contrast. A slot scores `RP.pictureQuality`: the picture must show exactly the
  digits of the known count (a thin 1 at 1080p that a speck filter eats fails - asked
  for: "eine 1 zu erkennen ist schwer, vor allem bei 1080p"), then 1 minus the ink left
  beside the number relative to the digits' own ink. A change needs a clear gain
  (+0.03 for the tab, +0.06 for a slot's own) - an already clean tab stays untouched.
- **Only where safe.** The tab setting goes to the known counts and to the slots that
  read the SAME count with it (measured: on the 1080p essence tab the setting that cleaned
  all known counts turned other slots' "12" into "2").
- **Then learn** (`teachCount`, with its guards) the known counts not yet read right and
  sure - at most 3 new copies of a digit per run.
- **Then check everything.** New digits change every read: clean thin 1s learned on the
  1440p essence tab made other slots read art edges as 1s ("61" -> "611"). If a slot
  whose settings did not change now reads differently, this run's learning is taken back
  - unless it fills a digit the read had dropped (a "4" whose picture shows 2 digits now
  reading "42", which the other resolution reads too). A slot that reads differently
  with its new settings gets its old ones. If the known counts do not end up better
  (fewer right, or right but less sure), everything goes back.

Also fixed on the way: since 4.12's fix (row tab passed along) teaching failed every
time - the `tab` parameter and the `tab` of the found slot collided ("Cannot access
'tab' before initialization"). Found by running the whole flow offline with the real
`teachCount` on the captures we hold: 1080p currency 10/10 known right, avg 96.4 ->
99.0 %, one dropped digit filled (4 -> 42); 1080p essence and 1440p essence learning
taken back / everything reverted, no count changed; 1440p abyss already clean,
untouched.

### 4.23 Difference picture, starting over with the learned digits

Reported with five pictures: the Jawbone's "20" made perfectly clean by hand still read
at 83 % - "why learn templates when the middle picture already is one?". The percentage
is the pixel agreement with the templates the digits matched - here mostly the SHIPPED
2 and 0 (learned: one of each), drawn from 1080p captures and doubled for 5K, so a
clean 5K glyph can never agree fully with them.

- **Difference picture** (4th picture in the OCR panel, main.js `stash-slot-debug-image`
  `diffUrl`): each read digit's template laid on the black/white picture exactly where it
  matched (`x`/`dy` now travel with the read glyphs) - white = agrees, red = in the
  template but missing, blue = extra, grey = picture outside the digits - with the
  masking right of the number the reader applies. Below it per digit: "2: 82 % against
  the shipped template - 31 red, 12 blue". Checked on the player's 5K currency capture:
  28 of 30 digits give exactly the reader's percentage (white / (white + red + blue));
  the 2 others are ~50 % reads from the reader's grey-tophat fallback, a different
  picture.
- **Reset learned digits** (settings, two clicks): the file goes to a dated backup
  (`learned-digit-templates.backup-*.json`) and is emptied; the shipped digits stay.
  "Restore backup" puts the newest one back. For starting over from clean pictures.
- **Auto-tune** gets the player's second recipe (Jawbone: saturation 100, brightness
  +20, picture contrast 90, colour limit 5, contrast 145, floor 60, specks 12) as a
  second start, and saturation 100/200, brightness up to +20, contrast up to 145 and
  floor 60 as stops.

### 4.24 The player's "Jawbone" setting is the 5K default

Reported after testing it across the hard backgrounds (annulment, fracturing orb,
armourer's scrap, essences): saturation 100 %, brightness +20, picture contrast 90 %,
colour limit 5, contrast 145, floor 60, specks under 12 px is the best everywhere, and on
a perfect essence it turned a read "3" into the real "13". It is now the 'hi' (4K/5K)
fallback in slot-defaults.js (`FILTERS.hi['*']['*']`) for every tab and slot without its
own shipped entry; the shipped per-slot entries (currency, runes) and the player's own
saved settings still win. Measured on the player's real 5K currency capture with their
learned digits, applied to every slot: mean 78.1 -> 80.8 %, unsure 25 -> 23, dropped
digits back (1 -> 51, 1 -> 15, 18 -> 185). 1080p/1440p unchanged (to be tested with
smaller digits). The OCR panel's "Standard" button now sets exactly these shipped values
for the slot instead of the reader's bare defaults.

### 4.25 "Save the digits' edge" (test switch)

The player's idea: the reader should always get the scanned number the way it really
is - freed from the black/white picture, then brought back towards the original ("Bild
freigestellt, dann sukzessive Approximation ans Originale") - and the templates be built
the same way. Demonstrated on their 5K "545" first: the hard cut's digits as the core,
grown into the original's light, nearly colourless pixels connected to them: +21 %
digit pixels, all along the edges, nothing from the icon (the game's dark outline around
every digit is the natural stop).

- `DR.cellBinary` (shared by reader, debug view, teaching): the hard cut as before;
  with `P.growV` set, the NUMBER's pieces (`DR.numberPieces`, the chain rule of 4.21)
  grow up to 2*S+1 px into pixels of `G` = the original's max(R,G,B) where the colour
  spread is <= 60 (`RP.buildChannel` with `grow`) and the value >= 120. Growing from
  every white piece (first try) swelled art remnants beside a "41" or a "1" by 40-80 %;
  from the number only, the largest growth left is the digits' own edge.
- Learned digits of this mode live apart (`learned.grow`, own `byScale`), never mixed
  with hard-cut ones; `RP.buildBank(..., grow)`, teaching, the OCR panel, auto-tune and
  "check learned digits" all follow the switch.
- Setting `stashGrowDigits` (default off): "Ziffern-Rand retten (Test)".
- Measured: off, all 1706 reads identical. On, with no grown digits learned yet, 45 of
  849 reads differ - expected, both sides must be made the same way: after switching on,
  the digits are collected anew (scan + ✓ now; the gallery is the next step).
- Where extraction fails (asked for: "das Bild will ich sehen, wo es nicht mehr klappt"):
  when a digit already touches item art in the HARD cut (1080p/1440p essence and
  delirium, "6", "2") - growing then joins them. That is for the filters (the
  extractor), not the reader: at 5K no digits joined on any capture we hold.

### 4.26 Edge sliders and the digit gallery

**Edge sliders** (asked for: "dafür sollen die Regler sein ... ein Regler Offset, wieviel
weiter raus er wachsen darf ... weiter raus muss man verbieten"): with "save the edge" on,
the OCR panel has three more per-slot sliders - how far the edge may grow (0-4 reference
px, hard cap 4; `growDepth`), from which brightness an original pixel belongs to it
(`growFloor`, default 120) and how coloured it may be (`growSat`, default 60). Saved and
applied to a tab like the other filters; the defaults read exactly as before.

**Digit gallery** ("Ziffern-Tafel", the player's idea: scan the tabs until every digit is
there, approve them once, then those are the templates and the rest is fallback). Every
scan hands over, per read whose picture shows exactly its digits, each digit cut the way
teaching cuts it (grown when the edge switch is on) with the digit the reader saw
(`RP.numberInPicture`); main.js `collectDigits` keeps up to 15 per digit per mode and
resolution in `digit-gallery.json` - counts the player confirmed always, others from
70 % (the gallery shows every digit before it is approved; at the start after a reset
the shipped digits read clean 5K glyphs at ~70 %). The gallery (settings -> learned
digits) shows per digit the glyph that fits the others best (medoid, `LA.maskIoU`),
how many and how well they agree, and flags two digits whose best glyphs look alike
(IoU >= 0.85) - those are not approved. "Approve" makes the medoid and the 4 fitting it
best the learned digits of this mode and resolution (old ones of those digits replaced,
backup first); ✕ drops a digit to collect it anew.
Measured on the player's real 5K currency capture, from a clean start (nothing learned,
edge on): one scan filled all ten digits, correctly labelled, no clash; approved, the
same capture read at 91.6 % mean (today with the old learned digits: 88.6 %), 5 counts
under 85 % (today 10), no dropped digit (today 1: great chaos "4" is now "45"). Caveat:
read from the same capture the gallery came from - the next scan is the real test.

### 4.27 Whole digits in templates, the rescued edge in green, a magnifier

- **Whole digits** (reported with the gallery: "die Rahmen sind zu klein ... die
  Schriften wandern in px hoch und runter"): a learned digit was cut exactly as tall as
  the digit, centred on the strip's middle - a digit sitting a few px higher or lower
  lost its top or bottom (the gallery's 1, 2, 3, 4, 5). `RP.glyphFrame`: still centred on
  the middle (so it lines up at dy=0), but tall enough for the whole digit, and only the
  digit's own pixels. Used by teaching and the gallery. On the player's 5K currency
  capture the gallery's digits now agree 84-88 % (before 82-86 %) and the gallery-read
  mean rose 91.6 -> 92.1 %.
- **Green edge**: with "save the edge" on, the OCR panel's black/white picture shows the
  hard cut white and what the edge rescue brought back from the original green, with
  the pixel count - the rescue sliders can be judged by eye.
- **The freed number on the original** (asked for: "die Ziffer, die freigestellt wurde,
  auf der Original-Ansicht ... um sehen zu können, wo sie sich befindet"): a 5th
  picture - the original's cell, cut and shrunk exactly like the black/white one so they
  line up - with the number's pixels tinted: blue = the hard cut, green = what the edge
  rescue added, red = in the black/white picture but not part of the number (art).
  Order of the pictures (asked for): 1 original, 2 grey, 3 the freed number on the
  original, 4 the black/white picture the reader gets, 5 its comparison with the template.
- **Magnifier** (asked for: "mit einer Lupe am besten"): a click on any of the four
  pictures shows all four big and pixel-sharp, one under the other; a click closes it.

### 4.28 Colours of the debug pictures, "only my own digits"

- **Colours** (reported: "das Rot ist eher Orange"): nativeImage bitmaps are BGRA, the
  synthetic colours of the difference, edge and overlay pictures were written as RGB -
  red and blue swapped (missing showed blue, extra orange, the freed digit yellow instead
  of blue). Now written as B, G, R.
- **Only my own digits** (setting `stashOwnDigitsOnly`, asked for: "einen Schalter, wo
  ich die 69 Vorlagen verstecken kann, denn die 2 wird gerade mit was Schlechterem
  verglichen"): `RP.buildBank(..., ownOnly)` leaves out the shipped templates of every
  digit the player has own ones of at this resolution (gallery or learned); digits without
  own ones keep the shipped, or they could not be read. On the player's 5K currency
  capture after the gallery: no count changed, mean 92.1 -> 92.0 % - the own digits win
  anyway; the switch makes sure a digit is never compared with a worse shipped one.

### 4.29 Extraction fidelity (no templates involved)

Asked for: test where freeing the number from the original stops working, independent of
any template ("die Grenze ausloten"). `RP.originalNumber` frees the number straight from
the original with fixed values, untouched by the sliders - sure digit pixels (bright >=
200, colour spread <= 40), the number's chain of them, grown into the connected light,
nearly colourless pixels (>= 120, spread <= 90). The OCR panel's 6th picture lays the
reader's number (picture 4, after the sliders) on it: white = both, red = the original's
digit has it and the reader's lacks it, blue = the other way round, grey = other ink; above
it "Extraction fidelity 93 % (12 missing, 4 extra)". Measured over the player's 5K currency
capture (38 slots, their own filters then deliberately worse): their "Jawbone" setting
median 92 %, colour limit 60: 94 %, floor 160: 80 %, floor 200: 66 % - raising the floor
thins the digits and the fidelity falls with it. The fixed truth has its own limits (a digit
touching bright art), so a single low slot is worth a look with the magnifier, not a verdict.

Two such limits reported with pictures and fixed: the growth into the digit's soft edge ran
unbounded - from a "7" across a pale skull touching it (7 %, the whole skull "missing") - and
now goes at most 2 px per match scale and never into sure-bright pixels that are not the
number's. And a digit touching a white crystal cannot be freed from the original at all (a
"22" at 49 %, the second 2 all "extra"): when the original frees another digit count than
the reader's picture shows, the line says "unsure" instead of a percentage. On the 5K
capture 5 of the 7 worst values were exactly that case; the medians above are unchanged.

Then a pale skull chunk beside a "7" passed as a second digit (all of it red, the reader
reading only the 7 anyway). The player's idea: "die Geometrie der Freistellung nachfahren
und außenrum wegmachen". The truth now only counts where the reader's number stands - its
digit boxes, 2 px per match scale wider (`RP.truthNearReader`); what the original frees
away from them is shown dim BROWN and not counted (item art, or a whole digit the reader lost -
the measure cannot tell which). Inside the boxes the original still decides which pixels
are digit. "Unsure" is now: a reader digit the original frees less than 30 % of. The
growth steps to side neighbours only (a diagonal slipped through the dark outline). Same
capture: Jawbone median 92 % (5 unsure), colour limit 60: 94 %, floor 160: 81 %, floor
200: 67 % - it still falls the same way when the picture gets worse.

At 1080p the measure hardly worked: a stroke there is 1-2 px, its sure-bright pixels touch
only corner to corner, and the side-neighbour pieces fell apart below digit size - 28 of 38
currency slots and 22 of 44 essence slots of the player's 1080p crops were "unsure". The
sure pixels are now joined 8-connected: 3 and 3 unsure there, ritual and abyss none; on the
5K capture 1 instead of 5, medians unchanged.

Next to it a second value, "Form": the same count, but a red or blue pixel right next to
the other side's digit (1 px) is left out - is the SHAPE right, whatever the edge? A thin
"7" read 76 % with all of its difference on its edge (reported: "Freistell-Treue kann man
immer noch nicht werten"). Form alone cannot find the limit (median 100 % for every setting
on the 5K capture but floor 200: 98 %), the strict value can - so both are shown.

### 4.30 Slot memory: an unchanged picture keeps its confirmed count

The player's idea: "jeder Scan ist die Vorlage" - templates age (new settings, a changed
font), the freed picture of the number itself does not. Every read now hands main the
number's freed picture digit by digit (also unread ones; `pieces`, labelled only where the
read fits it, which the digit gallery still requires). When a count is confirmed (✓,
typed, learned - `stash-confirm-count`), `rememberSlot` keeps that capture's picture of the
slot in `slot-memory.json` (per tab and slot, with its matching resolution and edge-switch
state; only if the picture shows as many digits as the count has). `applySlotMemory`, on
every scan: a slot whose freed picture agrees digit by digit 93 %+ with the kept one IS
that count - the read is replaced if the templates read something else, marked `memo`
("≡" before the percentage, the tooltip says what the templates had read) and not asked
about. A changed picture (the count changed) is read with the templates as before.
Tested with main.js's own functions on the player's 5K currency capture (38 counts
confirmed, 37 pictures kept): with every learned digit deliberately swapped for another,
37 of 38 reads came back wrong without the memory, 1 with it (the slot whose picture
could not be kept); a capture with different counts: no memory hit at all.

### 4.31 Every approved digit its own template; the gallery folds up after approving

Reported: after approving the gallery a clean "1" read at 80 %, picture 5 one red column
along the template. A 1 at 5K is ~4 px wide; half a pixel of shift turns a whole edge
column, and learned digits were bundled into one representative per size group - a
single 1 that fits no particular 1 exactly. Now a digit with up to 8 exemplars uses every
one as its own template (`INDIVIDUAL_MAX`, within the bank's 104 free stand-in
characters); more than 8 keep the size groups. The gallery approves the best 8 (was 5).
Measured on the player's 5K currency capture from a clean start: 92.1 -> 96.0 % mean,
counts under 85 % 6 -> 3 (same capture the gallery came from); their old learned set
88.6 -> 88.7 %. After "Approve" the gallery folds up and the result line stays.

### 4.32 The magnifier follows the sliders

Asked for: "nur Lupe an kann ich Regler nicht nutzen ... Lupe extra Bild und Regler zum
Spielen". The magnifier is no longer a full-screen cover showing the moment it was opened:
it is a floating window - moved by its title bar, resized at its corner, both remembered -
so the sliders stay usable, and it redraws on every preview refresh (every slider move),
including the fidelity line. A panel rebuilt for the same slot keeps it; ✕ or Esc closes it.
(A first docked version could not be closed on the player's machine: its buttons lay over
the window's title bar, an Electron drag region that takes every click whatever lies on
top - the floating one never goes above the title bar and is marked no-drag.)

Then: "die Lupe lässt sich nur im Fenster vom Overlay bewegen". It is now its own window
(main.js `loupe-update`, `renderer/stash/loupe.html`): frameless, always on top, movable
anywhere on any screen and resizable at its edges; place and size are kept
(`stashLoupeBounds`, dropped when that spot no longer lies on a screen). The panel sends it
its pictures on every preview refresh; a window still loading draws the newest ones, not
the first. ✕ or Esc in it closes it. (The floating box
stays as the fallback for a build without the window.)

Also reported: "die Regler haben mal was ausgelöst, jetzt aber nicht". At 5K a preview takes
a moment; with the slider moved on, an older answer arriving after the newer one drew the
old pictures over the new - the slider seemed dead. Every preview now carries a number and
only the answer to the latest one is drawn.

### 4.33 Glyphs filed under the wrong digit never become templates

Found in the player's 1080p currency tab (debug crops): 136 read 131 at 100 %, 168 read 118
at 99 % - every 6 fitted a learned "1" exactly. A wrong read of 70 %+ had handed its digits
to the gallery under the wrong labels, a 6 among the 1s (the tile said "4x, passen 62 %"),
and approving took it with the others. The shipped-digit referee (learned-audit) did not
see it: it slides a template over the glyph and scores only the window it covers, and the
thin 1080p "1" sat inside the 6's left stroke at 0.77 - more than the "6" itself.

- `learned-audit.check` now compares SHAPES: the glyph's ink box area-sampled onto the
  template's ink box, IoU, times how well their width-to-height ratios agree - scale-free,
  so grown and 5K glyphs compare the same. On that tab every one of 69 glyphs scored its
  own digit highest (smallest margin 0.05); the 6 scores 0.72 as 6 and under 0.4 as 1. The
  player's 5K learned set audits as before (the same single suspicious glyph).
- The gallery marks a STRANGER when that referee sees another digit clearly better, or
  when it fits another digit's best glyph clearly better than its own digit's (IoU >=
  0.6 and 0.05 more). Strangers stay visible on the tile ("1 falsch einsortiert (sieht aus
  wie 6)") but are never approved; the best glyph and the agreement leave them out.
  Checked with the 6 put under the 1s, with and without 6s collected: caught both times.
- A read whose count differs from the count the player confirmed for that slot hands
  nothing to the gallery.
- "Gelernte Ziffern prüfen" uses the same referee, so a stranger learned before this
  is found there.

### 4.34 Trade search: no more 1800 s lockouts

Reported: the price search works well, but waits run up to 1800 seconds. That is GGG's
penalty for breaking the search rule "30 per 300 s" (the IP headers read
`5:10:60,15:60:300,30:300:1800`: hits, window, penalty). One price check with the smart
widening is up to 7 searches and 7 fetches, so the budget is small, and trade2.js already
kept below it - but three gaps let it break:

- **The window is longer than the header says.** The trade site shows "5 over 12s",
  "15 over 62s", "30 over 302s" for the 10/60/300 s rules. A hit let go the moment our
  10 s ran out could still count on the server. Windows are now padded by 2 s.
- **Only the Ip rule was read.** `X-Rate-Limit-Rules` can name more ("Ip,Account" once the
  session is logged in); an account rule, its state and its penalty went unseen. Every
  named rule is applied now, the strictest wins, a ban in any of them is honoured.
- **Hits the server counted beyond ours were ignored** - the trade site in a browser,
  another tool on the same IP, this app before a restart. They now count against their own
  window until it has run once (not one shared list stamped "now" - that old backfill made
  a 6 h count look like 32 requests in the last minute).
- The same search again within 2 minutes answers from memory (the log showed one jewel's
  query sent three times in five minutes).

Checked against a simulated trade server (rules as above, windows 2 s longer than their
headers - an assumption taken from the site's own display): 40 searches back to back broke
a rule 7 times before (13 with a stricter account rule, 2 after 13 browser searches in the
last minute), 0 times now in all three cases; 40 searches take about 5.5 minutes, the
budget itself. A fixed 1 s pause per request would not have helped - the 300 s rule is a
count, not a speed.

### 4.35 "Auf der Handelsseite öffnen" on the German site

Reported with the two URLs: the link opened the search, then the site answered "Fehler
beim Laden des Suchstatus. Die Suche ist nicht mehr gültig." and fell back to an empty
search. The search id the API returns is the query itself (gzip + base64url of its JSON),
and our queries carry English names ("type": "Irradiated Tablet") - the only ones the API
parses, but not ones the German site knows. The link now rebuilds the id for a language
site with the base type (or unique name) the fetched listings carry in that language
("Bestrahlte Tafel"); an id that is not such a blob, or no local name, opens on www, where
the English names are valid (main.js `trade-site-url`). Checked by decoding the reported
id and re-encoding it: the same query with only the type translated.

### 4.36 Profiles (save slots) for the reading setup

Asked for before switching from 5K back to 1080p: "bevor ich meine Einstellung wieder
vergeige, erstelle bitte Speicherslots ... am Ende für dich exportieren". Settings → Net
Worth → "Profile (Speicherslots)": a list, a name field, "Speichern unter …", "Laden", ✕,
"Exportieren". A profile (`userData/stash-profiles/<name>/`) holds the whole reading setup:
`stashCalibration`, `stashHiRes`, `stashSlotOverrides` (every slot's position and filters),
`stashGrowDigits`, `stashOwnDigitsOnly`, `stashConfirmed`, `stashTuneBackup`,
`stashUserTabSigs`, plus the learned digits, the digit gallery and the slot memory files,
and the screen size it was made on. Loading one first saves the current state as
"_vor-dem-laden" (one step back, always), then reloads the window. Export opens the
profile's folder (zip it). Checked with a stand-in for the app's paths: two profiles saved
and loaded back and forth, config and files swap, a file absent in a profile is removed.

Export of the ACTIVE profile (✓) also saves the current state into it and writes this
session's last scan of every tab into `scans/`: the panel with a 10 % margin as PNG and a
JSON with screen size, panel box, crop origin, the reads and the confirmed counts - what a
test of the automatic tuning needs to rebuild the frame and know the truth (asked for: "ja,
bau das mit ein"). Another profile's export only opens its folder and says why.

## 5. New config keys

| Key | Default | Meaning |
|---|---|---|
| `gamepadBindings` | `{ repriceRead: 2 }` | Controller button per action |
| `commandHotkeys[].gamepad` | – | Controller button per chat command |
| `stashSlotOverrides[tab][apiId]` | – | Per-slot position (4.5) + reader settings (4.3) |
| `stashShowOcrDebug` | `false` | Debug panel; also gates debug file writes |
| `stashHiRes` | `false` | Global ×2 matching (4K/5K) |
| `stashUserTabSigs` | `{}` | Extra tab-detection fingerprints from "Wrong tab?" |
| `stashShowReliability` | `false` | "Often misread" row tints |
| `stashSkipGroups` | `[]` | "Don't count" lists `[{ id, name, on, items }]` |
| `arbVendorSplit` | `false` | Arbitrage also considers vendor splits (Greater → 3 normal) |
| `stashOwnDigitsOnly` | `false` | Digits with own templates are read against those only |
| `stashGrowDigits` | `false` | Reader and learning grow the digits from the hard cut into the original's edge (own learned set) |
| `stashConfirmed` | `{}` | Per tab and slot: the count the player confirmed; not asked about again while read the same |
| `stashTuneBackup` | `{}` | Per tab: slot settings from before the last auto-tune (Undo) |
| `stashLoupeBounds` | `null` | The OCR magnifier window's last place and size |
| `showSwapTab` | `true` | Swap tab visible |
| `swapHotkey`, `gamepadBindings.swapItem` | `''`, – | Hover a currency, press: Swap tab with it as "I have" |
| `stashUnits` | `['ex', 'div']` | Net Worth values shown in Exalted / Divine / Chaos |
| `stashUserTabMaps` | `{}` | Tabs built with the tab builder: `{ key: { label, created, cells: [{ apiId, x, y, w, h }] } }` |
| `showRecipesTab`, `recipeBases`, `recipeRounds` | `true`, `{}`, `{}` | Recipes tab visible; per-recipe currency and rounds |
| `stashProfileActive` | `null` | Name of the reading-setup profile last saved or loaded |
| `priceOverrides` | `{}` | `apiId → { ex, at }`: the player's own price per unit |
| `gamepadItemBrowse` | `true` | Controller price check: D-pad checks the next item, right stick closes |
| `ninjaCheck` | `true` | poe.ninja as a price source; replaces a price > 1.5× off only when its own value is direct against Exalted (≥ 1 Div volume) |

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
- **Measured on real captures** (the player's 1080p, 1440p and 5K support pictures, all
  12 tabs): cell finding and rule placement, calibration search, shipped per-resolution
  filters, parallel 5K read (identical reads) - see 4.7b.
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
| Reprice 2-frame confirmation | – | `reprice.js`: `prevBase` in `attempt()` |
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

