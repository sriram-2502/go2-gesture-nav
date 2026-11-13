# Clemson camera-view controls

The top-right control stack is **Disconnect → Stop → battery → Jump / Backflip / Bound**.
It stays on the camera/voxel view, separate from the hand sidebar. Battery refresh
and behavior status are independent of the webcam service.

## Start the updated UI

Disconnect the robot and stop the previous UI server with Ctrl+C. Then run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\start-ui.ps1 -Edition clemson
```

Startup applies tracked overlays before launching Vite. Open
**http://127.0.0.1:5174/** and use Ctrl+Shift+R to reload the page. The camera-view
title shows **Navigation | UI build ID**; startup prints the same ID. The local
`/clemson-build.json` endpoint also reports it without connecting to a robot.
Matching IDs confirm the loaded code. Stationary entry is disabled in production.
Do not apply
source changes into a connected live dashboard; test new controls in a clear,
supervised robot session. Development builds can target an isolated checkout
using `apply-clemson-overlay.ps1 -TargetPath PATH`.

## Battery

A filled battery graphic and numeric percentage appear directly under Stop.
Telemetry comes from `rt/lf/lowstate → bms_state.soc` through the existing
connection; finite numeric values from 0 through 100 are accepted. A valid zero
shows **0%**. Missing, invalid, disconnected, or more than five seconds old data
shows **Battery unavailable / —%**. Yellow at 20% or below is a display cue,
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
| **Backflip once** | `BackFlip` 2043, one request with `{}` per the Go2 Python SDK | Directly below Jump once. Pauses gesture navigation and locks repeat actions/gesture enabling until grounded recovery. This is a one-shot action, not a gait. |
| **Bound gait** | `FreeBound` 2046 with `{data:true}` | Requires a successful API reply and new mode feedback. Then click Enable gesture control to navigate. Click Bound again or Stop to leave it. A stop/zero gesture while moving in Bound ends that gait and disarms navigation. |

**Backflip warning shown beside the control:** Clear the surrounding area and
keep people away. Use a level, non-slip surface and keep the paired remote ready
before Backflip. The button is not a claim of support on every firmware; this
addition is offline-tested and needs separate supervised hardware qualification.
The official Python SDK uses an empty one-shot payload; the pinned Basic UI's
`{data:true}` variant is not retried as a fallback. A missing reply may still mean
the robot received the action, so the local lock remains until recovery.

Only one behavior owns the command path at a time. Bound is highlighted only
after new robot feedback reports that mode. Rejection,
timeout, or mismatched mode is shown in the control stack; an uncertain mode must
be stopped before gesture navigation can resume. The adapter accepts the same
`normal` and `mcf` motion services as the original navigation path.

### Stationary control: deferred

Stationary Look Around has been removed from the student UI. The production
adapter rejects stationary entry before sending commands. The experimental code
and offline tests remain for future development, without a student-facing switch.

The lab robot showed unreliable mode transitions and stopped/upright confirmation.
A Joy-Con conflict has not been established. The
[roadmap TODO](../docs/ROADMAP.md#optional-application-improvements) tracks
firmware/interface identification, gesture-to-angle mapping, centering, timeout,
mode-exit, and return-to-navigation validation before this feature is restored.

### Stop and recovery

Stop disarms gesture navigation and requests Bound off when selected.
If reconnecting to a robot already in its
separate firmware Pose mode, Stop also requests `Pose(false)`. The guarded stop sequence
uses fresh low-speed upright feedback before BalanceStand. Persistent-mode exit
also requires feedback outside the selected mode.

After a jump or backflip, BalanceStand is withheld until at least three seconds have elapsed
and new low-speed upright feedback with four positive foot-force readings spans
300 ms. Missing foot-contact telemetry or failure to recover leaves the behavior
locked and reports a remote-intervention message. These are conservative software
checks, not a guarantee of landing or an airborne emergency-stop mechanism. A
jump/backflip API acknowledgement confirms a request, not successful execution.

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
| Stationary body pose | `Pose` 1028 with `{data:true}`; protocol also defines `Euler` 1007 | Deferred; identify and qualify the correct firmware interface before restoring stationary control. |
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
