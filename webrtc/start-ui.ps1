param([ValidateSet('basic', 'clemson')][string]$Edition = 'basic')
$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ui-source.json') -Raw | ConvertFrom-Json
$nodeFolder = Join-Path $repoRoot ".tools/node-v$($source.nodeVersion)-win-x64"
if ($Edition -eq 'basic') {
    $appPath = Join-Path $PSScriptRoot 'upstream/unitree_ui'
    $port = $source.basicPort
} else {
    $appPath = Join-Path $PSScriptRoot 'clemson/unitree_ui'
    $port = $source.clemsonPort
}
if (-not (Test-Path -LiteralPath (Join-Path $nodeFolder 'npm.cmd')) -or -not (Test-Path -LiteralPath (Join-Path $appPath 'node_modules/vite'))) {
    throw "Run .\webrtc\setup-ui.ps1 -Edition $Edition with internet access first."
}
$env:PATH = "$nodeFolder;$env:PATH"
Write-Host "Open http://127.0.0.1:$port in Chrome. Stop this server with Ctrl+C."
Write-Host 'Connect only one dashboard or Python robot client at a time.'
& (Join-Path $nodeFolder 'npm.cmd') run dev --prefix $appPath -- --host 127.0.0.1 --port $port --strictPort
if ($LASTEXITCODE -ne 0) { throw 'Dashboard server exited with an error; check whether its port is already in use.' }
