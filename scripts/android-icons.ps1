param([Parameter(Mandatory=$true)][string]$Source)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$res = Join-Path $root 'artifacts/card-game/android/app/src/main/res'
$image = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source).Path)
function Export-Icon([string]$Path, [int]$Size, [double]$Scale) {
    $bitmap = New-Object System.Drawing.Bitmap($Size, $Size)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::FromArgb(5, 32, 22))
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $edge = [int]($Size * $Scale)
        $offset = [int](($Size - $edge) / 2)
        $graphics.DrawImage($image, $offset, $offset, $edge, $edge)
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $graphics.Dispose(); $bitmap.Dispose() }
}
try {
    foreach ($density in @(@('mdpi',48,108), @('hdpi',72,162), @('xhdpi',96,216), @('xxhdpi',144,324), @('xxxhdpi',192,432))) {
        $directory = Join-Path $res ('mipmap-' + $density[0])
        Export-Icon (Join-Path $directory 'ic_launcher.png') $density[1] 1
        Export-Icon (Join-Path $directory 'ic_launcher_round.png') $density[1] 0.7
        # Keep the square artwork inside the safe circle of adaptive launcher masks.
        Export-Icon (Join-Path $directory 'ic_launcher_foreground.png') $density[2] 0.43
    }
} finally { $image.Dispose() }
