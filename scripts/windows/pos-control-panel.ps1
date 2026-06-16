param(
  [string]$ProjectDir = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
  [int]$Port = 3000,
  [switch]$Check,
  [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

if ($Check) {
  Write-Host "Local POS Control Panel script parsed successfully."
  exit 0
}

if ([System.Threading.Thread]::CurrentThread.GetApartmentState() -ne "STA") {
  $scriptPath = $PSCommandPath
  $arguments = "-NoProfile -STA -ExecutionPolicy Bypass -File `"$scriptPath`" -ProjectDir `"$ProjectDir`" -Port $Port"
  Start-Process -FilePath "powershell.exe" -ArgumentList $arguments -WorkingDirectory $ProjectDir
  exit 0
}

Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

[System.Windows.Forms.Application]::EnableVisualStyles()

$script:ProjectDir = (Resolve-Path $ProjectDir).Path
$script:Port = $Port
$script:LogDir = Join-Path $script:ProjectDir "data\logs"
$script:ConfigPath = Join-Path $script:ProjectDir "data\control-panel-settings.json"
$script:PanelLogPath = Join-Path $script:LogDir "control-panel.log"
$script:UpdateLogPath = Join-Path $script:LogDir "update.log"
$script:DefaultBackupDir = Join-Path $script:ProjectDir "backups\local"
$script:CurrentLanUrl = $null
$script:LastLogPath = $null
$script:LastKnownServerState = $null
$script:LastKnownLanUrl = $null
$script:LastAlertSignature = $null
$script:LastAlertAt = $null
$script:ValidateOnlyMode = [bool]$ValidateOnly
$script:EmailStatusControl = $null
$script:BackupStatusControl = $null
$script:UpdateStatusControl = $null

New-Item -ItemType Directory -Force $script:LogDir | Out-Null

function New-Point {
  param([int]$X, [int]$Y)
  return New-Object System.Drawing.Point -ArgumentList $X, $Y
}

function New-Size {
  param([int]$Width, [int]$Height)
  return New-Object System.Drawing.Size -ArgumentList $Width, $Height
}

function Write-PanelLog {
  param([string]$Message)
  $line = "{0}  {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
  Add-Content -Path $script:PanelLogPath -Value $line -Encoding utf8
}

function Set-EmailStatus {
  param(
    [string]$Text,
    [bool]$IsError = $false
  )

  if ($null -ne $script:EmailStatusControl) {
    $script:EmailStatusControl.Text = $Text
    if ($IsError) {
      $script:EmailStatusControl.ForeColor = [System.Drawing.Color]::FromArgb(248, 113, 113)
    }
    else {
      $script:EmailStatusControl.ForeColor = [System.Drawing.Color]::FromArgb(180, 186, 195)
    }
  }
}

function Set-BackupStatus {
  param([string]$Text, [bool]$IsError = $false)
  if ($null -ne $script:BackupStatusControl) {
    $script:BackupStatusControl.Text = $Text
    $script:BackupStatusControl.ForeColor = if ($IsError) {
      [System.Drawing.Color]::FromArgb(248, 113, 113)
    }
    else {
      [System.Drawing.Color]::FromArgb(180, 186, 195)
    }
  }
}

function Set-UpdateStatus {
  param([string]$Text, [bool]$IsError = $false)
  if ($null -ne $script:UpdateStatusControl) {
    $script:UpdateStatusControl.Text = $Text
    $script:UpdateStatusControl.ForeColor = if ($IsError) {
      [System.Drawing.Color]::FromArgb(248, 113, 113)
    }
    else {
      [System.Drawing.Color]::FromArgb(180, 186, 195)
    }
  }
}

function Get-EmailSettings {
  $defaults = [pscustomobject]@{
    AlertEmail = ""
    SmtpEmail = ""
    SmtpPassword = ""
    AutoEmailAlerts = $false
    BackupDir = $script:DefaultBackupDir
    LastSavedAt = $null
  }

  if (-not (Test-Path $script:ConfigPath)) {
    return $defaults
  }

  try {
    $settings = Get-Content -Raw -Path $script:ConfigPath -ErrorAction Stop | ConvertFrom-Json
    $alertEmail = if ($null -ne $settings.AlertEmail) { [string]$settings.AlertEmail } else { "" }
    $smtpEmail = if ($null -ne $settings.SmtpEmail) { [string]$settings.SmtpEmail } else { "" }
    $smtpPassword = if ($null -ne $settings.SmtpPassword) { [string]$settings.SmtpPassword } else { "" }
    $autoEmailAlerts = if ($null -ne $settings.AutoEmailAlerts) { [bool]$settings.AutoEmailAlerts } else { $false }
    $backupDir = if ($null -ne $settings.BackupDir -and -not [string]::IsNullOrWhiteSpace([string]$settings.BackupDir)) { [string]$settings.BackupDir } else { $script:DefaultBackupDir }
    $lastSavedAt = if ($null -ne $settings.LastSavedAt) { $settings.LastSavedAt } else { $null }

    return [pscustomobject]@{
      AlertEmail = $alertEmail
      SmtpEmail = $smtpEmail
      SmtpPassword = $smtpPassword
      AutoEmailAlerts = $autoEmailAlerts
      BackupDir = $backupDir
      LastSavedAt = $lastSavedAt
    }
  }
  catch {
    Write-PanelLog "Could not read email settings: $($_.Exception.Message)"
    return $defaults
  }
}

function Protect-EmailPassword {
  param([string]$Password)
  if ([string]::IsNullOrWhiteSpace($Password)) {
    return ""
  }
  $secure = ConvertTo-SecureString $Password -AsPlainText -Force
  return ConvertFrom-SecureString $secure
}

function Unprotect-EmailPassword {
  param([string]$EncryptedPassword)
  if ([string]::IsNullOrWhiteSpace($EncryptedPassword)) {
    return ""
  }

  $secure = ConvertTo-SecureString $EncryptedPassword
  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
  }
}

function Save-EmailSettings {
  param(
    [string]$AlertEmail,
    [string]$SmtpEmail,
    [string]$AppPasswordPlainText,
    [bool]$AutoEmailAlerts
  )

  $existing = Get-EmailSettings
  $encryptedPassword = $existing.SmtpPassword
  if (-not [string]::IsNullOrWhiteSpace($AppPasswordPlainText)) {
    $encryptedPassword = Protect-EmailPassword ($AppPasswordPlainText -replace "\s+", "")
  }
  elseif ([string]::IsNullOrWhiteSpace($AlertEmail) -and [string]::IsNullOrWhiteSpace($SmtpEmail)) {
    $encryptedPassword = ""
  }

  $settings = [ordered]@{
    AlertEmail = $AlertEmail.Trim()
    SmtpEmail = $SmtpEmail.Trim()
    SmtpPassword = $encryptedPassword
    AutoEmailAlerts = $AutoEmailAlerts
    BackupDir = $existing.BackupDir
    LastSavedAt = (Get-Date).ToString("o")
  }

  New-Item -ItemType Directory -Force (Split-Path $script:ConfigPath) | Out-Null
  $settings | ConvertTo-Json | Set-Content -Path $script:ConfigPath -Encoding utf8
  Write-PanelLog "Email settings saved."
}

function Save-BackupSettings {
  param([string]$BackupDir)
  $existing = Get-EmailSettings
  $settings = [ordered]@{
    AlertEmail = $existing.AlertEmail
    SmtpEmail = $existing.SmtpEmail
    SmtpPassword = $existing.SmtpPassword
    AutoEmailAlerts = $existing.AutoEmailAlerts
    BackupDir = $BackupDir.Trim()
    LastSavedAt = (Get-Date).ToString("o")
  }
  New-Item -ItemType Directory -Force (Split-Path $script:ConfigPath) | Out-Null
  $settings | ConvertTo-Json | Set-Content -Path $script:ConfigPath -Encoding utf8
  Write-PanelLog "Backup folder saved: $BackupDir"
}

function Get-BackupDir {
  $settings = Get-EmailSettings
  if ([string]::IsNullOrWhiteSpace($settings.BackupDir)) {
    return $script:DefaultBackupDir
  }
  return $settings.BackupDir
}

function Test-EmailSettingsConfigured {
  param($Settings)
  $from = if (-not [string]::IsNullOrWhiteSpace($Settings.SmtpEmail)) {
    $Settings.SmtpEmail
  }
  else {
    $Settings.AlertEmail
  }

  return (
    -not [string]::IsNullOrWhiteSpace($Settings.AlertEmail) -and
    -not [string]::IsNullOrWhiteSpace($from) -and
    -not [string]::IsNullOrWhiteSpace($Settings.SmtpPassword)
  )
}

function Get-PrivateLanAddresses {
  try {
    return Get-NetIPAddress -AddressFamily IPv4 |
      Where-Object {
        $_.IPAddress -match '^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.)' -and
        $_.PrefixOrigin -ne 'WellKnown'
      } |
      Sort-Object {
        if ($_.InterfaceAlias -match 'Wi-Fi|Wireless') { 0 }
        elseif ($_.InterfaceAlias -match 'Ethernet') { 1 }
        else { 2 }
      }, InterfaceAlias
  }
  catch {
    return @()
  }
}

function Get-ServerListener {
  try {
    return Get-NetTCPConnection -LocalPort $script:Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -First 1
  }
  catch {
    return $null
  }
}

function Get-ServerHealth {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$script:Port/api/health" -UseBasicParsing -TimeoutSec 2
    return $response.Content
  }
  catch {
    return $null
  }
}

function Get-ServerStatus {
  $listener = Get-ServerListener
  if (-not $listener) {
    return [pscustomobject]@{
      Running = $false
      Pid = $null
      ProcessName = $null
      Health = $null
      StateText = "Stopped"
    }
  }

  $processName = "unknown"
  try {
    $processName = (Get-Process -Id $listener.OwningProcess -ErrorAction Stop).ProcessName
  }
  catch {
    $processName = "pid $($listener.OwningProcess)"
  }

  $health = Get-ServerHealth
  $stateText = if ($health) { "Running" } else { "Port open, health pending" }

  return [pscustomobject]@{
    Running = $true
    Pid = $listener.OwningProcess
    ProcessName = $processName
    Health = $health
    StateText = $stateText
  }
}

function Get-LanUrlText {
  $addresses = @(Get-PrivateLanAddresses)
  $lines = New-Object System.Collections.Generic.List[string]
  $lines.Add("This PC: http://127.0.0.1:$script:Port")

  if ($addresses.Count -gt 0) {
    $script:CurrentLanUrl = "http://$($addresses[0].IPAddress):$script:Port"
    foreach ($address in $addresses) {
      $lines.Add(("LAN:     http://{0}:{1}    ({2})" -f $address.IPAddress, $script:Port, $address.InterfaceAlias))
    }
  }
  else {
    $script:CurrentLanUrl = $null
    $lines.Add("LAN:     No private LAN IPv4 found. Check Wi-Fi/Ethernet.")
  }

  return ($lines -join [Environment]::NewLine)
}

function Get-ActiveLogPath {
  $candidateNames = @(
    "auto-dev-server.log",
    "dev-server.log",
    "control-panel.log"
  )

  $candidates = foreach ($name in $candidateNames) {
    $path = Join-Path $script:LogDir $name
    if (Test-Path $path) {
      Get-Item $path
    }
  }

  if (-not $candidates) {
    return $script:PanelLogPath
  }

  return ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName
}

function Get-LogText {
  $path = Get-ActiveLogPath
  $script:LastLogPath = $path

  if (-not (Test-Path $path)) {
    return "No log yet. Click Start Server to create one."
  }

  try {
    return (Get-Content -Path $path -Tail 220 -ErrorAction Stop | Out-String).TrimEnd()
  }
  catch {
    return "Could not read log: $($_.Exception.Message)"
  }
}

function Send-EmailMessage {
  param(
    [string]$Subject,
    [string]$Body
  )

  $settings = Get-EmailSettings
  $from = if (-not [string]::IsNullOrWhiteSpace($settings.SmtpEmail)) {
    $settings.SmtpEmail.Trim()
  }
  else {
    $settings.AlertEmail.Trim()
  }

  if (-not (Test-EmailSettingsConfigured $settings)) {
    throw "Set alert Gmail, sender Gmail, and Gmail App Password first."
  }

  $password = (Unprotect-EmailPassword $settings.SmtpPassword) -replace "\s+", ""
  if ([string]::IsNullOrWhiteSpace($password)) {
    throw "Gmail App Password is empty."
  }

  $message = New-Object System.Net.Mail.MailMessage
  $client = New-Object System.Net.Mail.SmtpClient("smtp.gmail.com", 587)
  try {
    $message.From = New-Object System.Net.Mail.MailAddress($from)
    $message.To.Add($settings.AlertEmail.Trim())
    $message.Subject = $Subject
    $message.Body = $Body
    $message.SubjectEncoding = [System.Text.Encoding]::UTF8
    $message.BodyEncoding = [System.Text.Encoding]::UTF8

    $client.EnableSsl = $true
    $client.UseDefaultCredentials = $false
    $client.Timeout = 10000
    $client.Credentials = New-Object System.Net.NetworkCredential($from, $password)
    $client.Send($message)
    Write-PanelLog "Email sent to $($settings.AlertEmail). Subject: $Subject"
  }
  finally {
    $message.Dispose()
    $client.Dispose()
  }
}

function Send-CurrentUrlEmail {
  param([string]$Reason = "Manual URL send")
  $status = Get-ServerStatus
  [void](Get-LanUrlText)

  if (-not $status.Running) {
    throw "Server is not running yet. Click Start Server first."
  }

  if ([string]::IsNullOrWhiteSpace($script:CurrentLanUrl)) {
    throw "No LAN URL found. Check Wi-Fi/Ethernet connection."
  }

  Send-EmailMessage -Subject "Local POS URL: $script:CurrentLanUrl" -Body $script:CurrentLanUrl
  Write-PanelLog "URL email sent. Reason: $Reason"
}

function Invoke-AutomaticEmailAlert {
  param(
    $Status,
    [string]$UrlText
  )

  if ($script:ValidateOnlyMode) {
    return
  }

  $settings = Get-EmailSettings
  if (-not $settings.AutoEmailAlerts) {
    $script:LastKnownLanUrl = $script:CurrentLanUrl
    return
  }

  if (-not (Test-EmailSettingsConfigured $settings)) {
    Set-EmailStatus "Auto alert is on, but Gmail settings are incomplete." $true
    return
  }

  if (-not $Status.Running) {
    Set-EmailStatus "Auto send is on. Waiting for server to run." $false
    $script:LastKnownLanUrl = $script:CurrentLanUrl
    return
  }

  if ([string]::IsNullOrWhiteSpace($script:CurrentLanUrl)) {
    Set-EmailStatus "Auto send is on. Waiting for LAN URL." $false
    return
  }

  if ($script:LastKnownLanUrl -eq $script:CurrentLanUrl) {
    return
  }

  $previousLanUrl = $script:LastKnownLanUrl
  $script:LastKnownLanUrl = $script:CurrentLanUrl

  $signature = "url|$script:CurrentLanUrl"
  $now = Get-Date
  if (
    $script:LastAlertSignature -eq $signature -and
    $script:LastAlertAt -and
    (($now - $script:LastAlertAt).TotalMinutes -lt 15)
  ) {
    return
  }

  try {
    $reason = if ([string]::IsNullOrWhiteSpace($previousLanUrl)) { "first LAN URL" } else { "LAN URL changed" }
    Send-EmailMessage -Subject "Local POS URL: $script:CurrentLanUrl" -Body $script:CurrentLanUrl
    $script:LastAlertSignature = $signature
    $script:LastAlertAt = $now
    Set-EmailStatus "URL sent: $(Get-Date -Format "HH:mm:ss") ($reason)" $false
  }
  catch {
    Write-PanelLog "URL email failed: $($_.Exception.Message)"
    Set-EmailStatus "URL email failed: $($_.Exception.Message)" $true
  }
}

function New-LocalBackup {
  param([string]$Reason = "manual")

  $backupDir = Get-BackupDir
  New-Item -ItemType Directory -Force $backupDir | Out-Null

  $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $destination = Join-Path $backupDir "pos-local-$timestamp.zip"
  $staging = Join-Path ([System.IO.Path]::GetTempPath()) "pos-backup-$([guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Force $staging | Out-Null

  try {
    $storeFile = Join-Path $script:ProjectDir "data\dev-store.json"
    if (Test-Path $storeFile) {
      Copy-Item -LiteralPath $storeFile -Destination (Join-Path $staging "dev-store.json") -Force
    }

    $uploadsDir = Join-Path $script:ProjectDir "data\uploads"
    if (Test-Path $uploadsDir) {
      Copy-Item -LiteralPath $uploadsDir -Destination (Join-Path $staging "uploads") -Recurse -Force
    }

    $manifest = [ordered]@{
      app = "Local POS"
      createdAt = (Get-Date).ToString("o")
      reason = $Reason
      projectDir = $script:ProjectDir
      port = $script:Port
    }
    $manifest | ConvertTo-Json | Set-Content -Path (Join-Path $staging "manifest.json") -Encoding utf8

    if (Test-Path $destination) {
      Remove-Item -LiteralPath $destination -Force
    }
    Compress-Archive -Path (Join-Path $staging "*") -DestinationPath $destination -Force
    Write-PanelLog "Backup created: $destination"
    return $destination
  }
  finally {
    if (Test-Path $staging) {
      Remove-Item -LiteralPath $staging -Recurse -Force
    }
  }
}

function Restore-LocalBackup {
  param([string]$BackupFile)

  if (-not (Test-Path $BackupFile)) {
    throw "Backup file not found."
  }

  $dataDir = Join-Path $script:ProjectDir "data"
  $uploadsTarget = Join-Path $dataDir "uploads"
  $dataFull = [System.IO.Path]::GetFullPath($dataDir)
  $uploadsFull = [System.IO.Path]::GetFullPath($uploadsTarget)
  if (-not $uploadsFull.StartsWith($dataFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Uploads restore path is outside the data folder."
  }

  [void](New-LocalBackup "pre-restore")
  $wasRunning = $null -ne (Get-ServerListener)
  if ($wasRunning) {
    Stop-PosServer
    Start-Sleep -Seconds 1
  }

  $staging = Join-Path ([System.IO.Path]::GetTempPath()) "pos-restore-$([guid]::NewGuid().ToString('N'))"
  New-Item -ItemType Directory -Force $staging | Out-Null
  try {
    Expand-Archive -LiteralPath $BackupFile -DestinationPath $staging -Force
    New-Item -ItemType Directory -Force $dataDir | Out-Null

    $storeSource = Join-Path $staging "dev-store.json"
    if (Test-Path $storeSource) {
      Copy-Item -LiteralPath $storeSource -Destination (Join-Path $dataDir "dev-store.json") -Force
    }

    $uploadsSource = Join-Path $staging "uploads"
    if (Test-Path $uploadsSource) {
      if (Test-Path $uploadsTarget) {
        Remove-Item -LiteralPath $uploadsTarget -Recurse -Force
      }
      Copy-Item -LiteralPath $uploadsSource -Destination $uploadsTarget -Recurse -Force
    }

    Write-PanelLog "Backup restored: $BackupFile"
  }
  finally {
    if (Test-Path $staging) {
      Remove-Item -LiteralPath $staging -Recurse -Force
    }
  }

  if ($wasRunning) {
    Start-PosServer
  }
}

function Invoke-PanelCommand {
  param(
    [string]$Command,
    [string[]]$Arguments,
    [string]$Title
  )

  $line = "> $Command $($Arguments -join ' ')"
  Add-Content -Path $script:UpdateLogPath -Value "`r`n[$(Get-Date -Format "yyyy-MM-dd HH:mm:ss")] $Title`r`n$line" -Encoding utf8
  $output = & $Command @Arguments 2>&1
  $exitCode = if ($null -ne $LASTEXITCODE) { $LASTEXITCODE } else { 0 }
  if ($output) {
    Add-Content -Path $script:UpdateLogPath -Value ($output | Out-String) -Encoding utf8
  }
  if ($exitCode -ne 0) {
    throw "$Title failed with exit code $exitCode. See data\logs\update.log."
  }
  return ($output | Out-String).Trim()
}

function Get-GitUpdateStatus {
  Set-Location $script:ProjectDir
  Invoke-PanelCommand "git" @("fetch", "origin") "Fetch latest from GitHub" | Out-Null
  $branch = (Invoke-PanelCommand "git" @("branch", "--show-current") "Read branch").Trim()
  if ([string]::IsNullOrWhiteSpace($branch)) {
    $branch = "main"
  }
  $remote = "origin/$branch"
  $behind = (Invoke-PanelCommand "git" @("rev-list", "--count", "HEAD..$remote") "Check updates").Trim()
  $dirty = (Invoke-PanelCommand "git" @("status", "--porcelain") "Check local changes").Trim()
  if (-not [string]::IsNullOrWhiteSpace($dirty)) {
    return "Local files changed. Commit or discard before updating."
  }
  if ([int]$behind -gt 0) {
    return "Update available: $behind commit(s) behind $remote."
  }
  return "Already up to date on $branch."
}

function Invoke-GitHubUpdate {
  Set-Location $script:ProjectDir
  $dirty = (Invoke-PanelCommand "git" @("status", "--porcelain") "Check local changes").Trim()
  if (-not [string]::IsNullOrWhiteSpace($dirty)) {
    throw "Local files changed. Commit or discard before updating."
  }

  $backup = New-LocalBackup "before-github-update"
  Write-PanelLog "Backup before update: $backup"

  $wasRunning = $null -ne (Get-ServerListener)
  if ($wasRunning) {
    Stop-PosServer
    Start-Sleep -Seconds 1
  }

  try {
    Invoke-PanelCommand "git" @("pull", "--ff-only", "origin", "main") "Pull latest code" | Out-Null
    Invoke-PanelCommand "npm.cmd" @("install") "Install dependencies" | Out-Null
    Invoke-PanelCommand "npm.cmd" @("run", "build") "Build app" | Out-Null
  }
  finally {
    if ($wasRunning) {
      Start-PosServer
    }
  }
}

function Start-PosServer {
  $listener = Get-ServerListener
  if ($listener) {
    Write-PanelLog "Start skipped. Port $script:Port is already listening on PID $($listener.OwningProcess)."
    return
  }

  $scriptPath = Join-Path $script:ProjectDir "scripts\windows\start-dev-server.ps1"
  $arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$scriptPath`" -ProjectDir `"$script:ProjectDir`" -Port $script:Port"
  Write-PanelLog "Starting server on port $script:Port."
  Start-Process -FilePath "powershell.exe" -WindowStyle Hidden -WorkingDirectory $script:ProjectDir -ArgumentList $arguments
}

function Stop-PosServer {
  $listener = Get-ServerListener
  if (-not $listener) {
    Write-PanelLog "Stop skipped. No server is listening on port $script:Port."
    return
  }

  Write-PanelLog "Stopping PID $($listener.OwningProcess) on port $script:Port."
  Stop-Process -Id $listener.OwningProcess -Force -ErrorAction Stop
}

function Open-Url {
  param([string]$Url)
  if ($Url) {
    Start-Process $Url
  }
}

function Set-ButtonStyle {
  param(
    [System.Windows.Forms.Button]$Button,
    [System.Drawing.Color]$BackColor
  )
  $Button.FlatStyle = [System.Windows.Forms.FlatStyle]::Flat
  $Button.FlatAppearance.BorderSize = 0
  $Button.BackColor = $BackColor
  $Button.ForeColor = [System.Drawing.Color]::White
  $Button.Cursor = [System.Windows.Forms.Cursors]::Hand
}

function New-Button {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [System.Drawing.Color]$Color
  )
  $button = New-Object System.Windows.Forms.Button
  $button.Text = $Text
  $button.Location = New-Point $X $Y
  $button.Size = New-Size $Width $Height
  $button.Font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 10, ([System.Drawing.FontStyle]::Bold)
  Set-ButtonStyle -Button $button -BackColor $Color
  return $button
}

function New-Label {
  param(
    [string]$Text,
    [int]$X,
    [int]$Y,
    [int]$Width,
    [int]$Height,
    [int]$Size = 10,
    [System.Drawing.FontStyle]$Style = [System.Drawing.FontStyle]::Regular
  )
  $label = New-Object System.Windows.Forms.Label
  $label.Text = $Text
  $label.Location = New-Point $X $Y
  $label.Size = New-Size $Width $Height
  $label.ForeColor = [System.Drawing.Color]::White
  $label.Font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", $Size, $Style
  return $label
}

$form = New-Object System.Windows.Forms.Form
$form.Text = "Local POS Control Panel"
$form.StartPosition = "CenterScreen"
$form.Size = New-Size 980 980
$form.MinimumSize = New-Size 860 760
$form.AutoScroll = $true
$form.BackColor = [System.Drawing.Color]::FromArgb(18, 20, 24)
$form.ForeColor = [System.Drawing.Color]::White
$form.Font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 10

$title = New-Label "Local POS Control Panel" 20 18 460 36 18 ([System.Drawing.FontStyle]::Bold)
$form.Controls.Add($title)

$subTitle = New-Label "Mini PC server monitor. Start/stop the web app, copy LAN URLs, and watch logs without VS Code." 22 54 760 24 10
$subTitle.ForeColor = [System.Drawing.Color]::FromArgb(190, 196, 205)
$form.Controls.Add($subTitle)

$statusPanel = New-Object System.Windows.Forms.Panel
$statusPanel.Location = New-Point 20 92
$statusPanel.Size = New-Size 920 112
$statusPanel.Anchor = "Top,Left,Right"
$statusPanel.BackColor = [System.Drawing.Color]::FromArgb(28, 31, 38)
$form.Controls.Add($statusPanel)

$statusTitle = New-Label "Status" 18 14 120 24 12 ([System.Drawing.FontStyle]::Bold)
$statusPanel.Controls.Add($statusTitle)

$statusDot = New-Object System.Windows.Forms.Label
$statusDot.Text = [string][char]0x25CF
$statusDot.Location = New-Point 18 43
$statusDot.Size = New-Size 30 34
$statusDot.Font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 20, ([System.Drawing.FontStyle]::Bold)
$statusPanel.Controls.Add($statusDot)

$statusText = New-Label "Checking..." 50 49 390 28 12 ([System.Drawing.FontStyle]::Bold)
$statusPanel.Controls.Add($statusText)

$pidText = New-Label "PID: -" 50 76 390 22 9
$pidText.ForeColor = [System.Drawing.Color]::FromArgb(180, 186, 195)
$statusPanel.Controls.Add($pidText)

$healthText = New-Label "Health: -" 460 22 420 24 10
$healthText.ForeColor = [System.Drawing.Color]::FromArgb(180, 186, 195)
$statusPanel.Controls.Add($healthText)

$projectText = New-Label "Project: $script:ProjectDir" 460 53 420 42 9
$projectText.ForeColor = [System.Drawing.Color]::FromArgb(180, 186, 195)
$statusPanel.Controls.Add($projectText)

$btnStart = New-Button "Start Server" 20 222 130 42 ([System.Drawing.Color]::FromArgb(20, 132, 82))
$btnStop = New-Button "Stop Server" 160 222 130 42 ([System.Drawing.Color]::FromArgb(180, 55, 55))
$btnRestart = New-Button "Restart" 300 222 112 42 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$btnOpenLocal = New-Button "Open This PC" 422 222 130 42 ([System.Drawing.Color]::FromArgb(37, 99, 235))
$btnOpenLan = New-Button "Open LAN" 562 222 112 42 ([System.Drawing.Color]::FromArgb(37, 99, 235))
$btnCopyLan = New-Button "Copy LAN URL" 684 222 124 42 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$btnRefresh = New-Button "Refresh" 818 222 122 42 ([System.Drawing.Color]::FromArgb(82, 92, 110))

$form.Controls.AddRange(@($btnStart, $btnStop, $btnRestart, $btnOpenLocal, $btnOpenLan, $btnCopyLan, $btnRefresh))

$urlLabel = New-Label "URLs for staff devices" 22 286 320 24 12 ([System.Drawing.FontStyle]::Bold)
$form.Controls.Add($urlLabel)

$urlBox = New-Object System.Windows.Forms.TextBox
$urlBox.Location = New-Point 20 316
$urlBox.Size = New-Size 920 72
$urlBox.Anchor = "Top,Left,Right"
$urlBox.Multiline = $true
$urlBox.ReadOnly = $true
$urlBox.BorderStyle = "FixedSingle"
$urlBox.BackColor = [System.Drawing.Color]::FromArgb(12, 14, 18)
$urlBox.ForeColor = [System.Drawing.Color]::FromArgb(235, 238, 245)
$urlBox.Font = New-Object System.Drawing.Font -ArgumentList "Consolas", 10
$form.Controls.Add($urlBox)

$emailPanel = New-Object System.Windows.Forms.Panel
$emailPanel.Location = New-Point 20 406
$emailPanel.Size = New-Size 920 144
$emailPanel.Anchor = "Top,Left,Right"
$emailPanel.BackColor = [System.Drawing.Color]::FromArgb(28, 31, 38)
$form.Controls.Add($emailPanel)

$emailTitle = New-Label "Send LAN URL to Gmail" 18 12 260 24 12 ([System.Drawing.FontStyle]::Bold)
$emailPanel.Controls.Add($emailTitle)

$emailHelp = New-Label "Email body contains only the LAN URL, for example http://192.168.1.155:3000." 278 14 610 22 9
$emailHelp.ForeColor = [System.Drawing.Color]::FromArgb(180, 186, 195)
$emailPanel.Controls.Add($emailHelp)

$lblAlertEmail = New-Label "Send to Gmail" 18 46 120 22 9
$emailPanel.Controls.Add($lblAlertEmail)

$txtAlertEmail = New-Object System.Windows.Forms.TextBox
$txtAlertEmail.Location = New-Point 136 44
$txtAlertEmail.Size = New-Size 245 25
$txtAlertEmail.BorderStyle = "FixedSingle"
$txtAlertEmail.BackColor = [System.Drawing.Color]::FromArgb(12, 14, 18)
$txtAlertEmail.ForeColor = [System.Drawing.Color]::White
$txtAlertEmail.Font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 10
$emailPanel.Controls.Add($txtAlertEmail)

$lblSmtpEmail = New-Label "Sender Gmail" 396 46 120 22 9
$emailPanel.Controls.Add($lblSmtpEmail)

$txtSmtpEmail = New-Object System.Windows.Forms.TextBox
$txtSmtpEmail.Location = New-Point 512 44
$txtSmtpEmail.Size = New-Size 245 25
$txtSmtpEmail.BorderStyle = "FixedSingle"
$txtSmtpEmail.BackColor = [System.Drawing.Color]::FromArgb(12, 14, 18)
$txtSmtpEmail.ForeColor = [System.Drawing.Color]::White
$txtSmtpEmail.Font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 10
$emailPanel.Controls.Add($txtSmtpEmail)

$lblPassword = New-Label "App Password" 18 82 120 22 9
$emailPanel.Controls.Add($lblPassword)

$txtAppPassword = New-Object System.Windows.Forms.TextBox
$txtAppPassword.Location = New-Point 136 80
$txtAppPassword.Size = New-Size 245 25
$txtAppPassword.BorderStyle = "FixedSingle"
$txtAppPassword.BackColor = [System.Drawing.Color]::FromArgb(12, 14, 18)
$txtAppPassword.ForeColor = [System.Drawing.Color]::White
$txtAppPassword.Font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 10
$txtAppPassword.UseSystemPasswordChar = $true
$emailPanel.Controls.Add($txtAppPassword)

$chkAutoEmail = New-Object System.Windows.Forms.CheckBox
$chkAutoEmail.Text = "Auto send when LAN URL appears or changes"
$chkAutoEmail.Location = New-Point 396 80
$chkAutoEmail.Size = New-Size 330 26
$chkAutoEmail.ForeColor = [System.Drawing.Color]::White
$chkAutoEmail.BackColor = $emailPanel.BackColor
$chkAutoEmail.Font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 9
$emailPanel.Controls.Add($chkAutoEmail)

$btnSaveEmail = New-Button "Save Gmail" 734 76 150 34 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$emailPanel.Controls.Add($btnSaveEmail)

$btnSendUrlEmail = New-Button "Send URL Now" 734 36 150 34 ([System.Drawing.Color]::FromArgb(37, 99, 235))
$emailPanel.Controls.Add($btnSendUrlEmail)

$emailStatus = New-Label "Gmail settings are stored locally in data/control-panel-settings.json." 18 114 860 22 9
$emailStatus.ForeColor = [System.Drawing.Color]::FromArgb(180, 186, 195)
$emailPanel.Controls.Add($emailStatus)
$script:EmailStatusControl = $emailStatus

$backupPanel = New-Object System.Windows.Forms.Panel
$backupPanel.Location = New-Point 20 568
$backupPanel.Size = New-Size 920 118
$backupPanel.Anchor = "Top,Left,Right"
$backupPanel.BackColor = [System.Drawing.Color]::FromArgb(28, 31, 38)
$form.Controls.Add($backupPanel)

$backupTitle = New-Label "Backup / Restore" 18 12 220 24 12 ([System.Drawing.FontStyle]::Bold)
$backupPanel.Controls.Add($backupTitle)

$txtBackupDir = New-Object System.Windows.Forms.TextBox
$txtBackupDir.Location = New-Point 18 44
$txtBackupDir.Size = New-Size 440 25
$txtBackupDir.BorderStyle = "FixedSingle"
$txtBackupDir.BackColor = [System.Drawing.Color]::FromArgb(12, 14, 18)
$txtBackupDir.ForeColor = [System.Drawing.Color]::White
$txtBackupDir.Font = New-Object System.Drawing.Font -ArgumentList "Segoe UI", 10
$backupPanel.Controls.Add($txtBackupDir)

$btnChooseBackupDir = New-Button "Choose Folder" 470 40 132 34 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$btnBackupNow = New-Button "Backup Now" 612 40 124 34 ([System.Drawing.Color]::FromArgb(20, 132, 82))
$btnRestoreBackup = New-Button "Restore ZIP..." 746 40 138 34 ([System.Drawing.Color]::FromArgb(180, 55, 55))
$backupPanel.Controls.AddRange(@($btnChooseBackupDir, $btnBackupNow, $btnRestoreBackup))

$backupStatus = New-Label "Backups include data/dev-store.json and uploaded product images." 18 84 860 22 9
$backupStatus.ForeColor = [System.Drawing.Color]::FromArgb(180, 186, 195)
$backupPanel.Controls.Add($backupStatus)
$script:BackupStatusControl = $backupStatus

$updatePanel = New-Object System.Windows.Forms.Panel
$updatePanel.Location = New-Point 20 704
$updatePanel.Size = New-Size 920 118
$updatePanel.Anchor = "Top,Left,Right"
$updatePanel.BackColor = [System.Drawing.Color]::FromArgb(28, 31, 38)
$form.Controls.Add($updatePanel)

$updateTitle = New-Label "GitHub Update" 18 12 220 24 12 ([System.Drawing.FontStyle]::Bold)
$updatePanel.Controls.Add($updateTitle)

$updateHelp = New-Label "Creates a backup, pulls latest main, installs dependencies, builds, and restarts the server." 200 14 680 22 9
$updateHelp.ForeColor = [System.Drawing.Color]::FromArgb(180, 186, 195)
$updatePanel.Controls.Add($updateHelp)

$btnCheckUpdate = New-Button "Check Update" 18 44 150 36 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$btnPullUpdate = New-Button "Pull + Build + Restart" 178 44 220 36 ([System.Drawing.Color]::FromArgb(37, 99, 235))
$btnOpenUpdateLog = New-Button "Open Update Log" 408 44 170 36 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$updatePanel.Controls.AddRange(@($btnCheckUpdate, $btnPullUpdate, $btnOpenUpdateLog))

$updateStatus = New-Label "Update log: data/logs/update.log" 18 86 860 22 9
$updateStatus.ForeColor = [System.Drawing.Color]::FromArgb(180, 186, 195)
$updatePanel.Controls.Add($updateStatus)
$script:UpdateStatusControl = $updateStatus

$logLabel = New-Label "Server log" 22 842 220 24 12 ([System.Drawing.FontStyle]::Bold)
$form.Controls.Add($logLabel)

$logPathLabel = New-Label "Log file: -" 150 845 790 22 9
$logPathLabel.Anchor = "Top,Left,Right"
$logPathLabel.ForeColor = [System.Drawing.Color]::FromArgb(160, 166, 175)
$form.Controls.Add($logPathLabel)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Point 20 872
$logBox.Size = New-Size 920 130
$logBox.Anchor = "Top,Bottom,Left,Right"
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.BorderStyle = "FixedSingle"
$logBox.BackColor = [System.Drawing.Color]::FromArgb(8, 10, 14)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(220, 225, 235)
$logBox.Font = New-Object System.Drawing.Font -ArgumentList "Consolas", 9
$form.Controls.Add($logBox)

$btnOpenLogs = New-Button "Open Logs Folder" 20 1020 150 34 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$btnOpenData = New-Button "Open Data Folder" 180 1020 150 34 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$btnClearPanelLog = New-Button "Clear Panel Log" 340 1020 145 34 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$form.Controls.AddRange(@($btnOpenLogs, $btnOpenData, $btnClearPanelLog))

function Load-EmailSettingsIntoForm {
  $settings = Get-EmailSettings
  $txtAlertEmail.Text = $settings.AlertEmail
  $txtSmtpEmail.Text = $settings.SmtpEmail
  $txtAppPassword.Text = ""
  $chkAutoEmail.Checked = [bool]$settings.AutoEmailAlerts
  $txtBackupDir.Text = if ([string]::IsNullOrWhiteSpace($settings.BackupDir)) { $script:DefaultBackupDir } else { $settings.BackupDir }

  if (Test-EmailSettingsConfigured $settings) {
    Set-EmailStatus "Gmail saved. Leave App Password blank to keep the saved password." $false
  }
  else {
    Set-EmailStatus "Enter Gmail settings, then click Save Gmail or Send URL Now." $false
  }
}

function Save-EmailSettingsFromForm {
  Save-EmailSettings `
    -AlertEmail $txtAlertEmail.Text `
    -SmtpEmail $txtSmtpEmail.Text `
    -AppPasswordPlainText $txtAppPassword.Text `
    -AutoEmailAlerts $chkAutoEmail.Checked

  $txtAppPassword.Text = ""
  $script:LastKnownLanUrl = $null
  $script:LastAlertSignature = $null
  $script:LastAlertAt = $null
  Set-EmailStatus "Gmail saved. Email body will contain only the LAN URL." $false
}

function Save-BackupSettingsFromForm {
  $folder = $txtBackupDir.Text.Trim()
  if ([string]::IsNullOrWhiteSpace($folder)) {
    $folder = $script:DefaultBackupDir
  }
  Save-BackupSettings -BackupDir $folder
  $txtBackupDir.Text = $folder
  Set-BackupStatus "Backup folder saved: $folder" $false
}

function Update-Panel {
  try {
    $status = Get-ServerStatus
    $urlText = Get-LanUrlText
    $urlBox.Text = $urlText

    if ($status.Running -and $status.Health) {
      $statusDot.ForeColor = [System.Drawing.Color]::FromArgb(39, 174, 96)
      $statusText.Text = "Running"
      $healthText.Text = "Health: $($status.Health)"
    }
    elseif ($status.Running) {
      $statusDot.ForeColor = [System.Drawing.Color]::FromArgb(245, 158, 11)
      $statusText.Text = "Starting or unhealthy"
      $healthText.Text = "Health: waiting for /api/health"
    }
    else {
      $statusDot.ForeColor = [System.Drawing.Color]::FromArgb(239, 68, 68)
      $statusText.Text = "Stopped"
      $healthText.Text = "Health: offline"
    }

    if ($status.Pid) {
      $pidText.Text = "PID: $($status.Pid)  Process: $($status.ProcessName)  Port: $script:Port"
    }
    else {
      $pidText.Text = "PID: -  Port: $script:Port"
    }

    $logBox.Text = Get-LogText
    $logPathLabel.Text = "Log file: $script:LastLogPath"
    $logBox.SelectionStart = $logBox.Text.Length
    $logBox.ScrollToCaret()
    Invoke-AutomaticEmailAlert -Status $status -UrlText $urlText
  }
  catch {
    Write-PanelLog "Panel refresh error: $($_.Exception.Message)"
  }
}

$btnStart.Add_Click({
  try {
    Start-PosServer
    Start-Sleep -Milliseconds 800
    Update-Panel
  }
  catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Start failed", "OK", "Error") | Out-Null
  }
})

$btnStop.Add_Click({
  try {
    Stop-PosServer
    Start-Sleep -Milliseconds 800
    Update-Panel
  }
  catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Stop failed", "OK", "Error") | Out-Null
  }
})

$btnRestart.Add_Click({
  try {
    Stop-PosServer
    Start-Sleep -Seconds 1
    Start-PosServer
    Start-Sleep -Milliseconds 800
    Update-Panel
  }
  catch {
    [System.Windows.Forms.MessageBox]::Show($_.Exception.Message, "Restart failed", "OK", "Error") | Out-Null
  }
})

$btnOpenLocal.Add_Click({ Open-Url "http://127.0.0.1:$script:Port" })
$btnOpenLan.Add_Click({ Open-Url $script:CurrentLanUrl })

$btnCopyLan.Add_Click({
  if ($script:CurrentLanUrl) {
    [System.Windows.Forms.Clipboard]::SetText($script:CurrentLanUrl)
    Write-PanelLog "Copied LAN URL: $script:CurrentLanUrl"
  }
})

$btnRefresh.Add_Click({ Update-Panel })
$btnOpenLogs.Add_Click({ Start-Process $script:LogDir })
$btnOpenData.Add_Click({ Start-Process (Join-Path $script:ProjectDir "data") })

$btnClearPanelLog.Add_Click({
  Set-Content -Path $script:PanelLogPath -Value "" -Encoding utf8
  Update-Panel
})

$btnSaveEmail.Add_Click({
  try {
    Save-EmailSettingsFromForm
    Update-Panel
  }
  catch {
    Write-PanelLog "Save Gmail failed: $($_.Exception.Message)"
    Set-EmailStatus "Save Gmail failed: $($_.Exception.Message)" $true
  }
})

$btnSendUrlEmail.Add_Click({
  try {
    Save-EmailSettingsFromForm
    Send-CurrentUrlEmail -Reason "Manual button"
    Set-EmailStatus "URL sent to Gmail: $script:CurrentLanUrl" $false
  }
  catch {
    Write-PanelLog "Send URL failed: $($_.Exception.Message)"
    Set-EmailStatus "Send URL failed: $($_.Exception.Message)" $true
  }
})

$btnChooseBackupDir.Add_Click({
  try {
    $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
    $dialog.Description = "Choose backup folder"
    $dialog.SelectedPath = $txtBackupDir.Text
    if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
      $txtBackupDir.Text = $dialog.SelectedPath
      Save-BackupSettingsFromForm
    }
  }
  catch {
    Write-PanelLog "Choose backup folder failed: $($_.Exception.Message)"
    Set-BackupStatus "Choose folder failed: $($_.Exception.Message)" $true
  }
})

$btnBackupNow.Add_Click({
  try {
    Save-BackupSettingsFromForm
    $backup = New-LocalBackup "manual"
    Set-BackupStatus "Backup created: $backup" $false
  }
  catch {
    Write-PanelLog "Backup failed: $($_.Exception.Message)"
    Set-BackupStatus "Backup failed: $($_.Exception.Message)" $true
  }
})

$btnRestoreBackup.Add_Click({
  try {
    $dialog = New-Object System.Windows.Forms.OpenFileDialog
    $dialog.Title = "Choose POS backup ZIP"
    $dialog.Filter = "POS backup (*.zip)|*.zip|All files (*.*)|*.*"
    $dialog.InitialDirectory = Get-BackupDir
    if ($dialog.ShowDialog() -ne [System.Windows.Forms.DialogResult]::OK) {
      return
    }

    $confirm = [System.Windows.Forms.MessageBox]::Show(
      "Restore this backup? A safety backup of current data will be created first.",
      "Restore backup",
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )
    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
      return
    }

    Restore-LocalBackup -BackupFile $dialog.FileName
    Set-BackupStatus "Backup restored: $($dialog.FileName)" $false
    Update-Panel
  }
  catch {
    Write-PanelLog "Restore failed: $($_.Exception.Message)"
    Set-BackupStatus "Restore failed: $($_.Exception.Message)" $true
  }
})

$btnCheckUpdate.Add_Click({
  try {
    $status = Get-GitUpdateStatus
    Set-UpdateStatus $status $false
  }
  catch {
    Write-PanelLog "Check update failed: $($_.Exception.Message)"
    Set-UpdateStatus "Check update failed: $($_.Exception.Message)" $true
  }
})

$btnPullUpdate.Add_Click({
  try {
    $confirm = [System.Windows.Forms.MessageBox]::Show(
      "Update from GitHub now? The panel will backup current data, pull latest code, build, and restart the server.",
      "GitHub update",
      [System.Windows.Forms.MessageBoxButtons]::YesNo,
      [System.Windows.Forms.MessageBoxIcon]::Question
    )
    if ($confirm -ne [System.Windows.Forms.DialogResult]::Yes) {
      return
    }

    Set-UpdateStatus "Updating... see data/logs/update.log" $false
    Invoke-GitHubUpdate
    Set-UpdateStatus "Update complete: $(Get-Date -Format "HH:mm:ss")" $false
    Update-Panel
  }
  catch {
    Write-PanelLog "Update failed: $($_.Exception.Message)"
    Set-UpdateStatus "Update failed: $($_.Exception.Message)" $true
  }
})

$btnOpenUpdateLog.Add_Click({
  if (-not (Test-Path $script:UpdateLogPath)) {
    New-Item -ItemType File -Force $script:UpdateLogPath | Out-Null
  }
  Start-Process notepad.exe $script:UpdateLogPath
})

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2500
$timer.Add_Tick({ Update-Panel })

$form.Add_Shown({
  Write-PanelLog "Control panel opened."
  Load-EmailSettingsIntoForm
  Update-Panel
  $timer.Start()
})

$form.Add_FormClosing({
  $timer.Stop()
  Write-PanelLog "Control panel closed."
})

if ($ValidateOnly) {
  Load-EmailSettingsIntoForm
  Update-Panel
  Write-Host "Local POS Control Panel UI initialized successfully."
  $form.Dispose()
  exit 0
}

[void][System.Windows.Forms.Application]::Run($form)
