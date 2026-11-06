# Clemson control extensions

Battery display is implemented. Pose, jump, and gait controls below are a
development plan, not enabled student controls. Findings refer to the upstream
UI revision pinned in [ui-source.json](../ui-source.json), checked November 6, 2026.

## Battery: available in the Clemson dashboard

The camera/voxel header displays `Battery: 82%` from
`rt/lf/lowstate → bms_state.soc` through the existing authenticated connection.
The adapter accepts finite numeric values from 0 through 100. It clears the
display on disconnect, and readings older than five seconds become unavailable.
Malformed packets cannot refresh that timer. The 10 Hz status timer updates the
display; battery telemetry itself arrives asynchronously. Recording already saves
lowstate, and control-status events now also include battery availability/value.

This is the **robot battery**, with no added battery-based motion interlock.
The Go1 MuJoCo playground's `course/GO2_HARDWARE.md` asks students to check real
battery/state feedback and links to this hardware application. Its simulation
does not supply a live Go2 battery; the Clemson implementation belongs here.

Apply tracked changes to an existing generated checkout, then reload the browser:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\webrtc\apply-clemson-overlay.ps1
```

## What the pinned Unitree UI exposes

These are commands present in source, not a capability guarantee for the assigned
robot. Firmware and the active motion service determine accepted parameters and
behavior. The upstream UI's labels and some IDs differ from the current official
SDK; do not treat its action grid as a verified classroom command contract.

| Capability | Pinned UI / protocol | Meaning for Clemson development |
| --- | --- | --- |
| Stationary body pose | `Pose` 1028 with `{data:true}`; protocol also defines `Euler` 1007 | Best next prototype: explicit look-around control, separate from navigation. |
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

## Recommended next step: stationary look-around

Use two mutually exclusive controls: **Navigate** and **Look around**. Entering
look-around should stop/disarm gesture navigation, confirm fresh low-speed upright
feedback, and establish a supported posture-control mode before accepting input.

Unitree's [balance-stand example](https://github.com/unitreerobotics/unitree_sdk2/blob/main/example/go2/go2_sport_client.cpp)
shows body roll/pitch/yaw orientation control through `Euler`. A proposed Clemson
control can use small, bounded roll/pitch/yaw targets with a center button and
hold-to-operate input. Body yaw orientation is an angle, distinct from navigation's
`wz` yaw rate. Stationary means no requested walking; the body still moves and the
robot may adjust its feet to balance.

The upstream UI sends its joystick axes over `rt/wirelesscontroller` at 20 Hz and
lets robot firmware interpret them in the selected mode. It does not implement a
separate bounded Euler joystick. For Clemson, select and verify one posture-input
route on the assigned robot; do not mix raw remote axes with the gesture Move
loop. On release, focus loss, stale input, or exit, use the validated posture
neutralization/exit sequence. Returning to navigation requires explicit enabling.

## Then expose gait selection and jumping deliberately

Keep all behavior changes in the existing robot adapter and shared connection.
Pause/disarm navigation before mode changes, check replies, and decode the robot's
actual state using its motion-service-specific fields. Test returning to normal
navigation as well as entry into the new mode.

For jump controls, use an explicit one-shot trigger with a held-button/repeated-
gesture latch, an in-progress state, and landing/recovery feedback before allowing
another jump or navigation. `FreeJump` needs its own entry/exit state machine.
The current zero-velocity/StopMove walking sequence does not establish how to
interrupt an airborne action; validate behavior-specific recovery separately.
No jump commands or new mode changes are sent by the battery implementation.
