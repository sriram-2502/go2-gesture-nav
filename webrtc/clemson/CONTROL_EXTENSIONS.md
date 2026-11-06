# Clemson camera-view controls

The top-right control stack is **Disconnect ? Stop ? battery ? behavior buttons**.
It stays on the camera/voxel view, separate from the hand sidebar. Battery refresh
and behavior status are independent of the webcam service.

## Start the updated UI

Disconnect the robot and stop the previous UI server with Ctrl+C. Then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\start-ui.ps1 -Edition clemson
```

Startup applies tracked overlays before launching Vite. Open
**http://127.0.0.1:5174/** and use Ctrl+Shift+R to reload the page. The camera-view
title shows **Gesture pose | UI build ID**; startup prints the same ID. The local
`/clemson-build.json` endpoint also reports it without connecting to a robot.
Matching IDs confirm the loaded code includes gesture pose and the FPV tint fix.
Do not apply
source changes into a connected live dashboard; test new controls in a clear,
supervised robot session. Development builds can target an isolated checkout
using `apply-clemson-overlay.ps1 -TargetPath PATH`.

## Battery

A filled battery graphic and numeric percentage appear directly under Stop.
Telemetry comes from `rt/lf/lowstate ? bms_state.soc` through the existing
connection; finite numeric values from 0 through 100 are accepted. A valid zero
shows **0%**. Missing, invalid, disconnected, or more than five seconds old data
shows **Battery unavailable / ?%**. Yellow at 20% or below is a display cue,
not a firmware limit or an automatic motion cutoff.

The status display refreshes at 10 Hz; actual battery packets are stream-driven.
The existing recorder saves lowstate and control-status battery fields. The Go1
MuJoCo playground links to this hardware application; live Go2 battery telemetry
is implemented here, not simulated in MuJoCo.

The header background is transparent so the taller behavior stack does not dim
the FPV inset. Video freshness and robot-feedback freshness are shown separately.
The hand panel also reports live tracking rate, detected-hand count, and frame
age. `UNKNOWN` and `NO_HAND` include recognition hints even when navigation is off.

## Gesture navigation

Click **Enable gesture control** directly. There is no palm/fist startup ritual;
fresh webcam predictions (including NO_HAND), robot state, and camera frames are
still required. New frames spanning at least 300 ms after enabling are required
before sending a nonzero velocity, alongside Python's consistency hold.

## Behavior buttons

These controls are implemented with offline tests; they are not hardware-qualified
for every Go2/firmware combination. No robot actions are sent on page load. Select
behaviors while the robot is standing still. Entry pauses gesture navigation,
checks fresh robot/video feedback and the active motion service, and uses the
existing authenticated connection.

| Button | Command / behavior | How to use |
| --- | --- | --- |
| **Jump once** | `FrontJump` 1031, one request | Requests one forward jump. Further behavior selections and gesture enabling stay locked until Stop completes recovery. This is distinct from the upstream persistent FreeJump mode. |
| **Bound gait** | `FreeBound` 2046 with `{data:true}` | Requires a successful API reply and new mode feedback. Then click Enable gesture control to navigate. Click Bound again or Stop to leave it. A stop/zero gesture while moving in Bound ends that gait and disarms navigation. |
| **Stationary look around** | `BalanceStand` 1002, then `Euler` 1007 | Uses the webcam gestures for bounded body roll/pitch/yaw. Requires fresh tracking and new supported standing feedback. Click the mode again or Stop to exit before enabling walking navigation. |

Only one behavior owns the command path at a time. Entry into Pose or Bound is
highlighted only after new robot feedback reports the requested mode. Rejection,
timeout, or mismatched mode is shown in the control stack; an uncertain mode must
be stopped before gesture navigation can resume. The adapter accepts the same
`normal` and `mcf` motion services as the original navigation path.

### Stationary gesture mapping

Selecting Stationary Look Around starts the gesture-to-pose mode directly. The
hand panel changes to **Stationary gestures**. No joystick or arrow pad is needed.

| Gesture label | Requested `(roll, pitch, yaw)` in radians |
| --- | --- |
| `FORWARD` | `(0, +0.12, 0)` |
| `STRAFE_LEFT` | `(+0.12, 0, 0)` |
| `STRAFE_RIGHT` | `(-0.12, 0, 0)` |
| `TURN_LEFT` | `(0, 0, +0.15)` |
| `TURN_RIGHT` | `(0, 0, -0.15)` |
| Stop, unknown, missing hand, or stale input | `(0, 0, 0)` — center |

Targets use one axis at a time and the existing Python gesture hold. New frames
spanning 300 ms after mode entry are required before tilting. Input age above
400 ms returns the target to zero while leaving stationary mode selected.
The robot-state, camera-freshness, and focus-loss checks remain active. Supported
idle/standing feedback variants are accepted after BalanceStand acknowledgement.

The nominal 20 Hz loop sends orientation targets, never walking Move requests
while stationary gestures are active. Requested roll/pitch/yaw is displayed
separately, and the walking-velocity readout shows zero. Actual body response and
angle signs need verification on the assigned robot. The body moves and feet may
adjust for balance. This follows
Unitree's [BalanceStand/Euler example](https://github.com/unitreerobotics/unitree_sdk2/blob/main/example/go2/go2_sport_client.cpp),
rather than sending unbounded wireless-controller joystick axes.

### Stop and recovery

Stop disarms gesture navigation. For look-around it centers Euler targets;
for Bound it requests the gait off. If reconnecting to a robot already in its
separate firmware Pose mode, Stop also requests `Pose(false)`. The guarded stop sequence
uses fresh low-speed upright feedback before BalanceStand. Persistent-mode exit
also requires feedback outside the selected mode.

After a jump, BalanceStand is withheld until at least three seconds have elapsed
and new low-speed upright feedback with four positive foot-force readings spans
300 ms. Missing foot-contact telemetry or failure to recover leaves the behavior
locked and reports a remote-intervention message. These are conservative software
checks, not a guarantee of landing or an airborne emergency-stop mechanism. A
jump API acknowledgement confirms a request, not successful execution.

If foot-contact telemetry is absent, recovery reports that limitation immediately
instead of remaining on a generic "Requesting stop" message. Stop still sends
zero/StopMove, but it does not infer landing or send BalanceStand without the
required feedback. A failed stop disables navigation and requires remote recovery.

Use the paired remote to restore normal standing and visually check all four feet
on the ground. Then press **I restored standing with the remote**. That explicit
operator acknowledgement checks supported standing/walking-mode feedback,
low measured speed, fresh video, and new upright state samples spanning 500 ms.
It sends **no robot commands** and leaves gesture navigation disabled. If checks
fail, the lock remains. This is manual recovery acknowledgement, not software
proof of landing. Repeated webcam failures or focus changes do not automatically
restart a failed recovery. Pressing Stop deliberately still retries stopping.

## Local services and port 5051

Clemson uses Vite on **5174** and the Python gesture service on **8766**. The Go2
video/state link is the existing WebRTC connection. The optional upstream BLE
backend on **5051** is disabled in the Clemson edition, including its WebSocket
proxy. `ECONNREFUSED 127.0.0.1:5051` in an older running server is Bluetooth retry
traffic, not proof that robot video or MediaPipe has failed. Disconnect, stop the
old UI server, and restart through `start-ui.ps1 -Edition clemson` to apply this
update. Basic retains its upstream Bluetooth behavior.

## What the pinned Unitree UI exposes

These are commands present in source, not a capability guarantee for the assigned
robot. Firmware and the active motion service determine accepted parameters and
behavior. The upstream UI's labels and some IDs differ from the current official
SDK; do not treat its action grid as a verified classroom command contract.

| Capability | Pinned UI / protocol | Meaning for Clemson development |
| --- | --- | --- |
| Stationary body pose | `Pose` 1028 with `{data:true}`; protocol also defines `Euler` 1007 | Clemson uses BalanceStand + gesture-driven Euler targets; firmware Pose joystick mode is separate. |
| Forward jump | `FrontJump` 1031 | A one-shot action, not a velocity or a stream of jump requests. |
| Jump mode | `FreeJump` 2047 with `{data:true}` | A persistent behavior; distinct from the one-shot forward jump. |
| Stair walking | `WalkStair` 1049 with `{data:true}` | Present upstream; verify the exact firmware route and supported stairs before exposing it. Not a terrain planner. |
| Walking / running | Free Walk 2045, Static Walk 1061, Run through `SwitchGait` 1011 | Mode selection changes how subsequent input is interpreted; read back actual state. |
| Endurance | UI uses `EconomicGait` 1035; protocol also defines MCF 1063 | A concrete compatibility mismatch to resolve before adding a selector. |
| Other modes | Bound 2046, Free Avoid 2048, Cross Step 2051 | Additional upstream modes, not automatically suitable for the course baseline. |

The current official [Go2 SDK API definitions](https://github.com/unitreerobotics/unitree_sdk2_python/blob/master/unitree_sdk2py/go2/sport/sport_api.py)
include Static Walk 1061, Trot Run 1062, and Economic Gait 1063.
Its [client implementation](https://github.com/unitreerobotics/unitree_sdk2_python/blob/master/unitree_sdk2py/go2/sport/sport_client.py)
provides separate calls for `Pose`, `Euler`, `FrontJump`, and `FreeJump`.
The pinned UI's `WalkStair` 1049 is absent from that Go2 Python API list;
verify it on the assigned firmware rather than substituting another robot's API.
