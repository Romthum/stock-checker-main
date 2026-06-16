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
$script:PanelLogPath = Join-Path $script:LogDir "control-panel.log"
$script:CurrentLanUrl = $null
$script:LastLogPath = $null

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
$form.Size = New-Size 980 720
$form.MinimumSize = New-Size 860 620
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
$statusDot.Text = "●"
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

$logLabel = New-Label "Server log" 22 410 220 24 12 ([System.Drawing.FontStyle]::Bold)
$form.Controls.Add($logLabel)

$logPathLabel = New-Label "Log file: -" 150 413 790 22 9
$logPathLabel.Anchor = "Top,Left,Right"
$logPathLabel.ForeColor = [System.Drawing.Color]::FromArgb(160, 166, 175)
$form.Controls.Add($logPathLabel)

$logBox = New-Object System.Windows.Forms.TextBox
$logBox.Location = New-Point 20 440
$logBox.Size = New-Size 920 190
$logBox.Anchor = "Top,Bottom,Left,Right"
$logBox.Multiline = $true
$logBox.ScrollBars = "Vertical"
$logBox.ReadOnly = $true
$logBox.BorderStyle = "FixedSingle"
$logBox.BackColor = [System.Drawing.Color]::FromArgb(8, 10, 14)
$logBox.ForeColor = [System.Drawing.Color]::FromArgb(220, 225, 235)
$logBox.Font = New-Object System.Drawing.Font -ArgumentList "Consolas", 9
$form.Controls.Add($logBox)

$btnOpenLogs = New-Button "Open Logs Folder" 20 646 150 34 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$btnOpenData = New-Button "Open Data Folder" 180 646 150 34 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$btnClearPanelLog = New-Button "Clear Panel Log" 340 646 145 34 ([System.Drawing.Color]::FromArgb(82, 92, 110))
$form.Controls.AddRange(@($btnOpenLogs, $btnOpenData, $btnClearPanelLog))

function Update-Panel {
  try {
    $status = Get-ServerStatus
    $urlBox.Text = Get-LanUrlText

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

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2500
$timer.Add_Tick({ Update-Panel })

$form.Add_Shown({
  Write-PanelLog "Control panel opened."
  Update-Panel
  $timer.Start()
})

$form.Add_FormClosing({
  $timer.Stop()
  Write-PanelLog "Control panel closed."
})

if ($ValidateOnly) {
  Update-Panel
  Write-Host "Local POS Control Panel UI initialized successfully."
  $form.Dispose()
  exit 0
}

[void][System.Windows.Forms.Application]::Run($form)
