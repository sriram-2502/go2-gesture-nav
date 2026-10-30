# Gesture navigation: a student walkthrough

This example turns hand landmarks into velocity commands for the Clemson Go2 UI.
Start with the Python examples without a robot, then test the extracted hand view.
Robot movement is enabled separately in the dashboard.

For a visual reference, see the [illustrated gesture guide](../clemson/README.md#gesture-guide-what-your-hand-commands).

## 1. Read the velocity table first

Open [velocity.py](velocity.py). Its main function is just a dictionary:

```python
from webrtc.gesture_preview.velocity import Speeds, gesture_to_velocity

speeds = Speeds(forward=0.5, turn=0.8)
vx, vy, wz = gesture_to_velocity('STRAFE_LEFT', speeds)
print(vx, vy, wz)  # 0.0 0.5 0.0
```

Think of the robot's own coordinate frame: `vx` is forward, `vy` is left, and
`wz` is turning left (counterclockwise viewed from above). `vx` and `vy` use m/s;
`wz` uses rad/s. The robot's left can differ from your left in the room.

| Gesture in the mirrored hand panel | Label | `(vx, vy, wz)` at default settings |
| --- | --- | --- |
| Index up, palm facing the webcam | `FORWARD` | `(0.5, 0, 0)` |
| Index pointing left | `STRAFE_LEFT` | `(0, +0.5, 0)` |
| Index and middle fingers both pointing left | `STRAFE_RIGHT` | `(0, -0.5, 0)` |
| Thumb up, other fingers curled | `TURN_LEFT` | `(0, 0, +0.8)` |
| Thumb down, other fingers curled | `TURN_RIGHT` | `(0, 0, -0.8)` |
| Open palm or closed fist | `STOP` | `(0, 0, 0)` |
| No hand, two hands, or ambiguous pose | `NO_HAND` / `UNKNOWN` | `(0, 0, 0)` |

Nonzero forward and turn speeds can be set between **0.5 and 1.0**. Sideways
motion always uses exactly **+0.5 or -0.5 m/s**. Inactive axes are zero. Only one
axis is commanded at a time. No ramps are added; switching gestures requests zero
before the new gesture completes its hold. These command settings still need
validation on the lab robot.

## 2. Run your first example

In **Anaconda Prompt**, from this repository's root folder:

```bat
conda activate go2wifi
python -m webrtc.examples.gesture_mapping
python -m webrtc.gesture_navigation --demo
```

The first command prints the mapping table. The second simulates fresh observations
to show the 300 ms gesture hold, then emits JSON lines containing `vx`, `vy`, `wz`,
the gesture, and status. Neither opens a webcam nor connects to a robot.

## 3. Try your own hand, without robot movement

```bat
python -m webrtc.gesture_navigation --forward-speed 0.5 --turn-speed 0.8
```

This standalone program owns the webcam and prints supervised velocities. Ctrl+C
stops it and prints a final zero command. It never sends motion commands or reads
an AES key. Close it before starting the dashboard's webcam service; one program
should own the webcam at a time.

The recognizer uses simple geometry, not a learned gesture-confidence score. It
checks which fingers are extended, pointing direction, thumb direction, and a
palm-facing heuristic using MediaPipe handedness. Oblique hands and uncertain
poses return UNKNOWN. Check every intended pose with the actual operator; passing
synthetic geometry tests does not establish recognition reliability.

## 4. Follow the small modules

| File | Responsibility | Good first exercise |
| --- | --- | --- |
| [vision.py](vision.py) | Capture webcam frames; extract MediaPipe landmarks and handedness | Observe the effect of hand position and lighting |
| [gestures.py](gestures.py) | Turn one hand's landmarks into a gesture name | Explain the index-tip and middle-joint comparison |
| [velocity.py](velocity.py) | Map the name to `(vx, vy, wz)` | Trace one row of the dictionary |
| [safety.py](safety.py) | Require fresh, consistent observations; make stop immediate | Explain why repeating one frozen frame cannot satisfy the hold |
| [gesture_navigation.py](../gesture_navigation.py) | Small command-line example tying those steps together | Read the JSON output and plot a selected velocity |
| [server.py](server.py) | Share extracted hands and supervised velocity with the browser | Inspect `/gesture-api/snapshot` with motion disabled |

Robot-specific WebRTC code lives separately in
[gesture-robot.ts](../clemson/overlay/gesture-robot.ts). Students can work through
the Python modules without changing the network adapter.

## 5. Use it in the Clemson dashboard

Follow [DEPENDENCIES.md](../DEPENDENCIES.md) for installation and the two terminals.
Open <http://127.0.0.1:5174/>; tracking starts when the hand panel opens. You can test it
before connecting a robot; it shows only extracted skeletons, never webcam video.

The main-view velocity overlay distinguishes:

- **Requested:** velocity associated with the current recognized gesture.
- **After hold/freshness checks:** Python's supervised velocity.
- **Last transmitted:** command sent through WebRTC; this is not proof of execution.
- **Measured:** fresh robot velocity feedback, when available.

Expand **Speed settings** and use **Apply speeds**. This disables robot gesture
control and resets the recognition hold. Sideways speed is read-only.

For a supervised hardware check, join Go2 Wi-Fi, leave the editable IP at
**`192.168.12.1`**, and connect with the assigned AES key. Confirm that the robot
is already standing normally, video is live, and feedback is arriving. Show an
open palm/fist, then click **Enable gesture control**. Keep that stop pose until
the motion-service check completes. Recognition testing and enabling control are
separate steps; the paired remote and a supervising operator remain required.

Only `normal` and `mcf` motion services are accepted. The adapter does not stand
the robot up or switch modes. MCF Move is sent without acknowledgement, while
normal-mode Move requires an API success reply. A sent command is never labelled
executed. The camera/state/gesture watchdogs run in the browser and cannot guarantee
a stop if the browser freezes, the computer loses power, or communication fails.

**Stop / disable**, hiding the panel, speed changes, stale input, stale feedback,
stale robot camera frames, browser focus loss, and disconnect revoke control.
Missing/ambiguous hands request zero; a new clear gesture must complete its hold.
The stop sequence requests zero and StopMove, and only requests BalanceStand after
successful StopMove acknowledgement and 300 ms of low-speed upright feedback.
Unconfirmed stopping/stance is displayed explicitly. Check the robot visually.
No damping command is issued by the gesture navigation Stop button.

## 6. Run the offline checks

```bat
python -m unittest webrtc.gesture_preview.test_navigation webrtc.gesture_preview.test_preview -v
```

The test hands are artificial coordinates. They verify rules and command
supervision, not operator accuracy or physical robot stopping. Adapter tests use
an in-memory fake transport and never connect to a Go2:

```powershell
.\.tools\node-v22.23.4-win-x64\node.exe --test .\webrtc\clemson\tests\test-gesture-robot.cjs
```

Integrated CSV/video recording and offline replay are available in the UI:
see [recording and replay](../RECORDING.md). Maze scoring remains future work.
