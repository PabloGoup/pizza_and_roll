param(
  [Parameter(Mandatory = $true)][string]$AgentName,
  [Parameter(Mandatory = $true)][string]$AgentToken,
  [Parameter(Mandatory = $true)][string]$SupabaseUrl,
  [Parameter(Mandatory = $true)][string]$SupabaseAnonKey,
  [string]$RepositoryBase = "https://raw.githubusercontent.com/PabloGoup/pizza_and_roll/main/print-agent"
)

$ErrorActionPreference = "Stop"
$InstallDirectory = Join-Path $env:ProgramData "PizzaAndRollPrintAgent"
$TaskName = "PizzaAndRollPrintAgent"

function Get-NodePath {
  $node = Get-Command node -ErrorAction SilentlyContinue
  if ($node) { return $node.Source }

  $winget = Get-Command winget -ErrorAction SilentlyContinue
  if (-not $winget) {
    throw "No se encontró Node.js ni Windows Package Manager. Instala Node.js LTS y vuelve a abrir este instalador."
  }

  Write-Host "Instalando el componente de ejecución..."
  & winget install OpenJS.NodeJS.LTS --silent --accept-package-agreements --accept-source-agreements
  $machinePath = [Environment]::GetEnvironmentVariable("Path", "Machine")
  $userPath = [Environment]::GetEnvironmentVariable("Path", "User")
  $env:Path = "$machinePath;$userPath"
  return (Get-Command node -ErrorAction Stop).Source
}

New-Item -ItemType Directory -Force -Path $InstallDirectory | Out-Null

$Files = @(
  "agent.mjs",
  "windows-raw-print.ps1",
  "package.json"
)

foreach ($file in $Files) {
  Invoke-WebRequest `
    -UseBasicParsing `
    -Uri "$RepositoryBase/$file" `
    -OutFile (Join-Path $InstallDirectory $file)
}

$EnvContent = @"
PRINT_AGENT_SUPABASE_URL=$SupabaseUrl
PRINT_AGENT_SUPABASE_ANON_KEY=$SupabaseAnonKey
PRINT_AGENT_NAME=$AgentName
PRINT_AGENT_TOKEN=$AgentToken
PRINT_AGENT_PRINTER=
PRINT_AGENT_POLL_MS=800
PRINT_AGENT_LOG_FILE=$InstallDirectory\print-agent.log
"@
[System.IO.File]::WriteAllText((Join-Path $InstallDirectory ".env"), $EnvContent)

$NodePath = Get-NodePath
$NpmPath = Join-Path (Split-Path $NodePath) "npm.cmd"
& $NpmPath install --omit=dev --prefix $InstallDirectory

$Action = New-ScheduledTaskAction `
  -Execute $NodePath `
  -Argument "--env-file=`"$InstallDirectory\.env`" `"$InstallDirectory\agent.mjs`"" `
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
  -Description "Agente de impresión de comandas Pizza & Roll" `
  -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName
Write-Host ""
Write-Host "Computador vinculado correctamente. Ya puedes cerrar esta ventana."
Start-Sleep -Seconds 5
