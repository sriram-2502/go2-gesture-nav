# Dashboard setup and troubleshooting

Use the [root quick start](../README.md#1-install-once). There is one normal
project setup: the Clemson gesture dashboard. No separate Basic repo or ROS
installation is needed.

## First installation

From the repo root in Windows PowerShell, while connected to the internet:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\setup-ui.ps1
```

The script verifies a local Node download, checks out the pinned upstream source,
applies the tracked dashboard overlays, and installs the locked npm dependencies.
Versions are in [ui-source.json](../ui-source.json). Stop a running dashboard
before setup; Windows can lock dependencies while Vite is active.

These are generated and ignored:

```text
.tools/                    Local Node runtime and npm cache
upstream/unitree_ui/       Pinned source used to generate the app
dashboard/unitree_ui/      Generated gesture dashboard
```

Edit `dashboard/overlay/` rather than generated source. The upstream MIT license
is retained. Existing generated changes are preserved rather than reset.

## Daily launch

Start `python -m gesture_preview.server` in the activated `go2wifi` environment.
In a separate PowerShell terminal from the repo root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-ui.ps1
```

Open **http://127.0.0.1:5174/**. Startup applies tracked updates and prints the UI
build ID; match it to **Navigation | UI build ID** after connecting. The gesture
service is loopback-only on port **8766**. No Bluetooth backend on 5051 is needed.
Use the development launcher for its robot/gesture proxies; a static production
preview is not a substitute for this connection workflow.

Before movement, check preview, live robot camera, incoming state, and the
paired-remote intervention procedure. Voxel availability depends on firmware.
Jump once and Bound gait are optional; follow [the recovery guide](../dashboard/CONTROL_EXTENSIONS.md).

## Common problems

| Problem | Check |
| --- | --- |
| Missing Jump/Bound buttons or old page | Stop the old server, update, run root setup, restart, hard-refresh, and match the build ID |
| Webcam busy | Close other camera apps; select another camera using `python -m gesture_preview.server --camera 1` if needed |
| Robot connection fails | Go2 hotspot, 192.168.12.1, assigned private key, and only one robot client |
| Port 5174 already in use | Stop the earlier dashboard with Ctrl+C before restarting |
| Old 5051 errors | An older upstream server/tab may still be running; restart this project's default dashboard |
| Updating an old checkout | Use the migration note in the [README](../README.md#update-and-restart); old `webrtc/` launch paths are obsolete |

The explicit `-Edition clemson` flag remains compatible with earlier launch
commands. Maintainers can still request `-Edition basic` for upstream comparison;
it is an advanced diagnostic, not part of the course/weekend setup.
