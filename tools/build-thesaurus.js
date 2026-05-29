/*
 * build-thesaurus.js
 *
 * Converts the Chinese Open Wordnet (COW) into a compact synonym lookup at
 * data/thesaurus.json, mapping each word to the other words that share at
 * least one of its synsets (senses).
 *
 *   COW: Wang & Bond (2013), "Building the Chinese Wordnet (COW)".
 *   License: CC BY 3.0 / WordNet license — free to use and ship WITH
 *   attribution (see CREDITS.md / NOTICE.md and the in-panel credit line).
 *
 * Prerequisites:
 *   curl -sL -o tools/cow-cmn.tab \
 *     https://bond-lab.github.io/cow/data/0.9/wn-data-cmn.tab
 *
 * Run:  node tools/build-thesaurus.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const IN_FILE = path.join(__dirname, 'cow-cmn.tab');
const OUT_FILE = path.join(ROOT, 'data', 'thesaurus.json');

function main() {
    if (!fs.existsSync(IN_FILE)) {
        console.error('ERROR: ' + IN_FILE + ' not found. Download it first (see header).');
        process.exit(1);
    }

    // synset -> Set of words
    const synsets = new Map();
    const lines = fs.readFileSync(IN_FILE, 'utf8').split('\n');
    for (const raw of lines) {
        const line = raw.replace(/^﻿/, '').trim(); // strip BOM, whitespace
        if (!line || line.startsWith('#')) continue;
        const parts = line.split('\t');
        if (parts.length < 3) continue;
        const synset = parts[0];
        const word = parts[2].trim();
        if (!synset || !word) continue;
        if (!synsets.has(synset)) synsets.set(synset, new Set());
        synsets.get(synset).add(word);
    }

    // word -> Set of synonyms (co-members of any of its synsets, minus itself)
    const syn = new Map();
    for (const words of synsets.values()) {
        if (words.size < 2) continue;
        const arr = [...words];
        for (const w of arr) {
            if (!syn.has(w)) syn.set(w, new Set());
            const bucket = syn.get(w);
            for (const other of arr) {
                if (other !== w) bucket.add(other);
            }
        }
    }

    const out = {};
    let pairs = 0;
    for (const [w, set] of syn) {
        out[w] = [...set];
        pairs += set.size;
    }

    const json = JSON.stringify(out);
    fs.writeFileSync(OUT_FILE, json);
    console.log('Wrote ' + Object.keys(out).length + ' words with synonyms to data/thesaurus.json');
    console.log('  total synonym links: ' + pairs);
    console.log('  size: ' + (json.length / (1024 * 1024)).toFixed(2) + ' MB');
}

main();
