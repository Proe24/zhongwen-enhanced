/* eslint-env node */

'use strict';

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');

function findPowerShell() {
    const candidates = process.platform === 'win32'
        ? ['powershell.exe', 'pwsh.exe']
        : ['pwsh', 'powershell'];
    return candidates.find(command => {
        const result = childProcess.spawnSync(command, ['-NoProfile', '-NonInteractive', '-Command', 'exit 0']);
        return !result.error && result.status === 0;
    });
}

function copyFile(source, destination) {
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.copyFileSync(source, destination);
}

function writeFailingNpm(temp, passInstall) {
    if (process.platform === 'win32') {
        const command = path.join(temp, 'npm-fail.cmd');
        const script = passInstall
            ? '@echo off\r\nif "%1"=="ci" exit /b 0\r\nexit /b 23\r\n'
            : '@exit /b 23\r\n';
        fs.writeFileSync(command, script);
        return command;
    }

    const command = path.join(temp, 'npm-fail');
    const script = passInstall
        ? '#!/bin/sh\n[ "$1" = "ci" ] && exit 0\nexit 23\n'
        : '#!/bin/sh\nexit 23\n';
    fs.writeFileSync(command, script);
    fs.chmodSync(command, 0o755);
    return command;
}

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
    const installIndex = build.indexOf('& $NpmCommand ci --ignore-scripts');
    const checkIndex = build.indexOf('& $NpmCommand run check');
    const cleanIndex = build.indexOf("Remove-Item (Join-Path $root 'dist')");
    const archiveIndex = build.indexOf('Compress-Archive');

    assert.ok(installIndex >= 0, 'build.ps1 must install locked dependencies');
    assert.ok(checkIndex >= 0, 'build.ps1 must run npm check');
    assert.ok(installIndex < checkIndex, 'locked dependencies must be installed before verification');
    assert.ok(checkIndex < cleanIndex, 'verification must run before old artifacts are removed');
    assert.ok(checkIndex < archiveIndex, 'verification must run before packaging');
});

const powerShell = findPowerShell();
test('the release package fails closed when dependency installation or checks fail', {
    skip: powerShell ? false : 'PowerShell is not installed'
}, function () {
    for (const passInstall of [false, true]) {
        const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zhongwen-package-failure-'));
        copyFile(path.join(root, 'build.ps1'), path.join(temp, 'build.ps1'));
        copyFile(path.join(root, 'manifest.json'), path.join(temp, 'manifest.json'));

        const dist = path.join(temp, 'dist');
        fs.mkdirSync(dist);
        const marker = path.join(dist, 'existing-artifact.txt');
        fs.writeFileSync(marker, 'preserve me');
        const failingNpm = writeFailingNpm(temp, passInstall);

        const result = childProcess.spawnSync(powerShell, [
            '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
            '-File', path.join(temp, 'build.ps1'), '-NpmCommand', failingNpm
        ], { cwd: temp, encoding: 'utf8' });

        assert.notEqual(result.status, 0, result.stdout + result.stderr);
        assert.equal(fs.readFileSync(marker, 'utf8'), 'preserve me');
        assert.deepEqual(fs.readdirSync(dist), ['existing-artifact.txt']);
    }
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
