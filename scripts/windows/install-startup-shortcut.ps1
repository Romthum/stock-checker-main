param(
  [string]$ShortcutName = "Local POS Dev Server",
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [int]$Port = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$startupDir = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDir "$ShortcutName.lnk"
$scriptPath = Join-Path $ProjectDir "scripts\windows\start-dev-server.ps1"
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -ProjectDir `"$ProjectDir`" -Port $Port"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $ProjectDir
$shortcut.WindowStyle = 7
$shortcut.Description = "Starts the Local POS dev server on Windows startup."
$shortcut.Save()

Write-Host "Created startup shortcut:"
Write-Host $shortcutPath
Write-Host "It will start Local POS on port $Port after Windows login."
Write-Host "Start it now with:"
Write-Host "powershell -ExecutionPolicy Bypass -File `"$scriptPath`" -ProjectDir `"$ProjectDir`" -Port $Port"
