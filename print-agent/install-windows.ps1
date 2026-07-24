param(
  [string]$TaskName = "PizzaAndRollPrintAgent"
)

$ErrorActionPreference = "Stop"
$AgentDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectDirectory = Split-Path -Parent $AgentDirectory
$EnvFile = Join-Path $AgentDirectory ".env"
$AgentFile = Join-Path $AgentDirectory "agent.mjs"

if (-not (Test-Path $EnvFile)) {
  throw "Falta $EnvFile. Copia .env.example a .env y completa sus valores."
}

$NodePath = (Get-Command node -ErrorAction Stop).Source
$Action = New-ScheduledTaskAction `
  -Execute $NodePath `
  -Argument "--env-file=`"$EnvFile`" `"$AgentFile`"" `
  -WorkingDirectory $ProjectDirectory
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
  -Description "Agente RAW de comandas Pizza & Roll" `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host "Agente instalado e iniciado como tarea de sistema: $TaskName"
