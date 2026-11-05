Add-Type -AssemblyName System.Drawing

$source = "C:\Users\pabish\Downloads\Donkey Card Game Login Panel.png"
$destination = Join-Path $PSScriptRoot "..\artifacts\card-game\public\donkey-card-game-login-panel.png"
$inputBitmap = [System.Drawing.Bitmap]::new($source)
$bitmap = [System.Drawing.Bitmap]::new($inputBitmap.Width, $inputBitmap.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.DrawImage($inputBitmap, 0, 0, $inputBitmap.Width, $inputBitmap.Height)
# Remove the example username and password dots so the live form is the only source of values.
$fieldBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 34, 34, 38))
$graphics.FillRectangle($fieldBrush, 220, 795, 300, 70)
$graphics.FillRectangle($fieldBrush, 220, 945, 330, 70)
$fieldBrush.Dispose()
# Remove the printed Sign In/Create Account controls; the live tab row renders them once.
$tabBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 45, 28, 14))
$graphics.FillRectangle($tabBrush, 115, 585, 350, 135)
$graphics.FillRectangle($tabBrush, 475, 585, 350, 135)
$tabBrush.Dispose()
# Remove the optional social-login row and its divider from the supplied artwork.
$socialBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(255, 38, 24, 12))
$graphics.FillRectangle($socialBrush, 105, 1285, 725, 175)
$socialBrush.Dispose()
$graphics.Dispose()
$inputBitmap.Dispose()
$bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
