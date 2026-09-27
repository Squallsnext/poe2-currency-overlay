# Item samples

Copied item texts (Ctrl+C in game) that once failed to parse. Every fix to the parser or
its data must keep all of them parsing:

    node scripts/build-item-tab.mjs
    node scripts/test-item-parse.mjs scripts/item-samples/*.txt

File name: `<language>-<item>.txt`.
