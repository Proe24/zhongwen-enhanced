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
 *   curl -fL -o tools/cow-cmn.tab \
 *     https://bond-lab.github.io/cow/data/0.9/wn-data-cmn.tab
 *   sha256: ba11514279f48963d5a83aeef17de3c53b06bce6a1a50e599a88beb81388534b
 *
 * Run:  node tools/build-thesaurus.js
 */

/* eslint-env node */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const IN_FILE = path.join(__dirname, 'cow-cmn.tab');
const OUT_FILE = path.join(ROOT, 'data', 'thesaurus.json');
const EXPECTED_SHA256 = 'ba11514279f48963d5a83aeef17de3c53b06bce6a1a50e599a88beb81388534b';
const MIN_SYNSETS = 40000;
const MIN_WORDS = 40000;
const MIN_LINKS = 120000;

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest('hex');
}

function main() {
    if (!fs.existsSync(IN_FILE)) {
        throw new Error(IN_FILE + ' not found. Download it first (see header).');
    }

    const input = fs.readFileSync(IN_FILE);
    const actualHash = sha256(input);
    if (actualHash !== EXPECTED_SHA256) {
        throw new Error('Unexpected COW input SHA-256: ' + actualHash);
    }

    // synset -> Set of words
    const synsets = new Map();
    const lines = input.toString('utf8').split('\n');
    for (const raw of lines) {
        const line = raw.replace(/^\uFEFF/, '').trim(); // strip BOM, whitespace
        if (!line || line.startsWith('#')) continue;
        const parts = line.split('\t');
        if (parts.length < 3) continue;
        const synset = parts[0];
        const word = parts[2].trim();
        if (!synset || !word) continue;
        if (!synsets.has(synset)) synsets.set(synset, new Set());
        synsets.get(synset).add(word);
    }
    if (synsets.size < MIN_SYNSETS) {
        throw new Error('COW input contains only ' + synsets.size + ' synsets; expected at least ' + MIN_SYNSETS + '.');
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
    if (Object.keys(out).length < MIN_WORDS || pairs < MIN_LINKS) {
        throw new Error('Generated thesaurus coverage is unexpectedly low: ' +
            Object.keys(out).length + ' words, ' + pairs + ' links.');
    }

    const json = JSON.stringify(out);
    const tempFile = OUT_FILE + '.tmp-' + process.pid;
    fs.writeFileSync(tempFile, json);
    fs.renameSync(tempFile, OUT_FILE);
    console.log('Wrote ' + Object.keys(out).length + ' words with synonyms to data/thesaurus.json');
    console.log('  total synonym links: ' + pairs);
    console.log('  size: ' + (json.length / (1024 * 1024)).toFixed(2) + ' MB');
}

main();
