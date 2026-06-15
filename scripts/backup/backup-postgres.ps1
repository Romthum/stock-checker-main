param(
  [string]$OutputDir = $env:BACKUP_DIR,
  [string]$ComposeProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-DotEnvValue {
  param(
    [string]$FilePath,
    [string]$Key
  )
  if (-not (Test-Path $FilePath)) { return $null }
  foreach ($line in Get-Content -LiteralPath $FilePath) {
    $trimmed = $line.Trim()
    if ($trimmed -eq "" -or $trimmed.StartsWith("#")) { continue }
    $index = $trimmed.IndexOf("=")
    if ($index -lt 1) { continue }
    $name = $trimmed.Substring(0, $index).Trim()
    if ($name -ne $Key) { continue }
    $value = $trimmed.Substring($index + 1).Trim()
    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }
    return $value
  }
  return $null
}

if (-not $OutputDir -or $OutputDir.Trim() -eq "") {
  $OutputDir = Get-DotEnvValue -FilePath (Join-Path $ComposeProjectDir ".env") -Key "BACKUP_DIR"
}

if (-not $OutputDir -or $OutputDir.Trim() -eq "") {
  $OutputDir = Join-Path $ComposeProjectDir "backups\postgres"
}

$resolvedOutputDir = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $OutputDir))
New-Item -ItemType Directory -Force $resolvedOutputDir | Out-Null

$timestamp = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
$outputFile = Join-Path $resolvedOutputDir "pos_$timestamp.dump"
$containerFile = "/tmp/pos_$timestamp.dump"

Push-Location $ComposeProjectDir
try {
  docker compose exec -T postgres sh -c "pg_dump -U pos_app -d pos --format=custom --compress=9 --file=$containerFile"
  docker cp "pos-postgres:$containerFile" $outputFile
  docker compose exec -T postgres sh -c "rm -f $containerFile"
  Write-Host "Backup written to: $outputFile"
}
finally {
  Pop-Location
}
