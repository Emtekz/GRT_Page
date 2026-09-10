# Startet einen einfachen lokalen Webserver fuer diesen Ordner (ohne Python/Node noetig).
# Wird am einfachsten ueber start-server.bat per Doppelklick gestartet.

$root = $PSScriptRoot
$port = 5500

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$port/")

try {
  $listener.Start()
} catch {
  Write-Host "Port $port ist schon belegt. Bitte start-server.ps1 schliessen/neu starten oder Port aendern."
  Read-Host "Enter zum Beenden druecken"
  exit
}

Write-Host ""
Write-Host "Server laeuft: http://localhost:$port/index.html"
Write-Host "Zum Beenden dieses Fenster einfach schliessen (oder Strg+C)."
Write-Host ""

Start-Process "http://localhost:$port/index.html"

$mime = @{
  ".html" = "text/html"
  ".css"  = "text/css"
  ".js"   = "application/javascript"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".jpeg" = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".gif"  = "image/gif"
  ".webp" = "image/webp"
}

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $path = $ctx.Request.Url.LocalPath
    if ($path -eq "/") { $path = "/index.html" }
    $file = Join-Path $root ($path.TrimStart('/'))

    if (Test-Path $file -PathType Leaf) {
      $ext = [System.IO.Path]::GetExtension($file)
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $bytes = [System.IO.File]::ReadAllBytes($file)
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
    }
    $ctx.Response.Close()
  }
} finally {
  $listener.Stop()
}
