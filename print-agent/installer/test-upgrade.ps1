param(
  [Parameter(Mandatory = $true)][string]$InstallerPath
)

$ErrorActionPreference = "Stop"
$InstallDirectory = Join-Path $env:RUNNER_TEMP "Pizza and Roll upgrade test"
$OtherDirectory = Join-Path $env:RUNNER_TEMP "Unrelated Node test"
$TaskName = "PizzaAndRollPrintAgent"
$SourceNode = (Get-Command node.exe -ErrorAction Stop).Source
$NodePath = Join-Path $InstallDirectory "node.exe"
$AgentPath = Join-Path $InstallDirectory "agent.mjs"
$EnvPath = Join-Path $InstallDirectory ".env"
$OtherProcess = $null
$LogPath = Join-Path $env:RUNNER_TEMP "pizza-and-roll-upgrade.log"

try {
  New-Item -ItemType Directory -Force -Path $InstallDirectory, $OtherDirectory | Out-Null
  Copy-Item -LiteralPath $SourceNode -Destination $NodePath
  Set-Content -LiteralPath $AgentPath -Value 'setInterval(() => {}, 1000);'
  $Credentials = @"
PRINT_AGENT_SUPABASE_URL=https://example.invalid
PRINT_AGENT_SUPABASE_ANON_KEY=qa-public-key
PRINT_AGENT_NAME=qa-upgrade
PRINT_AGENT_TOKEN=qa-local-fixture
"@
  Set-Content -LiteralPath $EnvPath -Value $Credentials -Encoding ascii
  $EnvHash = (Get-FileHash -LiteralPath $EnvPath).Hash

  $Action = New-ScheduledTaskAction -Execute $NodePath -Argument "`"$AgentPath`""
  $Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
  Register-ScheduledTask -TaskName $TaskName -Action $Action -Principal $Principal -Force | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  $PreviousProcess = $null
  for ($Attempt = 0; $Attempt -lt 20; $Attempt++) {
    $PreviousProcess = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.ExecutablePath -eq $NodePath }
    if ($PreviousProcess) { break }
    Start-Sleep -Milliseconds 500
  }
  if (-not $PreviousProcess) { throw "The old agent fixture did not start." }

  $Locked = $false
  try {
    $Handle = [IO.File]::Open($NodePath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    $Handle.Dispose()
  } catch { $Locked = $true }
  if (-not $Locked) { throw "The test did not reproduce the locked node.exe." }

  $OtherNode = Join-Path $OtherDirectory "node.exe"
  $OtherAgent = Join-Path $OtherDirectory "agent.mjs"
  Copy-Item -LiteralPath $SourceNode -Destination $OtherNode
  Set-Content -LiteralPath $OtherAgent -Value 'setInterval(() => {}, 1000);'
  $OtherProcess = Start-Process -FilePath $OtherNode -ArgumentList "`"$OtherAgent`"" -PassThru

  $Installer = Start-Process -FilePath (Resolve-Path $InstallerPath).Path -ArgumentList @(
    '/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART',
    "/DIR=`"$InstallDirectory`"", "/LOG=`"$LogPath`""
  ) -Wait -PassThru
  if ($Installer.ExitCode -ne 0) {
    throw "Upgrade failed with exit code $($Installer.ExitCode). See $LogPath."
  }
  if ((Get-FileHash -LiteralPath $EnvPath).Hash -ne $EnvHash) {
    throw "Upgrade changed the existing pairing credentials."
  }
  if (-not (Test-Path (Join-Path $InstallDirectory 'cash-document.mjs'))) {
    throw "The upgraded installation is missing the cash receipt renderer."
  }
  if ($OtherProcess.HasExited) { throw "Upgrade stopped an unrelated Node process." }
  $Task = Get-ScheduledTask -TaskName $TaskName
  if ($Task.State -eq "Disabled") { throw "Upgrade left the agent task disabled." }
  if ($Task.Actions.Arguments -notlike '*--env-file=*') {
    throw "Upgrade did not register the current agent command."
  }
  $CurrentProcess = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object { $_.ExecutablePath -eq $NodePath }
  if (-not $CurrentProcess) { throw "The upgraded agent did not start." }
  Write-Host "PASS: locked executable upgraded, pairing preserved, agent restarted, unrelated Node process retained."
} finally {
  if ($OtherProcess -and -not $OtherProcess.HasExited) {
    Stop-Process -InputObject $OtherProcess -Force
    $OtherProcess.WaitForExit(10000) | Out-Null
  }
  & "$PSScriptRoot/stop-agent.ps1" -InstallDirectory $InstallDirectory
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $InstallDirectory, $OtherDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
