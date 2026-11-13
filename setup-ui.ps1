param([ValidateSet('basic', 'clemson', 'all')][string]$Edition = 'clemson')
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repoRoot = $PSScriptRoot
$source = Get-Content -LiteralPath (Join-Path $PSScriptRoot 'ui-source.json') -Raw | ConvertFrom-Json
$toolsPath = Join-Path $repoRoot '.tools'
$nodeFolder = Join-Path $toolsPath "node-v$($source.nodeVersion)-win-x64"
$basicPath = Join-Path $PSScriptRoot 'upstream/unitree_ui'
$clemsonPath = Join-Path $PSScriptRoot 'dashboard/unitree_ui'
$utf8 = New-Object System.Text.UTF8Encoding($false)

# npm ci replaces dependencies; Windows locks esbuild while a server is running.
$ports = if ($Edition -eq 'basic') { @($source.basicPort) } elseif ($Edition -eq 'clemson') { @($source.clemsonPort) } else { @($source.basicPort, $source.clemsonPort) }
foreach ($port in $ports) {
    $probe = New-Object System.Net.Sockets.TcpClient
    try {
        $task = $probe.ConnectAsync('127.0.0.1', [int]$port)
        try { $null = $task.Wait(300) } catch { }
        if ($probe.Connected) { throw "Stop the dashboard on port $port with Ctrl+C before running setup again." }
    } finally { $probe.Dispose() }
}

function Invoke-GitChecked {
    param([string[]]$GitArguments)
    & git -c "safe.directory=$($basicPath.Replace('\', '/'))" @GitArguments
    if ($LASTEXITCODE -ne 0) { throw "Git failed: $($GitArguments -join ' ')" }
}

if (-not (Test-Path -LiteralPath (Join-Path $nodeFolder 'node.exe'))) {
    if (-not [Environment]::Is64BitOperatingSystem -or $env:PROCESSOR_ARCHITECTURE -eq 'ARM64') {
        throw 'This portable runtime setup supports Windows x64. Use an x64 Windows PC.'
    }
    New-Item -ItemType Directory -Path $toolsPath -Force | Out-Null
    $filename = "node-v$($source.nodeVersion)-win-x64.zip"
    $downloadPath = Join-Path $toolsPath $filename
    $baseUrl = "https://nodejs.org/dist/v$($source.nodeVersion)"
    Write-Host "Downloading workspace-local Node.js $($source.nodeVersion)..."
    Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/$filename" -OutFile $downloadPath
    $checksums = (Invoke-WebRequest -UseBasicParsing -Uri "$baseUrl/SHASUMS256.txt").Content
    $line = $checksums -split "`n" | Where-Object { $_.Trim().EndsWith("  $filename") } | Select-Object -First 1
    if (-not $line) { throw 'Official Node.js checksum missing' }
    $expected = ($line.Trim() -split '\s+')[0]
    if ((Get-FileHash -LiteralPath $downloadPath -Algorithm SHA256).Hash -ne $expected) {
        throw 'Node.js SHA-256 verification failed'
    }
    Expand-Archive -LiteralPath $downloadPath -DestinationPath $toolsPath
}
$env:PATH = "$nodeFolder;$env:PATH"
$npm = Join-Path $nodeFolder 'npm.cmd'

if (-not (Test-Path -LiteralPath $basicPath)) {
    Invoke-GitChecked -GitArguments @('clone', $source.repository, $basicPath)
    Invoke-GitChecked -GitArguments @('-C', $basicPath, 'checkout', '--detach', $source.revision)
}
$actualRevision = Invoke-GitChecked -GitArguments @('-C', $basicPath, 'rev-parse', 'HEAD')
if ($actualRevision.Trim() -ne $source.revision) {
    throw 'Upstream checkout differs from ui-source.json. Preserve your changes and review the revision before continuing.'
}

$targets = @()
if ($Edition -in @('basic', 'all')) { $targets += $basicPath }
if ($Edition -in @('clemson', 'all')) {
    if (-not (Test-Path -LiteralPath $clemsonPath)) {
        # Build a clean, reproducible source copy; preserve the upstream LICENSE.
        $archive = Join-Path $toolsPath 'unitree-ui-source.zip'
        Invoke-GitChecked -GitArguments @('-C', $basicPath, 'archive', '--format=zip', '--output', $archive, $source.revision)
        Expand-Archive -LiteralPath $archive -DestinationPath $clemsonPath
        $appPath = Join-Path $clemsonPath 'src/ui/app.ts'
        $app = [IO.File]::ReadAllText($appPath)
        $needle = "title.textContent = 'Unitree UI';"
        if (-not $app.Contains($needle)) { throw 'Clemson title patch no longer matches upstream' }
        [IO.File]::WriteAllText($appPath, $app.Replace($needle, "title.textContent = 'Clemson Go2 Lab';"), $utf8)
        $htmlPath = Join-Path $clemsonPath 'index.html'
        [IO.File]::WriteAllText($htmlPath, ([IO.File]::ReadAllText($htmlPath)).Replace('<title>Unitree UI</title>', '<title>Clemson Go2 Lab</title>'), $utf8)
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dashboard/overlay/clemson.css') -Destination (Join-Path $clemsonPath 'src/ui/clemson.css')
        $mainPath = Join-Path $clemsonPath 'src/main.ts'
        [IO.File]::WriteAllText($mainPath, ([IO.File]::ReadAllText($mainPath)) + "`nimport './ui/clemson.css';`n", $utf8)
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dashboard/overlay/lab-guide.html') -Destination (Join-Path $clemsonPath 'public/lab-guide.html')
        # Add the lab guide to the landing page; the robot-control code stays upstream.
        $app = [IO.File]::ReadAllText($appPath)
        $guide = @"
    const labGuide = document.createElement('a');
    labGuide.className = 'clemson-lab-guide';
    labGuide.href = '/lab-guide.html';
    labGuide.target = '_blank';
    labGuide.rel = 'noopener';
    labGuide.textContent = 'Windows setup and Creative Inquiry roadmap';
    wrap.appendChild(labGuide);
"@
        $anchor = '    wrap.appendChild(tiles);'
        if (-not $app.Contains($anchor)) { throw 'Clemson guide patch no longer matches upstream' }
        [IO.File]::WriteAllText($appPath, $app.Replace($anchor, "$anchor`n$guide"), $utf8)
        [IO.File]::WriteAllText((Join-Path $clemsonPath '.clemson-base-revision'), $source.revision, $utf8)
    }
    $marker = Join-Path $clemsonPath '.clemson-base-revision'
    if (-not (Test-Path -LiteralPath $marker) -or (Get-Content -LiteralPath $marker -Raw).Trim() -ne $source.revision) {
        throw 'Clemson source is incomplete or based on a different revision. Preserve it before recreating.'
    }
    $targets += $clemsonPath
    & (Join-Path $PSScriptRoot 'apply-clemson-overlay.ps1')
}
foreach ($target in $targets) {
    & $npm ci --prefix $target --cache (Join-Path $toolsPath 'npm-cache') --no-audit --no-fund
    if ($LASTEXITCODE -ne 0) { throw "Dependency installation failed: $target" }
}
Write-Host "Setup complete. Start the gesture service: python -m gesture_preview.server"
Write-Host "In a second terminal, run: .\start-ui.ps1"
