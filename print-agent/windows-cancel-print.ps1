param(
  [Parameter(Mandatory = $true)][string]$PrinterName,
  [Parameter(Mandatory = $true)][string]$RequestFile
)
$ErrorActionPreference = 'Stop'
$request = Get-Content -LiteralPath $RequestFile -Raw | ConvertFrom-Json
function MatchesRequest($job) {
  if ($null -eq $request.jobIds) {
    # Include the exact document name used by older versions of this agent.
    return ($job.DocumentName -like 'PizzaAndRoll:*' -or $job.DocumentName -eq 'Comanda cocina')
  }
  return @($request.jobIds | Where-Object { $job.DocumentName -eq "PizzaAndRoll:$_" }).Count -gt 0
}
if ($null -ne $request.jobIds -and @(Get-PrintJob -PrinterName $PrinterName | Where-Object { $_.DocumentName -eq 'Comanda cocina' }).Count -gt 0) {
  throw 'Hay documentos de una versión anterior sin identificador. Usa Vaciar cola de impresión para retirarlos.'
}
$jobs = @(Get-PrintJob -PrinterName $PrinterName | Where-Object { MatchesRequest $_ })
foreach ($job in $jobs) {
  Remove-PrintJob -PrinterName $PrinterName -ID $job.ID
}
# Removal can be asynchronous. Do not acknowledge until the spooler confirms it.
for ($attempt = 0; $attempt -lt 20; $attempt++) {
  $remaining = @(Get-PrintJob -PrinterName $PrinterName | Where-Object { MatchesRequest $_ })
  if ($remaining.Count -eq 0) { exit 0 }
  Start-Sleep -Milliseconds 250
}
throw 'Windows no ha confirmado la eliminación de los documentos. Se reintentará la limpieza.'
