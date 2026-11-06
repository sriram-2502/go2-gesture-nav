# Windows 11 dashboard: Basic and Clemson options

Start with the unmodified Basic edition. The Clemson starter uses a separate
source copy and port, keeping the upstream baseline available for comparison.
Neither option needs ROS, WSL, Docker, or the Jetson SSH connection.

## 1. Install while connected to the internet

Prerequisite: Git for Windows. The setup script downloads a workspace-local
Windows x64 Node.js runtime from nodejs.org, verifies its official SHA-256, and
installs the dashboard's locked npm dependencies. It does not install Node system-wide.

In **Windows PowerShell**, from this repository's root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\setup-ui.ps1 -Edition all
```

The execution-policy option applies only to this process; it does not change the
saved Windows policy. Read the local script before running it. Stop any running
dashboard server with Ctrl+C before rerunning setup.

The pinned source and runtime versions are in [ui-source.json](ui-source.json).
The setup generates these ignored local folders:

```text
.tools/                             Portable Node and npm cache
webrtc/upstream/unitree_ui/          Pinned upstream Git checkout
webrtc/clemson/unitree_ui/           Generated Clemson source copy
```

Source URL: <https://github.com/legion1581/unitree_ui>.
Revision: `590baf6ab580d27890c7a7575c138a9080d7d516`.
The upstream MIT license is retained in both editions. To change Clemson code
reproducibly, edit the tracked overlay/setup logic; local generated edits are ignored.
The setup preserves an existing Clemson copy rather than overwriting changes.

## 2. Run Basic first

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\start-ui.ps1 -Edition basic
```

Keep this terminal open. In **Chrome**, open <http://127.0.0.1:5173/>.
The launcher uses Vite directly because the upstream convenience launchers use Bash.
It binds only to loopback. BLE features are not started in this setup; use the
existing Go2 hotspot and assigned AES key.

1. Connect Windows Wi-Fi to the lab Go2 hotspot.
2. Close other robot clients or disconnect them. Have the paired remote available.
3. Choose **Connect**, select **Go2**, and choose **Access Point (Direct)**.
4. Confirm `192.168.12.1`, then connect.
5. If prompted, enter the assigned robot's AES key. Obtain it through the
   [private access arrangement](../docs/KEY_ACCESS.md). The UI does not read the
   Python scripts' environment variable automatically.
6. Keep the robot stationary while checking the camera, battery, state, and voxel view.

Upstream stores manually entered AES keys in browser local storage. Do not include
keys in screenshots or logs. Clear this site's browser storage after use on a shared
computer. Basic and Clemson ports have separate browser storage and may prompt separately.

## 3. Verify features in order

| Check | Evidence to record |
| --- | --- |
| Connection | Robot selected, connection established, state arriving |
| Camera | Live changing image; no frozen frame mistaken for live video |
| Voxels | LiDAR enabled and scene updates when the surroundings change |
| SLAM | Onboard mapping service responds; inspect the existing mapping/localization interface |
| Supervised motion | Robot already stands normally; short command and visually confirmed stop |

Mapping/localization availability depends on the robot's onboard services. The UI
contains these interfaces, but successful connection alone does not verify them.
Do not start autonomous navigation or patrol as part of the first stationary check.
This unchanged upstream UI does not inherit the Python velocity script's limits
or its guarded StopMove/BalanceStand sequence. Keep the remote ready for motion tests.

The **Basic edition** also polls the optional BLE backend. Connection-refused messages
for `127.0.0.1:5051` are expected without BLE and are separate from robot WebRTC errors.
Clemson disables this backend and its proxy; recurring 5051 errors there indicate
an older server/tab is still running. Use the [update/restart workflow](../README.md#update-and-restart).
The development server and its robot proxy are required; a static production
preview alone is not the supported robot-connection workflow here.

## 4. Try the Clemson starter

Disconnect the robot in Basic, then stop its server with Ctrl+C. Run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\start-ui.ps1 -Edition clemson
```

Open <http://127.0.0.1:5174/> in Chrome. The Clemson edition shows just the robot
IP (default **`192.168.12.1`**) and AES-key form. Click **Connect and open web view**;
after successful authentication it opens the upstream camera/voxel view directly.
The IP can be changed if needed. Other upstream menus are not exposed in Clemson;
use Basic for mapping, account, Bluetooth, or other administrative features.
The side panel displays extracted MediaPipe hands rather than webcam video.
The top-right camera-view controls show battery, Jump once, and Bound gait;
stationary look-around is deferred. Startup applies tracked overlays and prints
the same UI build ID shown in the camera-view title. See the
[Clemson dashboard guide](clemson/README.md) for current controls and recovery.

## Original setup checks — October 28, 2026

On 2026-10-28, the Basic source installed and passed TypeScript and Vite production
builds. Its development server returned HTTP 200 on `127.0.0.1:5173`.
The robot's TCP port 9991 was reachable; port 8081 refused a connection.
These checks do not establish AES authentication, WebRTC negotiation, camera,
voxels, SLAM, or safe motion. No motion command was sent during setup.
Browser automation was unavailable; visual verification must be completed in Chrome.
The Clemson starter also passed TypeScript/Vite builds and HTTP page/entry-module
checks on `127.0.0.1:5174`. Both PowerShell launch/setup scripts passed syntax checks.

These are historical installation checks. For the current navigation baseline
and behavior status, see the [Clemson guide](clemson/README.md#creative-inquiry-workflow-and-extension-ideas).
