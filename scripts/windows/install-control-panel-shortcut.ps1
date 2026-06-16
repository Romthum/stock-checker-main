param(
  [ValidateSet("Desktop", "Startup")]
  [string]$Location = "Desktop",
  [string]$ShortcutName = "Local POS Control Panel",
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [int]$Port = 3000
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$targetDir = if ($Location -eq "Startup") {
  [Environment]::GetFolderPath("Startup")
}
else {
  [Environment]::GetFolderPath("DesktopDirectory")
}

$shortcutPath = Join-Path $targetDir "$ShortcutName.lnk"
$scriptPath = Join-Path $ProjectDir "scripts\windows\pos-control-panel.ps1"
$arguments = "-NoProfile -STA -ExecutionPolicy Bypass -File `"$scriptPath`" -ProjectDir `"$ProjectDir`" -Port $Port"

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "powershell.exe"
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = $ProjectDir
$shortcut.WindowStyle = 1
$shortcut.Description = "Open the Local POS server control panel."
$shortcut.Save()

Write-Host "Created shortcut:"
Write-Host $shortcutPath

if ($Location -eq "Startup") {
  Write-Host "The control panel will open after Windows login."
}
else {
  Write-Host "Double-click it from the Desktop to monitor the Mini PC server."
}
