# Verkleinert/komprimiert alle JPG/PNG unter Images/ auf eine sinnvolle Breite.
# WebP-Dateien werden übersprungen (GDI+ kann kein WebP schreiben/lesen).
# Einfach bei Bedarf manuell ausführen, z.B. nachdem neue Bilder dazugekommen sind.

param(
  [int]$MaxWidth = 1200,
  [int]$JpegQuality = 82
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$imagesPath = Join-Path $root "Images"

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $JpegQuality)

$files = Get-ChildItem -Path $imagesPath -Recurse -File -Include *.jpg, *.jpeg, *.png
$totalBefore = 0
$totalAfter = 0

foreach ($file in $files) {
  $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
  $sizeBefore = $bytes.Length
  $ms = New-Object System.IO.MemoryStream(, $bytes)
  $img = [System.Drawing.Image]::FromStream($ms)
  $origWidth = $img.Width
  $origHeight = $img.Height

  if ($origWidth -le $MaxWidth) {
    Write-Host ("{0,-40} {1}x{2}  ({3} KB) - schon klein genug" -f $file.Name, $origWidth, $origHeight, [math]::Round($sizeBefore / 1KB, 1))
    $img.Dispose()
    $ms.Dispose()
    $totalBefore += $sizeBefore
    $totalAfter += $sizeBefore
    continue
  }

  $ratio = $MaxWidth / $origWidth
  $newWidth = $MaxWidth
  $newHeight = [int]([math]::Round($origHeight * $ratio))

  $bitmap = New-Object System.Drawing.Bitmap($newWidth, $newHeight)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $graphics.DrawImage($img, 0, 0, $newWidth, $newHeight)

  $img.Dispose()
  $ms.Dispose()

  if ($file.Extension.ToLower() -eq ".png") {
    $bitmap.Save($file.FullName, [System.Drawing.Imaging.ImageFormat]::Png)
  } else {
    $bitmap.Save($file.FullName, $jpegCodec, $encoderParams)
  }
  $graphics.Dispose()
  $bitmap.Dispose()

  $sizeAfter = (Get-Item $file.FullName).Length
  $totalBefore += $sizeBefore
  $totalAfter += $sizeAfter
  Write-Host ("{0,-40} {1}x{2} -> {3}x{4}  ({5} KB -> {6} KB)" -f $file.Name, $origWidth, $origHeight, $newWidth, $newHeight, [math]::Round($sizeBefore / 1KB, 1), [math]::Round($sizeAfter / 1KB, 1))
}

Write-Host ""
Write-Host ("Gesamt: {0} KB -> {1} KB (gespart: {2} KB)" -f [math]::Round($totalBefore / 1KB, 1), [math]::Round($totalAfter / 1KB, 1), [math]::Round(($totalBefore - $totalAfter) / 1KB, 1))
