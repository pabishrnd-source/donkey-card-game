Add-Type -AssemblyName System.Drawing

$source = "C:\Users\pabish\Downloads\Fantasy Wooden Create a Room UI.png"
$temp = Join-Path $PSScriptRoot "..\artifacts\card-game\public\fantasy-wooden-create-room-ui-clean.png"
$inputBitmap = [System.Drawing.Bitmap]::new($source)
$width = $inputBitmap.Width
$height = $inputBitmap.Height
$bitmap = [System.Drawing.Bitmap]::new($width, $height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.DrawImage($inputBitmap, 0, 0, $width, $height)
# Remove the example name/caret from the supplied artwork so the real input is shown once.
$graphics.DrawImage($inputBitmap, [System.Drawing.Rectangle]::new(420, 515, 300, 145), [System.Drawing.Rectangle]::new(720, 515, 300, 145), [System.Drawing.GraphicsUnit]::Pixel)
$graphics.Dispose()
$inputBitmap.Dispose()
$visited = New-Object 'bool[,]' $width, $height
$queue = [System.Collections.Generic.Queue[System.Drawing.Point]]::new()

function Test-CheckerPixel([System.Drawing.Color] $color) {
  $max = [Math]::Max($color.R, [Math]::Max($color.G, $color.B))
  $min = [Math]::Min($color.R, [Math]::Min($color.G, $color.B))
  return $max - $min -le 14 -and $max -ge 90 -and $max -le 245
}

for ($x = 0; $x -lt $width; $x++) {
  $queue.Enqueue([System.Drawing.Point]::new($x, 0))
  $queue.Enqueue([System.Drawing.Point]::new($x, $height - 1))
}
for ($y = 1; $y -lt ($height - 1); $y++) {
  $queue.Enqueue([System.Drawing.Point]::new(0, $y))
  $queue.Enqueue([System.Drawing.Point]::new($width - 1, $y))
}

while ($queue.Count -gt 0) {
  $point = $queue.Dequeue()
  if ($point.X -lt 0 -or $point.X -ge $width -or $point.Y -lt 0 -or $point.Y -ge $height) { continue }
  if ($visited[$point.X, $point.Y]) { continue }
  $visited[$point.X, $point.Y] = $true
  $color = $bitmap.GetPixel($point.X, $point.Y)
  if (-not (Test-CheckerPixel $color)) { continue }
  $bitmap.SetPixel($point.X, $point.Y, [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
  $queue.Enqueue([System.Drawing.Point]::new($point.X - 1, $point.Y))
  $queue.Enqueue([System.Drawing.Point]::new($point.X + 1, $point.Y))
  $queue.Enqueue([System.Drawing.Point]::new($point.X, $point.Y - 1))
  $queue.Enqueue([System.Drawing.Point]::new($point.X, $point.Y + 1))
}

$bitmap.Save($temp, [System.Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()
Move-Item -LiteralPath $temp -Destination $source -Force
