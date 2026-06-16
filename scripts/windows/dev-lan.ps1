param(
  [int]$Port = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
Set-Location $projectDir

if (-not $env:AUTH_SECRET) {
  $env:AUTH_SECRET = "local-dev-secret-change-me-32-chars-minimum"
}

$env:ALLOW_DEV_AUTH_FALLBACK = "true"
$env:ALLOW_DEV_FILE_STORE = "true"

$addresses = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -match '^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)' -and
    $_.PrefixOrigin -ne 'WellKnown'
  } |
  Sort-Object {
    if ($_.InterfaceAlias -match 'Wi-Fi|Wireless') { 0 }
    elseif ($_.InterfaceAlias -match 'Ethernet') { 1 }
    else { 2 }
  }, InterfaceAlias

Write-Host ""
Write-Host "Local POS will run on:"
Write-Host "  http://127.0.0.1:$Port"

if ($addresses) {
  Write-Host ""
  Write-Host "Open from phone/tablet on the same Wi-Fi:"
  foreach ($address in $addresses) {
    Write-Host ("  http://{0}:{1}    ({2})" -f $address.IPAddress, $Port, $address.InterfaceAlias)
  }
}
else {
  Write-Host ""
  Write-Host "No private LAN IPv4 address found. Check Wi-Fi/Ethernet connection."
}

Write-Host ""
Write-Host "Starting Next.js..."
Write-Host ""

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Write-Host "Server is already listening on port $Port."
  Write-Host "Use the URL above, or stop the old server before starting a new one."
  exit 0
}

npm run dev -- --hostname 0.0.0.0 --port $Port
