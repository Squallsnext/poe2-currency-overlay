// ee2-name-aliases.mjs - in-game names the vendored EE2 item data does not know yet.
//
// GGG renames items in a client language from time to time, and the vendored
// renderer/vendor/ee2/data/<lang>/items.ndjson (and poe2db) can lag behind. The parser
// looks an item up by the name on its clipboard text, so an unknown name means the item
// is not recognised at all - no price check, no trade search.
//
// Each alias ADDS a record: a copy of the item's existing record (found by its English
// refName) with the new in-game name. The old name keeps working, so a client that still
// shows it is not broken. Idempotent - running it twice adds nothing.
//
// Usage (after this, and after every re-vendor of EE2 data):
//   node scripts/ee2-name-aliases.mjs        # all languages listed below
//   node scripts/gen-ee2-index.mjs de        # rebuild that language's lookup index
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ALIASES = {
  de: [
    // Reported in game (German client, 0.5.x): the Rebirth rune family is now called
    // "...Wiederbelebungsrune" at every tier; the data still had "Wiedergeburt-Rune" for
    // lesser/greater/perfect (only the base tier was already "Wiederbelebungsrune").
    // Clipboard showed "Kleine Wiederbelebungsrune" and "Große Wiederbelebungsrune";
    // perfect follows the same pattern.
    { refName: "Lesser Rebirth Rune", name: "Kleine Wiederbelebungsrune" },
    { refName: "Greater Rebirth Rune", name: "Große Wiederbelebungsrune" },
    { refName: "Perfect Rebirth Rune", name: "Perfekte Wiederbelebungsrune" },
  ],
};

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "renderer", "vendor", "ee2", "data");

for (const [lang, list] of Object.entries(ALIASES)) {
  const file = path.join(ROOT, lang, "items.ndjson");
  let text = fs.readFileSync(file, "utf8");
  const records = text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
  const byRef = new Map();
  for (const r of records) if (r.namespace === "ITEM" && !byRef.has(r.refName)) byRef.set(r.refName, r);
  const have = new Set(records.map((r) => `${r.namespace}::${r.name}`));
  let added = 0;
  for (const a of list) {
    const base = byRef.get(a.refName);
    if (!base) { console.warn(`[${lang}] no record for "${a.refName}" - skipped`); continue; }
    if (have.has(`${base.namespace}::${a.name}`)) continue;
    // appended at the END: existing lines keep their offsets, which the index relies on
    if (!text.endsWith("\n")) text += "\n";
    text += JSON.stringify(Object.assign({}, base, { name: a.name })) + "\n";
    have.add(`${base.namespace}::${a.name}`);
    added++;
  }
  fs.writeFileSync(file, text);
  console.log(`[${lang}] ${added} alias record(s) added`);
}
