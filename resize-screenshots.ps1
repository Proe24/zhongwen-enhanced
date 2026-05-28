# Resizes images to exact Chrome Web Store screenshot dimensions without
# distortion (scales to fill, then center-crops). Outputs 24-bit PNG.
#
# Usage:
#   # Single file:
#   powershell -ExecutionPolicy Bypass -File resize-screenshots.ps1 -Path shot.png
#
#   # Whole folder (processes png/jpg/jpeg), output to .\screenshots-out:
#   powershell -ExecutionPolicy Bypass -File resize-screenshots.ps1 -Path .\raw-shots
#
#   # Use the smaller allowed size and a custom output folder:
#   powershell -ExecutionPolicy Bypass -File resize-screenshots.ps1 -Path .\raw -Width 640 -Height 400 -OutDir .\out

param(
    [Parameter(Mandatory = $true)] [string] $Path,
    [int] $Width = 1280,
    [int] $Height = 800,
    [string] $OutDir
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

function Resize-One($inFile, $outFile, $W, $H) {
    $img = [System.Drawing.Image]::FromFile($inFile)
    try {
        $scale = [Math]::Max($W / $img.Width, $H / $img.Height)
        $sw = [int]($img.Width * $scale)
        $sh = [int]($img.Height * $scale)

        $bmp = New-Object System.Drawing.Bitmap($W, $H)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode  = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            # Fill background white so JPEGs/transparency never leave artifacts.
            $g.Clear([System.Drawing.Color]::White)
            $g.DrawImage($img, [int](($W - $sw) / 2), [int](($H - $sh) / 2), $sw, $sh)
        } finally { $g.Dispose() }

        $bmp.Save($outFile, [System.Drawing.Imaging.ImageFormat]::Png)
        $bmp.Dispose()
        Write-Output ("OK  {0}  ->  {1}  ({2}x{3})" -f (Split-Path $inFile -Leaf), (Split-Path $outFile -Leaf), $W, $H)
    } finally { $img.Dispose() }
}

if (-not (Test-Path $Path)) { throw "Path not found: $Path" }
$item = Get-Item $Path

if ($item.PSIsContainer) {
    if (-not $OutDir) { $OutDir = Join-Path $item.FullName 'screenshots-out' }
    if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
    $files = Get-ChildItem -Path $item.FullName -File | Where-Object { $_.Extension -match '^\.(png|jpg|jpeg)$' }
    if ($files.Count -eq 0) { Write-Output "No png/jpg/jpeg files found in $($item.FullName)"; return }
    foreach ($f in $files) {
        $out = Join-Path $OutDir ($f.BaseName + '-store.png')
        Resize-One $f.FullName $out $Width $Height
    }
    Write-Output "Done. Output in $OutDir"
} else {
    if (-not $OutDir) { $OutDir = $item.DirectoryName }
    if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Path $OutDir -Force | Out-Null }
    $out = Join-Path $OutDir ($item.BaseName + '-store.png')
    Resize-One $item.FullName $out $Width $Height
    Write-Output "Done. Output: $out"
}
