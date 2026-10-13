# Verkleinert/komprimiert alle JPG/PNG/WebP unter Images/ auf eine sinnvolle Breite.
# JPG/PNG laufen über Windows-Bordmittel (GDI+), WebP über ImageMagick
# (winget install ImageMagick.ImageMagick) - ist es nicht installiert, werden
# WebP-Dateien übersprungen. Einfach bei Bedarf manuell ausführen, z.B. nachdem
# neue Bilder dazugekommen sind.

param(
  [int]$MaxWidth = 1200,
  [int]$JpegQuality = 82,
  [int]$WebpQuality = 80
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$imagesPath = Join-Path $root "Images"

$magick = (Get-Command magick -ErrorAction SilentlyContinue).Source
if (-not $magick) {
  $magick = Get-ChildItem "C:\Program Files\ImageMagick*\magick.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $JpegQuality)

$files = Get-ChildItem -Path $imagesPath -Recurse -File -Include *.jpg, *.jpeg, *.png, *.webp
$totalBefore = 0
$totalAfter = 0

foreach ($file in $files) {
  if ($file.Extension.ToLower() -eq ".webp") {
    $sizeBefore = $file.Length
    if (-not $magick) {
      Write-Host ("{0,-40} WebP - übersprungen (ImageMagick nicht installiert)" -f $file.Name)
      $totalBefore += $sizeBefore
      $totalAfter += $sizeBefore
      continue
    }
    $webpWidth = [int](& $magick identify -format "%w" $file.FullName)
    if ($webpWidth -le $MaxWidth) {
      Write-Host ("{0,-40} WebP {1}px  ({2} KB) - schon klein genug" -f $file.Name, $webpWidth, [math]::Round($sizeBefore / 1KB, 1))
      $totalBefore += $sizeBefore
      $totalAfter += $sizeBefore
      continue
    }
    # Größe nur verkleinern (">"), nie vergrößern; Ergebnis nur übernehmen, wenn es kleiner ist
    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("opt_" + $file.Name)
    & $magick $file.FullName -resize "${MaxWidth}x>" -quality $WebpQuality $tmp
    $sizeAfter = $sizeBefore
    if ((Test-Path $tmp) -and (Get-Item $tmp).Length -lt $sizeBefore) {
      Move-Item $tmp $file.FullName -Force
      $sizeAfter = (Get-Item $file.FullName).Length
    } elseif (Test-Path $tmp) {
      Remove-Item $tmp
    }
    $totalBefore += $sizeBefore
    $totalAfter += $sizeAfter
    Write-Host ("{0,-40} WebP  ({1} KB -> {2} KB)" -f $file.Name, [math]::Round($sizeBefore / 1KB, 1), [math]::Round($sizeAfter / 1KB, 1))
    continue
  }

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
  if ($sizeAfter -ge $sizeBefore) {
    [System.IO.File]::WriteAllBytes($file.FullName, $bytes)
    $sizeAfter = $sizeBefore
  }
  $totalBefore += $sizeBefore
  $totalAfter += $sizeAfter
  Write-Host ("{0,-40} {1}x{2} -> {3}x{4}  ({5} KB -> {6} KB)" -f $file.Name, $origWidth, $origHeight, $newWidth, $newHeight, [math]::Round($sizeBefore / 1KB, 1), [math]::Round($sizeAfter / 1KB, 1))
}

Write-Host ""
Write-Host ("Gesamt: {0} KB -> {1} KB (gespart: {2} KB)" -f [math]::Round($totalBefore / 1KB, 1), [math]::Round($totalAfter / 1KB, 1), [math]::Round(($totalBefore - $totalAfter) / 1KB, 1))
