param(
  [Parameter(Mandatory = $true)][string]$InstallDirectory
)

$ErrorActionPreference = "Stop"
$TaskName = "PizzaAndRollPrintAgent"
$NodePath = Join-Path $InstallDirectory "node.exe"
$AgentPath = Join-Path $InstallDirectory "agent.mjs"
$EnvPath = Join-Path $InstallDirectory ".env"

$Action = New-ScheduledTaskAction `
  -Execute $NodePath `
  -Argument "--env-file=`"$EnvPath`" `"$AgentPath`"" `
  -WorkingDirectory $InstallDirectory
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Settings = New-ScheduledTaskSettingsSet `
  -RestartCount 999 `
  -RestartInterval (New-TimeSpan -Minutes 1) `
  -ExecutionTimeLimit (New-TimeSpan -Days 3650) `
  -StartWhenAvailable
$Principal = New-ScheduledTaskPrincipal `
  -UserId "SYSTEM" `
  -LogonType ServiceAccount `
  -RunLevel Highest

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $Action `
  -Trigger $Trigger `
  -Settings $Settings `
  -Principal $Principal `
  -Description "Agente de impresión Pizza and Roll" `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
