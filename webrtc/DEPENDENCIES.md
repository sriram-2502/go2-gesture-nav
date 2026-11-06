# Windows 11 WebRTC dependencies

Use one Python 3.11 Conda environment, **`go2wifi`**, for the standalone Go2 scripts
and the Clemson webcam/MediaPipe service. The browser UI uses Node.js separately.
All commands below run from this repository's root. ROS, WSL, Docker, MuJoCo,
JAX, and PySide6 are not required for this setup.

## What each dependency does

| Dependency | Used for | Installation |
| --- | --- | --- |
| Git for Windows | Download the pinned `unitree_ui` source | Install Git for Windows if absent |
| Miniconda / Conda, Python 3.11 | Python scripts and webcam service | Create `go2wifi` below |
| `unitree_webrtc_connect` | Standalone Python connection/velocity diagnostics | `requirements.txt` |
| MediaPipe | The same Hand Landmarker extraction used by the Go1 scaffold | `requirements-gestures.txt` |
| OpenCV | Windows webcam capture and color conversion | Python requirements |
| NumPy | Webcam frame arrays | Python requirements |
| PyAV (`av`) | Optional local WebM-to-MP4 export from a saved run | Installed with the Go2 WebRTC driver / aiortc |
| Hand Landmarker model | MediaPipe model weights | Download command below; stored in ignored `.tools/models/` |
| Node.js / npm | Run the browser dashboard and its robot proxy | Workspace-local runtime installed by `setup-ui.ps1` |
| TypeScript, Vite, Three.js, other UI packages | Upstream dashboard and voxel rendering | `npm ci` from the upstream lockfile, handled by setup |
| Chrome | Go2 WebRTC video and the Clemson side panel | Open the localhost URL |

The webcam service uses Python's standard-library HTTP server; it needs no
additional Flask/FastAPI server package. It binds to `127.0.0.1:8766`, and Vite
proxies it into the Clemson UI at `/gesture-api`.

## Fresh Python setup

In **Anaconda Prompt / Miniconda Prompt**:

```bat
conda create -n go2wifi python=3.11 pip -y
conda activate go2wifi
python -m pip install --upgrade pip
python -m pip install -r webrtc\requirements.txt -r webrtc\requirements-gestures.txt
python -m webrtc.gesture_preview.download_model
python -m pip check
```

If `go2wifi` already has the working Go2 driver, just add the preview dependencies:

```bat
conda activate go2wifi
python -m pip install -r webrtc\requirements-gestures.txt
python -m webrtc.gesture_preview.download_model
python -m pip check
```

Install and download while internet is available, before joining the robot hotspot.
The same model already present in the Go1 repo was copied locally during this
setup, so the download command skips it here. Other students can download it from
Google using that command; the Go1 repo is not needed at runtime.

MediaPipe declares `opencv-contrib-python`, while the standalone Go2 driver
declares `opencv-python`. Both distributions provide `cv2`; this tested environment
has matching OpenCV distribution versions. Avoid independently upgrading one of
these packages without rechecking both the preview and driver.

## Dashboard setup

In **PowerShell**, from the repository root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\setup-ui.ps1 -Edition all
```

This installs both Basic and Clemson source copies. Stop running dashboard servers
before rerunning setup. To update only the tracked Clemson overlay on an existing
copy, without reinstalling dependencies:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\apply-clemson-overlay.ps1
```

Applying the overlay to a running development server can reload its browser tab;
disconnect the robot before doing so.

## Run the Clemson UI and webcam panel

**Terminal 1 — Anaconda Prompt:**

```bat
conda activate go2wifi
python -m webrtc.gesture_preview.server
```

**Terminal 2 — PowerShell:**

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\start-ui.ps1 -Edition clemson
```

Open <http://127.0.0.1:5174/> in Chrome. Hand tracking starts automatically when
the right panel opens and works without a robot connection. Close the Go1
dashboard or another application using the webcam first. For a different device,
start the Python service with `python -m webrtc.gesture_preview.server --camera 1`.

The upstream Go2 camera and voxels remain in the main web view. Join Go2 Wi-Fi,
leave **Robot IP address** at **`192.168.12.1`**, enter the robot AES key, and click
**Connect and open web view**. A successful authenticated connection opens that
view directly. The IP field is editable if your lab network uses a different
address. Disconnect the Basic edition and other robot clients first.

The side panel shows extracted hand skeletons, label, and compact control buttons.
Velocity readouts appear as an overlay on the main robot view. The browser does
not receive or display webcam video.
Index up with palm facing the camera means forward; index left means sideways
left; index+middle left means sideways right; thumb up/down with other fingers
curled means turn left/right; palm/fist stops. These are geometric rules, with no classifier confidence score.
Two hands produce UNKNOWN. Stale frames clear the preview and velocity intent.

**Control starts disabled.** Recognition can be tested without moving the robot.
The implemented adapter sends supervised gesture commands only after you connect
the robot and click **Enable gesture control**; no startup hand pose is required. Forward speed
is 0.5–1.0 m/s; turn speed is 0.5–1.0 rad/s (default 0.8); sideways is fixed at
±0.5 m/s. The existing Go2 hardware setup has been validated, as confirmed by the maintainer. Integrated recording is
available through [recording and replay](RECORDING.md). Read the
[student walkthrough](gesture_preview/README.md) before enabling.

Hiding the panel requests a stop and releases the webcam;
if viewer requests cease for eight seconds, the service releases the camera.
Stop either terminal with Ctrl+C. No webcam video is recorded or sent to a cloud
service by this adapter.

## Basic UI option

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\start-ui.ps1 -Edition basic
```

Open <http://127.0.0.1:5173/>. This is the unchanged upstream edition and does not
need the webcam service. See [UI_SETUP.md](UI_SETUP.md) for robot connection checks.

## Tested environment and checks

On 2026-10-28: Windows 11, Python 3.11.16, MediaPipe 1.0.1, OpenCV 5.0.0
(package versions `5.0.0.93`), NumPy 2.4.6, and workspace-local Node 22.23.4.
Python requirements pin the main perception packages; they are not a complete
transitive lockfile. Upstream UI source revision and Node version are recorded in
[ui-source.json](ui-source.json), and upstream's npm lockfile pins UI dependencies.

Verified: package imports and `pip check`; five offline preview lifecycle/HTTP
tests; real webcam capture and MediaPipe inference in `go2wifi`; landmark-only
API responses through the Clemson proxy (with no image field);
camera stop/release; Clemson TypeScript/Vite production build; and the preview
route through the running UI proxy. The short webcam check returned NO_HAND;
that initial check did not include operator gesture recognition. The existing
Go2 setup has since been hardware-validated, as confirmed by the maintainer. The later extraction-only
update removes JPEG/video fields from the API and clears landmarks on stale input.
Automated browser inspection was unavailable. These historical environment checks
are separate from the maintainer's later baseline hardware validation; optional
controls still need their own checks on the assigned firmware.

Offline checks:

```bat
python -m unittest webrtc.gesture_preview.test_navigation webrtc.gesture_preview.test_preview -v
```

Reference: [MediaPipe Hand Landmarker](https://developers.google.com/edge/mediapipe/solutions/vision/hand_landmarker/python).
Adapted course code and its license are documented in [NOTICE.md](gesture_preview/NOTICE.md).
