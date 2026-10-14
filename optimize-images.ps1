# Erzeugt Images/ komplett neu aus den unkomprimierten Originalen in Images-Originale/:
# Images/ wird zuerst geleert, danach wird jedes Bild (gleicher Unterordner/Dateiname)
# auf maximal $MaxWidth Pixel Breite verkleinert und komprimiert abgelegt. Bilder, die
# schon klein genug sind oder durch die Komprimierung nicht kleiner würden, werden
# unverändert kopiert. So bleibt nie etwas Altes liegen und nichts wird doppelt
# komprimiert.
#
# Neue Bilder also immer in Images-Originale/ ablegen (nicht in Images/), danach
# dieses Skript bzw. optimize-images.bat ausführen.
#
# JPG/PNG laufen über Windows-Bordmittel (GDI+), WebP über ImageMagick
# (winget install ImageMagick.ImageMagick) - ist es nicht installiert, werden
# WebP-Dateien unverändert kopiert.
#
# Zum Schluss wird Images/Default/index.json geschrieben, eine Liste aller dort
# liegenden Bilder. Die Seite nutzt sie, um zu einem System das passende Bild zu
# finden, auch wenn der Name nicht exakt stimmt (z.B. "Call of Cthulhu (7e)" ->
# cthulhu.jpg, siehe findKnownSystemImage() in image-resolver.js).

param(
  [int]$MaxWidth = 1200,
  [int]$JpegQuality = 82,
  [int]$WebpQuality = 80,
  [int]$RecompressAboveKB = 100
)

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sourcePath = Join-Path $root "Images-Originale"
$imagesPath = Join-Path $root "Images"

# Sicherheitsnetz: nur löschen, wenn es wirklich Originale zum Neuerzeugen gibt
if (-not (Test-Path $sourcePath)) {
  Write-Host "Abbruch: Ordner 'Images-Originale' nicht gefunden - nichts wurde gelöscht." -ForegroundColor Red
  exit 1
}
$sourceFiles = @(Get-ChildItem -Path $sourcePath -Recurse -File)
if ($sourceFiles.Count -eq 0) {
  Write-Host "Abbruch: 'Images-Originale' ist leer - nichts wurde gelöscht." -ForegroundColor Red
  exit 1
}

$magick = (Get-Command magick -ErrorAction SilentlyContinue).Source
if (-not $magick) {
  $magick = Get-ChildItem "C:\Program Files\ImageMagick*\magick.exe" -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
}

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
$encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
$encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, $JpegQuality)

# Images/ leeren
if (Test-Path $imagesPath) {
  Get-ChildItem -Path $imagesPath -Force | Remove-Item -Recurse -Force
} else {
  New-Item -ItemType Directory -Path $imagesPath | Out-Null
}

$totalBefore = 0
$totalAfter = 0

foreach ($file in $sourceFiles) {
  $relative = $file.FullName.Substring($sourcePath.Length).TrimStart('\')
  $dest = Join-Path $imagesPath $relative
  New-Item -ItemType Directory -Force -Path (Split-Path -Parent $dest) | Out-Null

  $ext = $file.Extension.ToLower()
  $sizeBefore = $file.Length
  $note = "unverändert kopiert"

  if ($ext -in ".jpg", ".jpeg", ".png") {
    $bytes = [System.IO.File]::ReadAllBytes($file.FullName)
    $ms = New-Object System.IO.MemoryStream(, $bytes)
    $img = [System.Drawing.Image]::FromStream($ms)
    $origWidth = $img.Width
    $origHeight = $img.Height

    # PNG nur bei zu großer Breite anfassen (verlustfrei, Neu-Speichern spart sonst nichts)
    $needsWork = ($origWidth -gt $MaxWidth) -or ($ext -ne ".png" -and $sizeBefore -gt $RecompressAboveKB * 1KB)
    if ($needsWork) {
      $newWidth = [math]::Min($origWidth, $MaxWidth)
      $newHeight = [int]([math]::Round($origHeight * ($newWidth / $origWidth)))
      $bitmap = New-Object System.Drawing.Bitmap($newWidth, $newHeight)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
      $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
      $graphics.DrawImage($img, 0, 0, $newWidth, $newHeight)
      if ($ext -eq ".png") {
        $bitmap.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
      } else {
        $bitmap.Save($dest, $jpegCodec, $encoderParams)
      }
      $graphics.Dispose()
      $bitmap.Dispose()
      $note = "${origWidth}x${origHeight} -> ${newWidth}x${newHeight}"
    }
    else {
      $note = "schon klein genug, kopiert"
    }
    $img.Dispose()
    $ms.Dispose()
  }
  elseif ($ext -eq ".webp" -and $magick) {
    $webpWidth = [int](& $magick identify -format "%w" $file.FullName)
    if ($webpWidth -gt $MaxWidth -or $sizeBefore -gt $RecompressAboveKB * 1KB) {
      & $magick $file.FullName -resize "${MaxWidth}x>" -quality $WebpQuality $dest
      $note = "WebP ${webpWidth}px, neu komprimiert"
    }
    else {
      $note = "WebP schon klein genug, kopiert"
    }
  }
  elseif ($ext -eq ".webp") {
    $note = "WebP unverändert kopiert (ImageMagick nicht installiert)"
  }

  # Nichts erzeugt (oder Ergebnis nicht kleiner als das Original): Original kopieren
  if (-not (Test-Path $dest) -or (Get-Item $dest).Length -ge $sizeBefore) {
    Copy-Item $file.FullName $dest -Force
    if ($note -notlike "*kopiert*") { $note += " (nicht kleiner, Original behalten)" }
  }

  $sizeAfter = (Get-Item $dest).Length
  $totalBefore += $sizeBefore
  $totalAfter += $sizeAfter
  Write-Host ("{0,-40} {1,-32} ({2} KB -> {3} KB)" -f $relative, $note, [math]::Round($sizeBefore / 1KB, 1), [math]::Round($sizeAfter / 1KB, 1))
}

# Liste der Default-Bilder für die Bildsuche der Seite (siehe Kopfkommentar)
$defaultFolder = Join-Path $imagesPath "Default"
if (Test-Path $defaultFolder) {
  $defaultNames = @(Get-ChildItem -Path $defaultFolder -File |
    Where-Object { $_.Extension.ToLower() -in ".jpg", ".jpeg", ".png", ".webp" } |
    Sort-Object Name |
    ForEach-Object { $_.Name })
  $json = ConvertTo-Json -InputObject $defaultNames -Compress
  [System.IO.File]::WriteAllText((Join-Path $defaultFolder "index.json"), $json, (New-Object System.Text.UTF8Encoding($false)))
  Write-Host ("index.json mit {0} Default-Bildern geschrieben." -f $defaultNames.Count)
}

Write-Host ""
Write-Host ("Gesamt: {0} KB -> {1} KB (gespart: {2} KB)" -f [math]::Round($totalBefore / 1KB, 1), [math]::Round($totalAfter / 1KB, 1), [math]::Round(($totalBefore - $totalAfter) / 1KB, 1))
