// test-item-parse.mjs - parse copied item text with the bundled EE2 parser, in plain Node.
//
//   node scripts/build-item-tab.mjs                    (builds renderer/item-tab.bundle.js)
//   node scripts/test-item-parse.mjs item.txt [more.txt ...]
//
// Prints OK with name / base / category, or the parse error and the stack of a throw.
// Exit code 1 when any item fails. Written so a failed price check ("[Item-Fehler]"
// issue) can be reproduced and a fix verified without Electron or a browser.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bundle = path.join(ROOT, 'renderer', 'item-tab.bundle.js');
if (!fs.existsSync(bundle)) { console.error('missing', bundle, '- run: node scripts/build-item-tab.mjs'); process.exit(2); }

// the bundle expects a window and fetches its data from ee2://root/ (main.js serves that)
const errors = [];
const sandbox = {
  console: { ...console, error: (...a) => errors.push(a.map(String).join(' ')), warn: () => {} },
  performance, setTimeout, clearTimeout, TextDecoder, TextEncoder, Uint8Array, Uint32Array, ArrayBuffer, URL,
  fetch: async (u) => {
    u = String(u);
    if (!u.startsWith('ee2://root/')) throw new Error('offline test: ' + u);
    const buf = fs.readFileSync(path.join(ROOT, 'renderer', 'vendor', 'ee2', u.slice('ee2://root/'.length)));
    return new Response(buf);
  },
};
sandbox.window = sandbox; sandbox.globalThis = sandbox; sandbox.self = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(bundle, 'utf8'), sandbox, { filename: 'item-tab.bundle.js' });
const EE2 = sandbox.EE2;

const HEAD = [['en', 'Item Class: '], ['de', 'Gegenstandsklasse: '], ['ru', 'Класс предмета: '],
  ['fr', "Classe d'objet: "], ['es', 'Clase de objeto: '], ['pt', 'Classe do Item: ']];
let bad = 0;
for (const f of process.argv.slice(2)) {
  const text = fs.readFileSync(f, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const lang = (HEAD.find(([, h]) => text.startsWith(h)) || ['en'])[0];
  await EE2.init(lang);
  errors.length = 0;
  let r;
  try { r = EE2.parse(text); } catch (e) { r = { ok: false, error: 'threw: ' + (e && e.stack || e) }; }
  if (r.ok) {
    const it = r.item;
    console.log(`OK   ${f}: ${it.info && it.info.name} | ref ${it.info && it.info.refName} | base ${(it.info && it.info.unique && it.info.unique.base) || it.baseType || ''} | ${it.category || ''}`);
  } else {
    bad++;
    console.log(`FAIL ${f}: ${r.error}`);
    for (const e of errors) console.log('     ' + e.split('\n').slice(0, 6).join('\n     '));
  }
}
process.exit(bad ? 1 : 0);
