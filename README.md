<p align="center">
  <img src="docs/icon.png" alt="POE2 Currency Overlay logo" width="128">
</p>

# POE2 Currency Overlay

A hotkey overlay for **Path of Exile 2**: live currency exchange rates and arbitrage, an item price checker, and a Desecrate (Omen of Light) EV calculator. Press a hotkey, it appears over the game; press it again and it's gone.

Windows, built with Electron. It reads public data only — no game memory hooks, no automation, nothing that touches the game client.

**[Download & screenshots →](https://poe2-vibetools.github.io/poe2-currency-overlay/)**

## What it does

### Currency (F6)

- Live exchange rates from GGG's official Currency Exchange data, with the live trade-site order book on top for the pairs on screen.
- **Buckets** — a currency you want to buy, priced in every currency you'd pay with. A green **BEST** badge marks the cheapest way to pay; the other rows show how much more they cost.
- **Arbitrage routes** — a green **arb %** flags a profitable 3-trade loop from that row. Hover for the route step by step, pin it, copy it to chat.
- **7-day sparklines** with hoverable per-day history; type your own rate to override any pair.

### Price Check (Ctrl+F, or Ctrl+Alt+F for a quick check)

- Hover an item in game, press the hotkey, and it's parsed, filtered, and priced against live trade listings.
- Prices the item by its stats, not its exact mod text: fungible added-damage rolls match across elements, resistances fold into a pseudo total, weapons price on total DPS, and catalyst quality and Runic Ward are read correctly.
- Item level, quality and augmentable sockets are header range filters, pre-filled from your item.
- A **suggested floor** anchored on the cheapest genuine comparable (for weapons, scaled by how your DPS compares), so an outlier listing doesn't set your price.
- Hover any result to compare it to your item line by line, with quality, defence, resistance and socket totals beside yours.

### Desecrate — Omen of Light EV

- From a price-checked item with a desecrated mod, click **redesecrate?** in its corner — or paste any item onto the Desecrate tab.
- Pick the mods you'd keep and the worst tier you'd accept; each is weighted by its real spawn chance.
- It prices your item as it stands and with a hit, autofills consumable costs from live rates, and compares the routes (Preserved / Ancient / Altered) to a per-route EV and a plain verdict.

## What this fork adds

Built and tested by one player: German client; 1080p, 1440p and 5K; DualSense and keyboard.
Everything runs on a key press of the player; nothing sends input to the game.
Reasons and measurements for every change: [FORK-CHANGES.md](FORK-CHANGES.md).
German guide: [ANLEITUNG.md](ANLEITUNG.md).

Each area lives mostly in its own files (see "Where things live" in FORK-CHANGES.md), so
it can be taken on its own.

### Net Worth – a stash reader that sets itself up

- **Finds the stash by itself.** One click on *Calibrate* with the currency tab open:
  keyboard or controller UI, wherever the stash sits, 1080p to 5K. Dragging a rough box by
  hand is only the fallback.
- **Guided setup.** Progress on screen, a test read, then "scan the other tabs?". The tab
  tour names the tab to open; the scan key (or a controller button) takes its picture.
- **Box templates per tab, placed automatically.** Every tab map carries measured cell
  corners; the read boxes are set onto each cell's inner frame by a fixed rule. The align
  tool adjusts anything by hand (drag, lasso, row/column, snap to frame, undo, help).
- **See what the reader sees.** The OCR debug panel shows original · reader input ·
  black/white for one slot, with adjustable filters (colour limit, specks, brightness,
  contrast, local threshold), a live "would read", copy/paste and apply-to-tab, and a
  folded guide.
- **Self-learning.** Confirm a right count with ✓ or type the right number: the reader
  learns those digits (per glyph size, so tabs and resolutions do not push each other
  out). Correcting a count teaches it too.
- **Reliable at every size.** Read filters shipped for 1080p, 1440p and 4K/5K; a
  high-resolution switch for 4K/5K; a 5K scan takes about 4 s instead of 17 s.
- **"Don't count" lists.** Leave items out of the total (e.g. lesser runes); switch a list
  on or off at the top. ⊘ on a line puts the item into a list with one click.
- **Prices you can check.** Own price per item; implausible thin-market prices replaced by
  GGG's exchange rate, poe.ninja as a second opinion, all sources on hover.
- "Wrong tab?" correction, the list kept across restarts, reset with backup, support
  pictures and settings export.

### Currency tab

- **Fix a rate** in the arbitrage tooltip, typed the way the game shows it ("22.5 : 1");
  kept across restarts. The pinned tooltip no longer closes while typing (bug fix).
- **Every way to get the base currency**, cheapest first, with cost per unit and a plain
  "why".
- **Vendor splits in the arbitrage loop** (a Greater orb into 3 normal ones at a vendor),
  switchable, off by default.
- **📌 Pin a route**: its own small window that stays open when the overlay closes.

### Recipes tab (new)

Is it worth buying parts, combining them (or splitting at a vendor) and selling? Profit
per round, gold fee, number of rounds, rates shared with the currency tab, pinnable. The
tab can be hidden.

### Controller (DualSense, USB)

Every hotkey action on a button or a combo (PS + L2, the mic mute button too): price
check of the hovered item, stash scan, reprice read, chat commands, "open overlay in
front".

### German client

Price checks for rare tablets, uniques, exceptional items and the renamed runes.

## Net Worth (stash) – setting it up

The quick way, with keyboard or controller UI, at 1080p, 1440p, 4K or 5K:

1. **Calibrate** (Settings → Net Worth → *Calibrate*) with the **currency tab** open in
   game. The app finds the stash on screen by itself from the currency tab's cells and
   reads the tab as a test. If it cannot find it, a window opens to drag a rough box.
2. **Scan the tabs** (*Scan tabs*, offered right after calibrating): open each tab in game
   when asked and take its picture with the scan key. Each tab's boxes are placed onto its
   cells automatically.
3. **Align** only where a count is read wrong: mark all boxes (drag a frame around them),
   clear the models (V), *place by rule* (G), fix a drifted row/column with R / S, save.
4. **OCR debug** for slots that still read wrong (Settings → *Show OCR debug*, then
   *Debug* on the tab and 🔍 on the row) – the panel has a folded guide:
   - colour limit all the way down, then specks / brightness / contrast until only the
     digits are left in the right-hand (black/white) picture;
   - save; *Apply to whole tab* for slots with the same background;
   - teach: ✓ on a right count under 85 %, or type the right number at *Learn from this
     image* (each digit must be one piece in the black/white picture).

Your own settings always win over the shipped ones. *Reset calibration & tabs* starts
over and writes a backup first; learned digits are kept.

## Install

**Most people:** download the installer from the [website](https://poe2-vibetools.github.io/poe2-currency-overlay/) or the [releases page](https://github.com/POE2-VibeTools/poe2-currency-overlay/releases). Windows only. The build is unsigned, so if SmartScreen appears, choose **More info → Run anyway**.

**From source:**

```bash
git clone https://github.com/POE2-VibeTools/poe2-currency-overlay
cd poe2-currency-overlay
npm install
npm start
```

## Usage

- **F6** — toggle the currency overlay. **Ctrl+F** — price-check the hovered item (**Ctrl+Alt+F** hides itself once you mouse away). **Esc** — hide. All hotkeys are rebindable in Settings.
- Copy an item with **Ctrl+C** and paste it onto the Price Check or Desecrate tab to work from outside the game.
- The game must be in **Windowed** or **Windowed Fullscreen** — exclusive fullscreen hides any overlay.

## Data sources

Currency rates come from GGG's official Currency Exchange data (real executed trades), topped with the live trade-site order book for the pairs on screen. Item price checks search the official trade site. [poe2scout.com](https://poe2scout.com) supplies item icons, price history, and fallback rates. Net Worth also compares against [poe.ninja](https://poe.ninja) (read-only, public price data; can be switched off in the config with `"ninjaCheck": false`).

## Privacy & data

No analytics, no telemetry, no usage tracking, no background phone-home. The app runs on your PC and only reaches the internet to fetch currency prices (poe2scout, poe.ninja), run price checks against the official trade site using your own pathofexile.com login (which stays on your PC and is never sent to us), check for updates (GitHub), and send a Bug or Feedback report when you submit the in-app form. The only data we receive is the reports you choose to send. Full detail: [PRIVACY.md](PRIVACY.md).

## Credits

The item price-checking is built on the [Exiled Exchange 2](https://github.com/Kvan7/Exiled-Exchange-2) matching engine (a fork of Awakened PoE Trade). Thanks to the EE2 / APT maintainers and everyone who keeps the stat and item resource data up to date.

## License

GPL-3.0 — see [LICENSE](LICENSE). The vendored Exiled Exchange 2 item parser keeps its own MIT license (`renderer/vendor/ee2/LICENSE`).

---

Not affiliated with Grinding Gear Games.
