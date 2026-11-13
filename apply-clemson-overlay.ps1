# Apply tracked UI extensions without reinstalling dependencies or changing Basic.
param([string]$TargetPath = '')
$ErrorActionPreference = 'Stop'
$appPath = if ($TargetPath) { [IO.Path]::GetFullPath($TargetPath) } else { Join-Path $PSScriptRoot 'dashboard/unitree_ui' }
$utf8 = New-Object System.Text.UTF8Encoding($false)
$overlayFiles = Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'dashboard/overlay') -File | Sort-Object Name
$buildMaterial = ($overlayFiles | ForEach-Object { $_.Name + ':' + (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash }) -join "`n"
$buildMaterial += "`napply-overlay:" + (Get-FileHash -LiteralPath $PSCommandPath -Algorithm SHA256).Hash
$buildHasher = [Security.Cryptography.SHA256]::Create()
try { $buildId = ([BitConverter]::ToString($buildHasher.ComputeHash($utf8.GetBytes($buildMaterial)))).Replace('-', '').Substring(0, 8).ToLowerInvariant() }
finally { $buildHasher.Dispose() }
if (-not (Test-Path -LiteralPath (Join-Path $appPath '.clemson-base-revision'))) {
    throw 'Create the Clemson starter with setup-ui.ps1 first.'
}
foreach ($name in @('clemson.css', 'clemson-preview.ts', 'camera-start.ts', 'gesture-robot.ts', 'scene-controls.ts', 'session-format.ts', 'session-recorder.ts', 'recording-ui.ts', 'replay.ts', 'replay.css')) {
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot "dashboard/overlay/$name") -Destination (Join-Path $appPath "src/ui/$name") -Force
}
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dashboard/overlay/replay.html') -Destination (Join-Path $appPath 'replay.html') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dashboard/overlay/lab-guide.html') -Destination (Join-Path $appPath 'public/lab-guide.html') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dashboard/overlay/connection-panel.ts') -Destination (Join-Path $appPath 'src/ui/connection-panel.ts') -Force
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dashboard/overlay/bt-backend.ts') -Destination (Join-Path $appPath 'src/api/bt-backend.ts') -Force

# Restrict Clemson navigation at the rendering layer, rather than merely hiding menus.
$appFile = Join-Path $appPath 'src/ui/app.ts'
$appText = [IO.File]::ReadAllText($appFile)
if (-not $appText.Contains("import { gestureRobot } from './gesture-robot';")) {
    $appText = "import { gestureRobot } from './gesture-robot';`n" + $appText
}
if (-not $appText.Contains("import { mountSceneControls } from './scene-controls';")) {
    $appText = "import { mountSceneControls } from './scene-controls';`n" + $appText
}
$appText = $appText.Replace("import { ConnectionPanel } from './connection-panel';", "import { ConnectionPanel, getClemsonAesKey, clearClemsonAesKey } from './connection-panel';")
$landing = @'
  private showLandingScreen(): void {
    this.showConnectionScreen();
  }
'@
$hub = @'
  private showHubScreen(): void {
    this.showControlUi();
  }
'@
$control = @'
  private showControlUi(): void {
    this.currentScreen = 'control';
    this.root.innerHTML = '';
    this.root.className = 'app-root control-screen';
    this.btStatusIcon?.setVisible(false);
    this.themeToggle?.setVisible(false);
    this.accountStatusIcon?.setVisible(false);
    this.errorsBadgeFloating?.setVisible(false);
    this.controlUi = document.createElement('div');
    this.controlUi.className = 'control-overlay';
    this.root.appendChild(this.controlUi);
    const header = document.createElement('header');
    header.className = 'clemson-webview-header';
    const heading = document.createElement('strong');
    heading.textContent = 'Clemson Go2 / Camera + Voxels';
    const buildLabel = document.createElement('small');
    buildLabel.className = 'clemson-ui-build';
    buildLabel.textContent = 'Navigation | UI __CLEMSON_BUILD__';
    heading.appendChild(buildLabel);
    const disconnect = document.createElement('button');
    disconnect.textContent = 'Disconnect';
    disconnect.addEventListener('click', () => this.disconnect());
    const headerActions = document.createElement('div');
    headerActions.className = 'clemson-header-actions';
    headerActions.appendChild(disconnect);
    header.append(heading, headerActions);
    this.controlUi.appendChild(header);
    this.pipCamera = new PipCamera(this.controlUi);
    if (this.videoStream) this.pipCamera.setStream(this.videoStream);
    this.pipCamera.setOnTap(() => this.toggleViewMode());
    const stop = document.createElement('button');
    stop.textContent = 'Stop';
    stop.className = 'clemson-navigation-stop';
    stop.addEventListener('click', () => void gestureRobot.disable('Stopped by operator'));
    headerActions.appendChild(stop);
    gestureRobot.bind(message => this.webrtc?.send(message), () => this.webrtc?.getState() === 'connected');
    mountSceneControls(headerActions);
    if (this.videoStream) gestureRobot.watchVideo(this.videoStream);
    void this.init3DScene();
  }
'@
$control = $control.Replace('__CLEMSON_BUILD__', $buildId)
foreach ($patch in @(@('showLandingScreen', $landing), @('showHubScreen', $hub), @('showControlUi', $control))) {
    $pattern = '(?ms)^  private ' + $patch[0] + '\(\): void \{.*?^  \}\r?\n'
    if (-not [regex]::IsMatch($appText, $pattern)) { throw "Web view patch no longer matches: $($patch[0])" }
    $appText = [regex]::Replace($appText, $pattern, $patch[1] + "`n")
}
$appText = $appText.Replace('this.btStatusIcon?.setVisible(true); this.themeToggle?.setVisible(true);', 'this.btStatusIcon?.setVisible(false); this.themeToggle?.setVisible(false);')
$appText = $appText.Replace('this.accountStatusIcon?.setVisible(true);', 'this.accountStatusIcon?.setVisible(false);')
# Feed robot data into the gesture adapter as well as the original renderer.
$appText = $appText.Replace('this.dataHandler.onTopicData = (msg) => this.handleTopicMessage(msg);', 'this.dataHandler.onTopicData = (msg) => { gestureRobot.receive(msg); this.handleTopicMessage(msg); };')
if (-not $appText.Contains('gestureRobot.watchVideo(stream);')) {
    $appText = $appText.Replace('this.videoStream = stream;', 'this.videoStream = stream; gestureRobot.watchVideo(stream);')
}
# Await the guarded stop before closing a live connection. Re-entry is ignored.
$appText = $appText.Replace('private disconnect(): void {', 'private async disconnect(): Promise<void> {')
if (-not $appText.Contains('private clemsonDisconnecting = false;')) {
    $appText = $appText.Replace('export class App {', 'export class App { private clemsonDisconnecting = false;')
    $appText = $appText.Replace('    const wasRemote = this.connectionConfig?', "    if (this.clemsonDisconnecting) return;`n    this.clemsonDisconnecting = true;`n    await gestureRobot.disable('Disconnect requested');`n    gestureRobot.detach();`n    const wasRemote = this.connectionConfig?")
    $appText = $appText.Replace('    void wasRemote;', '    this.clemsonDisconnecting = false; void wasRemote;')
}
# The Clemson flow never restores a cloud session or opens the stock key modal.
$appText = $appText.Replace('if (cloudApi.loadSession()) {', 'if (false) {')
$keyPrompt = @'
promptKey: async (_sn, opts) => {
            if (opts?.previousKeyFailed) throw new Error('Incorrect AES key. Enter the key again.');
            const key = getClemsonAesKey();
            if (!key) throw new Error('Enter the AES key before connecting.');
            return key;
          },
'@
$appText = $appText.Replace('promptKey: (sn, opts) => promptAesKey(sn, opts),', $keyPrompt.Trim())
$appText = $appText.Replace('this.connectionConfig = null;', 'clearClemsonAesKey(); this.connectionConfig = null;')
# Avoid accumulating this insertion when overlays are reapplied.
$appText = $appText.Replace('clearClemsonAesKey(); clearClemsonAesKey();', 'clearClemsonAesKey();')
[IO.File]::WriteAllText($appFile, $appText, $utf8)

# This edition does not persist keys. Also redact upstream's raw-key debug logs.
$cacheFile = Join-Path $appPath 'src/api/aes-key-derive.ts'
$cacheText = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'upstream/unitree_ui/src/api/aes-key-derive.ts'))
$cacheText = [regex]::Replace($cacheText, '(?ms)^function readCache\(\): Cache \{.*?^\}', 'function readCache(): Cache { return {}; }')
$cacheText = [regex]::Replace($cacheText, '(?ms)^function writeCache\(cache: Cache\): void \{.*?^\}', 'function writeCache(cache: Cache): void { void cache; }')
[IO.File]::WriteAllText($cacheFile, $cacheText, $utf8)
$connectorFile = Join-Path $appPath 'src/connection/local-connector.ts'
$connectorText = [IO.File]::ReadAllText($connectorFile)
$connectorText = $connectorText.Replace(', key=${aesHex}', '').Replace('cached for next time', 'session only').Replace('cached for SN', 'session key for SN')
[IO.File]::WriteAllText($connectorFile, $connectorText, $utf8)
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'dashboard/overlay/lab-guide.html') -Destination (Join-Path $appPath 'public/lab-guide.html') -Force
$main = Join-Path $appPath 'src/main.ts'
$text = [IO.File]::ReadAllText($main)
if (-not $text.Contains("import './ui/clemson-preview';")) {
    [IO.File]::WriteAllText($main, $text + "`nimport './ui/clemson-preview';`n", $utf8)
}
$config = Join-Path $appPath 'vite.config.ts'
$text = [IO.File]::ReadAllText($config)
if (-not $text.Contains("input: { app: 'index.html', replay: 'replay.html' }")) {
    $text = $text.Replace("    outDir: 'dist',", "    outDir: 'dist',`n    rollupOptions: { input: { app: 'index.html', replay: 'replay.html' } },")
}
if (-not $text.Contains("'/gesture-api'")) {
    $anchor = "      '/ble-api/ws': {"
    if (-not $text.Contains($anchor)) { throw 'Gesture proxy patch no longer matches upstream' }
    $proxy = @"
      '/gesture-api': {
        target: 'http://127.0.0.1:8766',
        rewrite: (path) => path.replace(/^\/gesture-api/, ''),
      },
"@
    $text = $text.Replace($anchor, "$proxy`n$anchor")
}
# Clemson never connects to the optional Python BLE relay on port 5051.
$text = [regex]::Replace($text, "(?ms)^      '/ble-api/ws': \{.*?^      \},\r?\n", '')
[IO.File]::WriteAllText($config, $text, $utf8)
& (Join-Path $PSScriptRoot 'apply-voxel-replay.ps1') -TargetPath $appPath
$buildManifest = @{ui_build=$buildId; gesture_pose=$false; camera_tint=$false} | ConvertTo-Json -Compress
[IO.File]::WriteAllText((Join-Path $appPath 'public/clemson-build.json'), $buildManifest, $utf8)
Write-Host "Clemson UI build $buildId applied. Stationary control deferred. Control starts disabled."
