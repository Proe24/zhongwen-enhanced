/*
 * build-chardata.js
 *
 * Merges two offline data sources into one small JSON file per character,
 * written to data/chardata/<codepoint-hex>.json:
 *
 *   - hanzi-writer-data (MIT)      -> stroke paths + medians (for animation)
 *   - Make Me a Hanzi dictionary   -> decomposition, radical, etymology
 *     (LGPL-3.0 / Arphic Public License)
 *
 * Files are keyed by lowercase hex code point (e.g. 好 -> 597d.json) so the
 * content script can locate them with chrome.runtime.getURL without having to
 * URL-encode CJK characters.
 *
 * Prerequisites:
 *   npm install                                                   # fetches hanzi-writer-data
 *   curl -sL -o tools/mmh-dictionary.txt \
 *     https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt
 *
 * Run:  node tools/build-chardata.js
 */

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STROKE_DIR = path.join(ROOT, 'node_modules', 'hanzi-writer-data');
const DICT_FILE = path.join(__dirname, 'mmh-dictionary.txt');
const OUT_DIR = path.join(ROOT, 'data', 'chardata');

function codepoint(ch) {
    return ch.codePointAt(0).toString(16);
}

function loadDictionary() {
    const map = new Map();
    if (!fs.existsSync(DICT_FILE)) {
        console.warn('WARNING: ' + DICT_FILE + ' not found — characters will have stroke data only.');
        return map;
    }
    const lines = fs.readFileSync(DICT_FILE, 'utf8').split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let entry;
        try {
            entry = JSON.parse(trimmed);
        } catch (e) {
            continue;
        }
        if (entry.character) map.set(entry.character, entry);
    }
    return map;
}

function main() {
    if (!fs.existsSync(STROKE_DIR)) {
        console.error('ERROR: ' + STROKE_DIR + ' not found. Run `npm install` first.');
        process.exit(1);
    }

    const dict = loadDictionary();
    fs.mkdirSync(OUT_DIR, { recursive: true });

    const strokeFiles = fs.readdirSync(STROKE_DIR).filter(f => f.endsWith('.json') && f !== 'all.json');

    let written = 0;
    let withEtymology = 0;
    let totalBytes = 0;

    for (const file of strokeFiles) {
        const ch = path.basename(file, '.json');
        if ([...ch].length !== 1) continue; // skip any non-single-character data files

        let strokeData;
        try {
            strokeData = JSON.parse(fs.readFileSync(path.join(STROKE_DIR, file), 'utf8'));
        } catch (e) {
            continue;
        }
        if (!strokeData.strokes) continue;

        const meta = dict.get(ch);
        const out = {
            char: ch,
            strokes: strokeData.strokes,
            medians: strokeData.medians
        };
        if (meta) {
            if (meta.decomposition) out.decomposition = meta.decomposition;
            if (meta.radical) out.radical = meta.radical;
            if (meta.etymology) out.etymology = meta.etymology;
            if (meta.definition) out.definition = meta.definition;
            if (meta.pinyin) out.pinyin = meta.pinyin;
            if (meta.etymology) withEtymology++;
        }

        const json = JSON.stringify(out);
        fs.writeFileSync(path.join(OUT_DIR, codepoint(ch) + '.json'), json);
        totalBytes += json.length;
        written++;
    }

    console.log('Wrote ' + written + ' character files to data/chardata/');
    console.log('  with etymology/decomposition: ' + withEtymology);
    console.log('  total size: ' + (totalBytes / (1024 * 1024)).toFixed(1) + ' MB');
}

main();
