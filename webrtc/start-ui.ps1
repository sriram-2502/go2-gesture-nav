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
if ($Edition -eq 'clemson') {
    # Apply tracked changes on launch, before Vite can connect to a robot.
    $probe = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $probe.ConnectAsync('127.0.0.1', [int]$port)
        try { $null = $task.Wait(300) } catch { }
        if ($probe.Connected) { throw "Stop the existing Clemson dashboard on port $port before starting another one." }
    } finally { $probe.Dispose() }
    & (Join-Path $PSScriptRoot 'apply-clemson-overlay.ps1')
}
Write-Host "Open http://127.0.0.1:$port in Chrome. Stop this server with Ctrl+C."
Write-Host 'Connect only one dashboard or Python robot client at a time.'
& (Join-Path $nodeFolder 'npm.cmd') run dev --prefix $appPath -- --host 127.0.0.1 --port $port --strictPort
if ($LASTEXITCODE -ne 0) { throw 'Dashboard server exited with an error; check whether its port is already in use.' }
