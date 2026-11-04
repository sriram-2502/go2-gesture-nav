# Go2 Gesture Navigation

**Windows 11 · Python · MediaPipe · Unitree Go2 · No ROS required**

Navigate a Go2 with hand gestures while watching its onboard camera and voxel
view. This project combines a focused Unitree UI dashboard, extracted hand
landmarks, supervised velocity commands, and local recording/replay. The Windows
webcam observes your hand; the robot camera shows where the robot is going.

[Quick start](#quick-start-on-windows-11) · [Gesture guide](#default-gestures) ·
[Dashboard guide](webrtc/clemson/README.md) · [Record and replay](webrtc/RECORDING.md) ·
[Customize your gestures](webrtc/STUDENT_INTEGRATION.md)

![Eight-second dashboard demonstration showing the Go2 camera and voxels, extracted MediaPipe hand landmarks, gesture labels, and velocity feedback.](docs/assets/go2-gesture-dashboard-demo.gif)

*Dashboard excerpt from a recorded Go2 session. Browser tabs, address bar, and
desktop are cropped out.*

[Watch the higher-quality silent MP4](https://github.com/sriram-2502/go2-gesture-nav/releases/download/v0.1.0/go2-gesture-dashboard-demo.mp4) ·
[View the dashboard still](docs/assets/go2-gesture-dashboard.png)

## What you can build

- **Gesture navigation:** use simple Python rules to turn hand landmarks into forward, sideways, and turn-in-place requests.
- **A focused robot dashboard:** camera and available voxels in the main view; extracted hands and controls in a compact side panel. Full webcam pixels are not displayed or sent to the browser.
- **Feedback-driven experiments:** compare requested, supervised, transmitted, and measured velocities in the main-view overlay.
- **Local recording and review:** one recording toggle saves dashboard/video and structured data; a separate replay page opens saved runs without connecting to the robot.
- **Your own classifier:** bring gesture logic from simulation or another project while retaining the command supervisor and robot adapter.

This is high-level navigation through the Go2's existing walking controller.
It does not replace locomotion control, deploy an RL policy, or implement
joint/torque-level MPC. Mapping and voxel availability depend on robot firmware.

## How it fits together

```text
Windows webcam → MediaPipe → gesture label → velocity mapping → freshness/hold checks
                                                                      ↓
Go2 camera + voxels → local browser dashboard ← explicit enable + robot checks
                                          ↕
                                    Wi-Fi / WebRTC
                                          ↕
                              Go2 onboard walking controller

Dashboard video + structured logs → local recording ZIP → offline replay
```

Python handles webcam extraction and gesture intent. The browser uses one
authenticated robot connection for video, state, and high-level commands.
Preview recognition with motion disabled before enabling the robot adapter.

### A second segment

![A fifteen-second dashboard segment showing changing camera and voxel views alongside the extracted hand gestures and velocity overlay.](docs/assets/go2-gesture-dashboard-demo-02.gif)

*A longer view from the same run: source seconds 15–30, shown as a 15-second loop.*
[Watch the second silent MP4](https://github.com/sriram-2502/go2-gesture-nav/releases/download/v0.1.0/go2-gesture-dashboard-demo-02.mp4).

## Default gestures

![MediaPipe-style illustrations of the programmed forward, sideways left/right, turn left/right, and stop gestures.](webrtc/clemson/assets/gesture-guide.png)

Match the direction in the **mirrored hand panel**. Velocities use the robot's
body frame: `vx` forward, `vy` left, and `wz` counterclockwise yaw.

| Hand pose | Movement | Default `(vx, vy, wz)` |
| --- | --- | --- |
| Index up, other fingers curled, palm facing webcam | Forward | `(+0.5, 0, 0)` |
| Index pointing left | Sideways left | `(0, +0.5, 0)` |
| Index + middle fingers pointing left | Sideways right | `(0, -0.5, 0)` |
| Thumb up, other fingers curled | Turn left in place | `(0, 0, +0.8)` |
| Thumb down, other fingers curled | Turn right in place | `(0, 0, -0.8)` |
| Open palm, closed fist, missing hand, or unclear pose | Stop request | `(0, 0, 0)` |

Units are **m/s, m/s, rad/s**. Forward speed is adjustable from **0.5–1.0 m/s**;
turn magnitude from **0.5–1.0 rad/s**, default **0.8**. Sideways magnitude stays
fixed at **0.5 m/s**. One gesture commands one axis.

A movement gesture must remain consistent for **300 ms**; input older than
**400 ms** is rejected. Stop/unknown input bypasses the movement hold. The
illustrations describe programmed poses, not measured recognition accuracy.
See the [detailed gesture and control guide](webrtc/clemson/README.md#gesture-guide-what-your-hand-commands).

## Quick start on Windows 11

You need Windows 11 x64, Git for Windows, Conda, Chrome, a webcam, and authorized
access to a Go2. Install dependencies while internet is available, before
joining the robot network. ROS, WSL, Docker, and MuJoCo are not needed.

### 1. Clone and install Python dependencies

In **Anaconda / Miniconda Prompt**:

```bat
git clone https://github.com/sriram-2502/go2-gesture-nav.git
cd go2-gesture-nav
conda create -n go2wifi python=3.11 pip -y
conda activate go2wifi
python -m pip install -r webrtc\requirements.txt -r webrtc\requirements-gestures.txt
python -m webrtc.gesture_preview.download_model
python -m pip check
```

If the environment already exists, follow [DEPENDENCIES.md](webrtc/DEPENDENCIES.md)
rather than recreating it. Dependency pins and the tested environment are listed there.

### 2. Prepare the dashboard

In **PowerShell**, from this repository's root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\setup-ui.ps1 -Edition clemson
```

The setup downloads a local Node runtime and the pinned upstream Unitree UI.
`clemson` is the existing gesture-dashboard edition flag and source folder name;
it is retained for compatibility. The Basic edition is also available; see
[UI_SETUP.md](webrtc/UI_SETUP.md). Read the setup script before running it.

### 3. Start the two local services

**Terminal 1 — Anaconda / Miniconda Prompt**, from the checkout root:

```bat
conda activate go2wifi
python -m webrtc.gesture_preview.server
```

**Terminal 2 — PowerShell**, from the checkout root:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\start-ui.ps1 -Edition clemson
```

Open **http://127.0.0.1:5174/** in Chrome. Test the extracted hand view with robot
control disabled. Close other webcam programs; only one process should own it.

### 4. Connect to the assigned robot

Join the **Go2 Wi-Fi hotspot** and use robot IP **`192.168.12.1`**. Obtain the
Wi-Fi password and robot-specific AES key privately from the owner/instructor.
Enter the key locally and choose **Connect and open web view**. Campus Wi-Fi is
not this direct robot connection; the hotspot may not provide internet.

Complete the [operator walkthrough](webrtc/gesture_preview/README.md) before
enabling gesture control. Confirm normal standing, fresh robot feedback and
video, clear space, and access to the paired remote. Run one robot controller
at a time. A transmitted stop request is not proof of a physical stop.

The dashboard has an obstacle-avoidance switch with readback. An `Unknown` value
is not an enabled state; confirm the reported setting on your robot. Do
not infer obstacle protection from the visible voxels.

## Learn the code without moving a robot

```bat
conda activate go2wifi
python -m webrtc.examples.gesture_mapping
python -m webrtc.gesture_navigation --demo
```

These examples print the velocity mapping and simulated supervised observations;
they do not connect to the robot. Start with the small modules:

| Module | Responsibility |
| --- | --- |
| [vision.py](webrtc/gesture_preview/vision.py) | Webcam capture, MediaPipe landmarks, and acquisition timestamps |
| [gestures.py](webrtc/gesture_preview/gestures.py) | Geometric gesture rules and recognition hints |
| [velocity.py](webrtc/gesture_preview/velocity.py) | Gesture-to-velocity table and speed limits |
| [safety.py](webrtc/gesture_preview/safety.py) | Consistency hold, input freshness, and zero requests |
| [server.py](webrtc/gesture_preview/server.py) | Local landmark/intent service for the browser |
| [gesture-robot.ts](webrtc/clemson/overlay/gesture-robot.ts) | Explicit enable, robot feedback checks, and WebRTC command routing |

Follow [the integration guide](webrtc/STUDENT_INTEGRATION.md) to substitute your
classifier. Keep the existing timestamps, limits, supervisor, and robot checks.
The generated UI checkout is ignored; reproducible UI changes belong in the
tracked overlay/setup sources, not only in generated files.

## Recording and replay

Turn **Recording ON**, approve the dashboard capture in Chrome, then enable
gesture control separately. Turn **Recording OFF** to finalize the local run ZIP.
The **Replay** page opens saved runs offline; it does not replay commands to the
robot. See [RECORDING.md](webrtc/RECORDING.md) for streams, timing, and limits.

Keep complete ZIPs, videos, and telemetry outside Git. This README contains only
a selected short export. Webcam pixels are not part of the landmark service;
robot video and hand landmarks are still experiment data. Clear cached keys from
the local UI on shared computers. See [private access](docs/KEY_ACCESS.md).

## Status and attribution

Developed by [Sriram Krishnamoorthy](https://github.com/sriram-2502).
This is an integration project with pinned upstream UI sources, not a standalone
replacement for Unitree UI. See [NOTICE.md](NOTICE.md) for retained upstream MIT
and perception Apache 2.0 notices. Original project code and documentation are
released under the [MIT License](LICENSE). Demo provenance and export details
are in [docs/DEMO.md](docs/DEMO.md). See the [roadmap](docs/ROADMAP.md) for planned
work and outstanding checks.

## Clemson Creative Inquiry reference

This project also serves as reference code for the **Clemson Creative Inquiry
course I offered in Fall 2026**, [Mission Control: From Human Gestures to
Intelligent Robot Motion](https://dyco-ai.github.io/go1_gesture_tracking/).
The [companion simulation code and weekly labs](https://github.com/sriram-2502/go1-mujoco-playground)
introduce Python, MediaPipe, and gesture navigation before Go2 hardware work.
Students are encouraged to build their own GitHub projects and bring their
earlier gesture pipelines into this reference setup. Follow the course's
submission policy for official weekly reports; keep full run data local.
See [the teaching vision](docs/TEACHING.md) for the broader approach.
