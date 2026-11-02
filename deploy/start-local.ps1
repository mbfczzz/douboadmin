$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
New-Item -ItemType Directory -Path $runtimeDir -Force | Out-Null
foreach ($port in @(8080,5173)) {
  if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
    throw "Port $port is in use. Stop the existing service or choose other ports before starting."
  }
}
Push-Location (Join-Path $projectRoot 'server')
try {
  go build -o (Join-Path $runtimeDir 'doubo-local.exe') ./cmd/server
  if ($LASTEXITCODE -ne 0) { throw 'Go build failed' }
} finally { Pop-Location }
Push-Location (Join-Path $projectRoot 'web')
try {
  if (!(Test-Path 'node_modules')) { npm ci; if ($LASTEXITCODE -ne 0) { throw 'npm ci failed' } }
} finally { Pop-Location }
& (Join-Path $PSScriptRoot 'start-local-mysql.ps1')
& (Join-Path $PSScriptRoot 'start-api.ps1') -Command migrate
$api = & (Join-Path $PSScriptRoot 'start-api.ps1')
$node = (Get-Command node).Source
$web = Start-Process -FilePath $node -ArgumentList @('node_modules/vite/bin/vite.js','--host','127.0.0.1','--strictPort') -WorkingDirectory (Join-Path $projectRoot 'web') -WindowStyle Hidden -RedirectStandardOutput (Join-Path $runtimeDir 'local-web.out.log') -RedirectStandardError (Join-Path $runtimeDir 'local-web.err.log') -PassThru
@{api=$api.Id;web=$web.Id} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $runtimeDir 'local-pids.json')
Write-Host 'Admin: http://127.0.0.1:5173'
Write-Host 'API:   http://127.0.0.1:8080'
Write-Host 'Admin credentials are configured through ADMIN_USER / ADMIN_PASSWORD.'
