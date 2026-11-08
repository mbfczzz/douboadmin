param([string]$LocalAddress = '192.168.1.4')
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $projectRoot '.runtime'
$resultPath = Join-Path $runtimeDir 'lan-firewall-result.json'
$apiPath = Join-Path $runtimeDir 'doubo-local.exe'
$ruleName = 'Doubo-Local-API-5173'

try {
  if (!(Test-Path -LiteralPath $apiPath)) { throw 'Build the local API first.' }
  $options = @{
    Direction = 'Inbound'; Action = 'Allow'; Enabled = 'True'
    Profile = 'Any'; Program = $apiPath
    LocalAddress = $LocalAddress; RemoteAddress = 'LocalSubnet'
  }
  if (Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue) {
    Set-NetFirewallRule -Name $ruleName @options | Out-Null
    Get-NetFirewallRule -Name $ruleName | Get-NetFirewallPortFilter |
      Set-NetFirewallPortFilter -Protocol TCP -LocalPort 5173 | Out-Null
  } else {
    New-NetFirewallRule -Name $ruleName -DisplayName 'Doubo API - Local subnet TCP 5173' `
      -Protocol TCP -LocalPort 5173 @options | Out-Null
  }
  @{ok=$true;address=$LocalAddress;port=5173} | ConvertTo-Json |
    Set-Content -LiteralPath $resultPath -Encoding UTF8
} catch {
  @{ok=$false;message='Windows denied or could not apply the local API firewall rule.'} |
    ConvertTo-Json | Set-Content -LiteralPath $resultPath -Encoding UTF8
  exit 1
}
