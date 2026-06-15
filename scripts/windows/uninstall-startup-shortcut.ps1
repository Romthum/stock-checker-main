param(
  [string]$ShortcutName = "Local POS Dev Server"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$shortcutPath = Join-Path ([Environment]::GetFolderPath("Startup")) "$ShortcutName.lnk"
if (Test-Path $shortcutPath) {
  Remove-Item -LiteralPath $shortcutPath -Force
  Write-Host "Removed startup shortcut:"
  Write-Host $shortcutPath
}
else {
  Write-Host "Startup shortcut not found:"
  Write-Host $shortcutPath
}
