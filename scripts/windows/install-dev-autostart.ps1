param(
  [string]$TaskName = "Local POS Dev Server",
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [int]$Port = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptPath = Join-Path $ProjectDir "scripts\windows\start-dev-server.ps1"
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -ProjectDir `"$ProjectDir`" -Port $Port"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $argument -WorkingDirectory $ProjectDir
$trigger = New-ScheduledTaskTrigger -AtLogOn
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit (New-TimeSpan -Hours 0) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 1)

try {
  Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Settings $settings `
    -Description "Starts the Local POS Next.js dev server on Windows logon." `
    -Force `
    -ErrorAction Stop | Out-Null
}
catch {
  Write-Error "Could not install Scheduled Task. Run PowerShell as Administrator, or use .\scripts\windows\install-startup-shortcut.ps1 instead. $($_.Exception.Message)"
  exit 1
}

Write-Host "Installed scheduled task: $TaskName"
Write-Host "It will run at logon on port $Port."
Write-Host "Start it now with:"
Write-Host "Start-ScheduledTask -TaskName `"$TaskName`""
