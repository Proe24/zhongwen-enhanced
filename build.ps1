# Builds a clean Chrome Web Store ZIP of Zhongwen Enhanced.
# Usage:  powershell -ExecutionPolicy Bypass -File build.ps1

$ErrorActionPreference = 'Stop'

$root    = $PSScriptRoot
$version = (Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json).version
$stage   = Join-Path $root 'dist\zhongwen-enhanced'
$zip     = Join-Path $root "dist\zhongwen-enhanced-$version.zip"

# Everything the extension needs at runtime (plus LICENSE/NOTICE for GPL).
$include = @(
    'manifest.json',
    'background.js', 'content.js', 'dict.js',
    'options.html', 'wordlist.html', 'help.html',
    'css', 'data', 'fonts', 'images', 'js',
    'LICENSE', 'NOTICE.md', 'PRIVACY.md'
)

# Refuse to package a release unless the complete repository gate passes.
Push-Location $root
try {
    & npm ci --ignore-scripts
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed (exit $LASTEXITCODE)." }
    & npm run check
    if ($LASTEXITCODE -ne 0) { throw "Repository checks failed (exit $LASTEXITCODE)." }
} finally {
    Pop-Location
}

# Clean previous output.
if (Test-Path (Join-Path $root 'dist')) { Remove-Item (Join-Path $root 'dist') -Recurse -Force }
New-Item -ItemType Directory -Path $stage -Force | Out-Null

foreach ($item in $include) {
    $src = Join-Path $root $item
    if (-not (Test-Path $src)) { throw "Missing expected file/dir: $item" }
    Copy-Item $src -Destination $stage -Recurse -Force
}

Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -Force

Write-Output "Built $zip"
Write-Output "Staged contents at $stage"
