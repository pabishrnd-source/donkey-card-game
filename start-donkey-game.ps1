$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$frontendPort = 5173

$listener = Get-NetTCPConnection -LocalPort $frontendPort -State Listen -ErrorAction SilentlyContinue
if (-not $listener) {
  $node = (Get-Command node -ErrorAction Stop).Source
  $outLog = Join-Path $root ".donkey-server.log"
  $errLog = Join-Path $root ".donkey-server-error.log"
  $env:DONKEY_LAN_DEV = "1"
  Start-Process -FilePath $node `
    -ArgumentList @("scripts/dev.mjs") `
    -WorkingDirectory $root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $outLog `
    -RedirectStandardError $errLog | Out-Null
  Start-Sleep -Seconds 3
}

try {
  Start-Process explorer.exe -ArgumentList "http://localhost:$frontendPort/" | Out-Null
} catch {
  Write-Host "Donkey is running at http://localhost:$frontendPort/"
}
