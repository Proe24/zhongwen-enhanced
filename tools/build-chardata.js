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
 *   curl -fL -o tools/mmh-dictionary.txt \
 *     https://raw.githubusercontent.com/skishore/makemeahanzi/bddc96d41bef78427ed0e034e9f7e31d71fd1b92/dictionary.txt
 *   sha256: 744bb05d5b0742e9ee35c37791f94d56a173349b3367569e7ca11e510364d203
 *
 * Run:  node tools/build-chardata.js
 */

/* eslint-env node */

'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const STROKE_DIR = path.join(ROOT, 'node_modules', 'hanzi-writer-data');
const DICT_FILE = path.join(__dirname, 'mmh-dictionary.txt');
const OUT_DIR = path.join(ROOT, 'data', 'chardata');
const EXPECTED_DICT_SHA256 = '744bb05d5b0742e9ee35c37791f94d56a173349b3367569e7ca11e510364d203';
const EXPECTED_STROKE_VERSION = '2.0.1';
const MIN_CHARACTERS = 9500;
const MIN_ETYMOLOGY = 9000;

function codepoint(ch) {
    return ch.codePointAt(0).toString(16);
}

function loadDictionary() {
    const map = new Map();
    if (!fs.existsSync(DICT_FILE)) {
        throw new Error(DICT_FILE + ' not found. Download the pinned source first (see header).');
    }
    const input = fs.readFileSync(DICT_FILE);
    const actualHash = crypto.createHash('sha256').update(input).digest('hex');
    if (actualHash !== EXPECTED_DICT_SHA256) {
        throw new Error('Unexpected Make Me a Hanzi input SHA-256: ' + actualHash);
    }

    const lines = input.toString('utf8').split('\n');
    let invalidLines = 0;
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let entry;
        try {
            entry = JSON.parse(trimmed);
        } catch (e) {
            invalidLines++;
            continue;
        }
        if (entry.character) map.set(entry.character, entry);
    }
    if (invalidLines || map.size < MIN_CHARACTERS) {
        throw new Error('Invalid Make Me a Hanzi input: ' + map.size +
            ' characters and ' + invalidLines + ' malformed lines.');
    }
    return map;
}

function main() {
    if (!fs.existsSync(STROKE_DIR)) {
        throw new Error(STROKE_DIR + ' not found. Run `npm install` first.');
    }

    const strokePackage = JSON.parse(fs.readFileSync(path.join(STROKE_DIR, 'package.json'), 'utf8'));
    if (strokePackage.version !== EXPECTED_STROKE_VERSION) {
        throw new Error('Expected hanzi-writer-data ' + EXPECTED_STROKE_VERSION +
            ', found ' + strokePackage.version + '.');
    }

    const dict = loadDictionary();
    const tempDir = OUT_DIR + '.tmp-' + process.pid;
    const backupDir = OUT_DIR + '.bak-' + process.pid;
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

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
        fs.writeFileSync(path.join(tempDir, codepoint(ch) + '.json'), json);
        totalBytes += json.length;
        written++;
    }

    if (written < MIN_CHARACTERS || withEtymology < MIN_ETYMOLOGY) {
        fs.rmSync(tempDir, { recursive: true, force: true });
        throw new Error('Generated character coverage is unexpectedly low: ' + written +
            ' files, ' + withEtymology + ' with etymology.');
    }

    const hadExistingOutput = fs.existsSync(OUT_DIR);
    try {
        if (hadExistingOutput) fs.renameSync(OUT_DIR, backupDir);
        fs.renameSync(tempDir, OUT_DIR);
        if (hadExistingOutput) fs.rmSync(backupDir, { recursive: true, force: true });
    } catch (error) {
        if (!fs.existsSync(OUT_DIR) && fs.existsSync(backupDir)) fs.renameSync(backupDir, OUT_DIR);
        if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
        throw error;
    }

    console.log('Wrote ' + written + ' character files to data/chardata/');
    console.log('  with etymology/decomposition: ' + withEtymology);
    console.log('  total size: ' + (totalBytes / (1024 * 1024)).toFixed(1) + ' MB');
}

main();
