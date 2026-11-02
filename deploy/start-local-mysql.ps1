$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$configFile = Join-Path $runtimeDir 'mysql.ini'
if (!(Test-Path -LiteralPath $configFile)) { return }
if (Get-NetTCPConnection -LocalPort 13306 -State Listen -ErrorAction SilentlyContinue) { return }
$serverExe = Join-Path $runtimeDir 'mysql/mysql-8.4.13-winx64/bin/mysqld.exe'
if (!(Test-Path -LiteralPath $serverExe)) { throw 'Local MySQL executable is missing; configure MYSQL_DSN for an existing MySQL instead.' }
$dbProcess = Start-Process -FilePath $serverExe -ArgumentList @("--defaults-file=$configFile") -WorkingDirectory $runtimeDir -WindowStyle Hidden -PassThru
$dbProcess.Id | Set-Content -LiteralPath (Join-Path $runtimeDir 'mysql.pid')
for ($attempt=0; $attempt -lt 20; $attempt++) {
  if ($dbProcess.HasExited) { throw 'MySQL failed; inspect .runtime/mysql-error.log' }
  if (Get-NetTCPConnection -LocalPort 13306 -State Listen -ErrorAction SilentlyContinue) { return }
  Start-Sleep -Milliseconds 300
}
throw 'MySQL did not start in time'
