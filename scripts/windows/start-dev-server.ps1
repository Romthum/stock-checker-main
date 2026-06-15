param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [int]$Port = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Set-Location $ProjectDir

$logDir = Join-Path $ProjectDir "data\logs"
New-Item -ItemType Directory -Force $logDir | Out-Null

$alreadyListening = $false
try {
  $connection = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  $alreadyListening = $null -ne $connection
}
catch {
  $alreadyListening = $false
}

if ($alreadyListening) {
  "Port $Port is already in use. Dev server is probably already running." |
    Out-File -Append -Encoding utf8 (Join-Path $logDir "auto-dev-server.log")
  exit 0
}

if (-not $env:AUTH_SECRET) {
  $env:AUTH_SECRET = "local-dev-secret-change-me-32-chars-minimum"
}

if (-not $env:DATABASE_URL) {
  $env:DATABASE_URL = "postgresql://pos_app:dev_password@localhost:5432/pos"
}

$env:ALLOW_DEV_AUTH_FALLBACK = "true"
$env:ALLOW_DEV_FILE_STORE = "true"

npm run dev -- --hostname 0.0.0.0 --port $Port *>> (Join-Path $logDir "auto-dev-server.log")
