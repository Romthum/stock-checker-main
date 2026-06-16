param(
  [int]$Port = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

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

if (-not $addresses) {
  Write-Host "No private LAN IPv4 address found."
  Write-Host "Run ipconfig and look for IPv4 Address under Wi-Fi or Ethernet."
  exit 1
}

Write-Host "Open from another phone/tablet on the same Wi-Fi:"
foreach ($address in $addresses) {
  Write-Host ("http://{0}:{1}    ({2})" -f $address.IPAddress, $Port, $address.InterfaceAlias)
}

$listener = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Write-Host ""
  Write-Host "Server is listening on port $Port."
}
else {
  Write-Host ""
  Write-Host "No server is listening on port $Port."
  Write-Host "Start it with: npm run dev:lan"
}
