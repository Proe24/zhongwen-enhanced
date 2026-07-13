/* eslint-env node */

'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

test('release version sources agree and manifest files exist', function () {
    const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json')));
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
    const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));
    assert.equal(pkg.version, manifest.version);
    assert.equal(lock.version, manifest.version);
    assert.equal(lock.packages[''].version, manifest.version);

    const referenced = [manifest.background.service_worker, manifest.options_ui.page]
        .concat(manifest.content_scripts.flatMap(script => script.js.concat(script.css)))
        .concat(Object.values(manifest.icons), manifest.action.default_icon);
    referenced.forEach(file => assert.ok(fs.existsSync(path.join(root, file)), file));
});

test('the documented release package runs verification before creating output', function () {
    const build = fs.readFileSync(path.join(root, 'build.ps1'), 'utf8');
    const installIndex = build.indexOf('& npm ci --ignore-scripts');
    const checkIndex = build.indexOf('& npm run check');
    const cleanIndex = build.indexOf("Remove-Item (Join-Path $root 'dist')");
    const archiveIndex = build.indexOf('Compress-Archive');

    assert.ok(installIndex >= 0, 'build.ps1 must install locked dependencies');
    assert.ok(checkIndex >= 0, 'build.ps1 must run npm check');
    assert.ok(installIndex < checkIndex, 'locked dependencies must be installed before verification');
    assert.ok(checkIndex < cleanIndex, 'verification must run before old artifacts are removed');
    assert.ok(checkIndex < archiveIndex, 'verification must run before packaging');
});

test('thesaurus generator rejects an unpinned empty input without replacing output', function () {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zhongwen-thesaurus-'));
    fs.mkdirSync(path.join(temp, 'tools'));
    fs.mkdirSync(path.join(temp, 'data'));
    fs.copyFileSync(path.join(root, 'tools', 'build-thesaurus.js'), path.join(temp, 'tools', 'build-thesaurus.js'));
    fs.writeFileSync(path.join(temp, 'tools', 'cow-cmn.tab'), '');
    fs.writeFileSync(path.join(temp, 'data', 'thesaurus.json'), '{"preserved":true}');

    const result = childProcess.spawnSync(process.execPath, ['tools/build-thesaurus.js'], { cwd: temp });
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(path.join(temp, 'data', 'thesaurus.json'), 'utf8'), '{"preserved":true}');
});

test('character generator rejects an unpinned empty input without replacing output', function () {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zhongwen-chardata-'));
    const toolDir = path.join(temp, 'tools');
    const strokeDir = path.join(temp, 'node_modules', 'hanzi-writer-data');
    const outputDir = path.join(temp, 'data', 'chardata');
    fs.mkdirSync(toolDir, { recursive: true });
    fs.mkdirSync(strokeDir, { recursive: true });
    fs.mkdirSync(outputDir, { recursive: true });
    fs.copyFileSync(path.join(root, 'tools', 'build-chardata.js'), path.join(toolDir, 'build-chardata.js'));
    fs.writeFileSync(path.join(toolDir, 'mmh-dictionary.txt'), '');
    fs.writeFileSync(path.join(strokeDir, 'package.json'), '{"version":"2.0.1"}');
    fs.writeFileSync(path.join(outputDir, 'preserved.json'), '{"preserved":true}');

    const result = childProcess.spawnSync(process.execPath, ['tools/build-chardata.js'], { cwd: temp });
    assert.notEqual(result.status, 0);
    assert.equal(fs.readFileSync(path.join(outputDir, 'preserved.json'), 'utf8'), '{"preserved":true}');
});
