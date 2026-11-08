param(
  [Parameter(Mandatory = $true)][string]$InstallDirectory,
  [switch]$Resume
)

$ErrorActionPreference = "Stop"
$TaskName = "PizzaAndRollPrintAgent"
$NodePath = [IO.Path]::GetFullPath((Join-Path $InstallDirectory "node.exe"))
$AgentPath = [IO.Path]::GetFullPath((Join-Path $InstallDirectory "agent.mjs"))
$Task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

# A machine can run other Node programs. Only stop this installation's agent.
function Test-AgentTask($Candidate) {
  foreach ($Action in $Candidate.Actions) {
    if ($Action.Execute -eq $NodePath -or
        ($Action.Arguments -and $Action.Arguments.IndexOf($AgentPath, [StringComparison]::OrdinalIgnoreCase) -ge 0)) {
      return $true
    }
  }
  return $false
}

if ($Resume) {
  if ($Task -and (Test-AgentTask $Task)) {
    Enable-ScheduledTask -TaskName $TaskName | Out-Null
    if ((Get-ScheduledTask -TaskName $TaskName).State -ne "Running") {
      Start-ScheduledTask -TaskName $TaskName
    }
  }
  exit 0
}

if ($Task -and (Test-AgentTask $Task)) {
  Disable-ScheduledTask -TaskName $TaskName | Out-Null
  Stop-ScheduledTask -TaskName $TaskName
}

$AgentProcesses = Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Where-Object {
  $_.ExecutablePath -eq $NodePath -or
  ($_.CommandLine -and $_.CommandLine.IndexOf($AgentPath, [StringComparison]::OrdinalIgnoreCase) -ge 0)
}
foreach ($AgentProcess in $AgentProcesses) {
  $RunningProcess = Get-Process -Id $AgentProcess.ProcessId -ErrorAction SilentlyContinue
  if ($RunningProcess) {
    Stop-Process -InputObject $RunningProcess -Force
    $RunningProcess.WaitForExit(15000) | Out-Null
    if (-not $RunningProcess.HasExited) {
      throw "No se pudo detener el agente de impresion antes de actualizarlo."
    }
  }
}

if (Test-Path -LiteralPath $NodePath) {
  # Opening for write detects a remaining Windows executable lock before copying.
  $Handle = [IO.File]::Open($NodePath, [IO.FileMode]::Open, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
  $Handle.Dispose()
}
