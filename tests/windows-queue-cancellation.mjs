import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
if (process.platform !== 'win32') {
  console.log('SKIP: PowerShell spooler regression requires Windows');
  process.exit(0);
}
const folder = await mkdtemp(path.join(tmpdir(), 'queue-cancel-test-'));
try {
  const state = path.join(folder, 'jobs.json');
  const request = path.join(folder, 'request.json');
  const script = fileURLToPath(new URL('../print-agent/windows-cancel-print.ps1', import.meta.url));
  const command = `
$ErrorActionPreference = 'Stop'
function Get-PrintJob { param($PrinterName)
  if ($PrinterName -ne 'Caja') { throw 'Wrong printer' }
  foreach ($job in (Get-Content -LiteralPath $env:QA_QUEUE_STATE -Raw | ConvertFrom-Json)) { Write-Output $job }
}
function Remove-PrintJob { param($PrinterName, $ID)
  if ($env:QA_QUEUE_FAIL -eq 'yes') { throw 'Access denied' }
  $jobs = @(Get-PrintJob -PrinterName $PrinterName | Where-Object { $_.ID -ne $ID })
  ConvertTo-Json -InputObject $jobs | Set-Content -LiteralPath $env:QA_QUEUE_STATE
}
& $env:QA_QUEUE_SCRIPT -PrinterName 'Caja' -RequestFile $env:QA_QUEUE_REQUEST
exit $LASTEXITCODE
`;
  const cases = [
    { ids: null, jobs: [{ID:1,DocumentName:'Comanda cocina'},{ID:2,DocumentName:'PizzaAndRoll:a'},{ID:3,DocumentName:'Factura Word'}], remaining:[3], ok:true },
    { ids: ['a'], jobs: [{ID:1,DocumentName:'PizzaAndRoll:a'},{ID:2,DocumentName:'PizzaAndRoll:b'}], remaining:[2], ok:true },
    { ids: ['a'], jobs: [{ID:1,DocumentName:'Comanda cocina'}], remaining:[1], ok:false },
    { ids: null, jobs: [], remaining:[], ok:true },
    { ids: null, jobs: [{ID:1,DocumentName:'PizzaAndRoll:a'}], remaining:[1], ok:false, fail:true },
  ];
  for (const test of cases) {
    await writeFile(state, JSON.stringify(test.jobs));
    await writeFile(request, JSON.stringify({jobIds:test.ids}));
    const result = spawnSync('powershell.exe', ['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-Command',command], {
      encoding:'utf8', env:{...process.env,QA_QUEUE_STATE:state,QA_QUEUE_REQUEST:request,QA_QUEUE_SCRIPT:script,QA_QUEUE_FAIL:test.fail?'yes':'no'},
    });
    assert.equal(result.status === 0, test.ok, result.stderr);
    const remaining = JSON.parse((await readFile(state,'utf8')).replace(/^\uFEFF/,''));
    assert.deepEqual(remaining.map(j=>j.ID), test.remaining);
  }
  console.log('PASS: PowerShell cancellation, legacy documents, individual IDs, unrelated jobs preserved, errors reported');
} finally {
  await rm(folder,{recursive:true,force:true});
}
