param(
  [ValidateSet('serve','migrate')][string]$Command='serve',
  [ValidatePattern('^[A-Za-z0-9_-]+\.exe$')][string]$Binary='doubo-local.exe'
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$binaryPath = Join-Path $runtimeDir $Binary
$envPath = Join-Path $projectRoot '.env.local'
$previous = @{}

try {
  if (Test-Path -LiteralPath $envPath) {
    $lineNumber = 0
    foreach ($line in [System.IO.File]::ReadAllLines($envPath)) {
      $lineNumber++
      if ([string]::IsNullOrWhiteSpace($line) -or $line.TrimStart().StartsWith('#')) { continue }
      if ($line -notmatch '^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$') {
        throw "Invalid .env.local entry at line $lineNumber"
      }
      $key = $Matches[1]
      $value = $Matches[2]
      if ($value.Length -ge 2 -and (
        ($value.StartsWith('"') -and $value.EndsWith('"')) -or
        ($value.StartsWith("'") -and $value.EndsWith("'")))) {
        $value = $value.Substring(1, $value.Length - 2)
      }
      if (!$previous.ContainsKey($key)) {
        $previous[$key] = [Environment]::GetEnvironmentVariable($key, 'Process')
      }
      [Environment]::SetEnvironmentVariable($key, $value, 'Process')
    }
  }
  # Only the API child inherits local credentials; restore before starting Vite.
	if ($Command -eq 'migrate') {
		& $binaryPath migrate
		if ($LASTEXITCODE -ne 0) { throw 'Database migration failed' }
		return
	}
  Start-Process -FilePath $binaryPath `
    -WorkingDirectory (Join-Path $projectRoot 'server') -WindowStyle Hidden `
    -RedirectStandardOutput (Join-Path $runtimeDir 'local-api.out.log') `
    -RedirectStandardError (Join-Path $runtimeDir 'local-api.err.log') -PassThru
} finally {
  foreach ($key in $previous.Keys) {
    [Environment]::SetEnvironmentVariable($key, $previous[$key], 'Process')
  }
}
