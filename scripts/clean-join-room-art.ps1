Add-Type -AssemblyName System.Drawing

$source = "C:\Users\pabish\Downloads\Rustic Join a Room Game Panel.png"
$destination = Join-Path $PSScriptRoot "..\artifacts\card-game\public\rustic-join-room-game-panel.png"
$inputBitmap = [System.Drawing.Bitmap]::new($source)
$bitmap = [System.Drawing.Bitmap]::new($inputBitmap.Width, $inputBitmap.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.DrawImage($inputBitmap, 0, 0, $inputBitmap.Width, $inputBitmap.Height)

# Remove the sample name/caret and sample room code while preserving the wood grain.
$woodName = [System.Drawing.Rectangle]::new(700, 535, 300, 115)
$woodCode = [System.Drawing.Rectangle]::new(700, 745, 300, 115)
$graphics.DrawImage($inputBitmap, [System.Drawing.Rectangle]::new(335, 535, 430, 115), $woodName, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawImage($inputBitmap, [System.Drawing.Rectangle]::new(335, 745, 430, 115), $woodCode, [System.Drawing.GraphicsUnit]::Pixel)
$graphics.Dispose()
$inputBitmap.Dispose()
$bitmap.Save($destination, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
