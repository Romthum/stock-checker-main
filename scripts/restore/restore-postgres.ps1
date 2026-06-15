param(
  [Parameter(Mandatory = $true)]
  [string]$BackupFile,
  [string]$ComposeProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedBackupFile = [System.IO.Path]::GetFullPath((Join-Path (Get-Location) $BackupFile))
if (-not (Test-Path $resolvedBackupFile)) {
  throw "Backup file not found: $resolvedBackupFile"
}

$containerFile = "/tmp/restore_pos.dump"

Push-Location $ComposeProjectDir
try {
  Write-Host "Stopping web app before restore..."
  docker compose stop web | Out-Host

  Write-Host "Copying backup into postgres container..."
  docker cp $resolvedBackupFile "pos-postgres:$containerFile"

  Write-Host "Dropping and recreating database..."
  docker compose exec -T postgres dropdb -U pos_app --if-exists pos | Out-Host
  docker compose exec -T postgres createdb -U pos_app pos | Out-Host

  Write-Host "Restoring: $resolvedBackupFile"
  docker compose exec -T postgres pg_restore -U pos_app -d pos --clean --if-exists $containerFile | Out-Host
  docker compose exec -T postgres sh -c "rm -f $containerFile" | Out-Host

  Write-Host "Starting web app..."
  docker compose up -d web | Out-Host
  Write-Host "Restore complete."
}
finally {
  Pop-Location
}
