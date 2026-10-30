# Bring your course gestures into the instructor setup

You can reuse the gesture recognition work you developed in previous weeks.
Keep the Go1 simulation working in its own repository and environment. The
hardware repository supplies the Go2 browser view, WebRTC connection, command
supervision, robot feedback, recording, and replay; adapt your recognition logic
at the Python boundary rather than rebuilding those components.

## Start with the instructor baseline

Clone [go2-webrtc-gesture-nav](https://github.com/sriram-2502/go2-webrtc-gesture-nav)
and follow [the installation instructions](DEPENDENCIES.md). Preview the instructor
gestures with robot control disabled and record the baseline Git commit. Keep
your gesture experiment local under the existing README-only submission policy.

## Choose what to reuse

| Earlier work | How it fits here |
| --- | --- |
| Hand landmark geometry or classifier | Copy only the pure recognition function and its helpers into `webrtc/gesture_preview/student_gestures.py` in your local checkout |
| Recognition experiments and tuning | Reuse your test cases and compare performance across operators/lighting |
| Webcam/MediaPipe pipeline | Start with the provided worker; adapt extraction only if needed, preserving its timestamps and snapshot contract |
| Simulation runtime, MuJoCo policy, Qt UI | Keep these in the simulation repo; do not import them into the Go2 application |
| Simulation speed settings and labels | Translate labels explicitly; retain the instructor's Go2 hardware limits |

Do not copy your whole simulation application or its environment into this
repository. The `go2wifi` environment already supplies the hardware-side MediaPipe
dependencies. Only one process should own the webcam and one browser should own
the robot connection.

## Connect your recognition function

The current integration point is
[`gestures.diagnose(landmarks, handedness)`](gesture_preview/gestures.py).
[`vision.Webcam`](gesture_preview/vision.py) calls it for exactly one tracked hand,
then creates a timestamped prediction. **Changing only `classify()` elsewhere
does not automatically load a student classifier.** There is no plugin selector
or automatic import of the playground in this version.

For example, your copied Week 4 function may accept 21 MediaPipe landmark objects
with `.x`, `.y`, `.z` and return `FORWARD`, `LEFT`, `RIGHT`, `STOP`, or `UNKNOWN`.
In your local experiment, adapt the existing `diagnose()` function along these
lines (this is an edit to make, not a second camera program):

```python
from .student_gestures import classify as student_classify

def diagnose(landmarks, handedness=None):
    # Keep this module's existing points_from() validation helper.
    if points_from(landmarks) is None:
        return {'label': 'UNKNOWN', 'hint': 'Invalid hand landmarks.'}

    # LEFT/RIGHT in the earlier simulation meant rotation, not sideways travel.
    labels = {
        'FORWARD': 'FORWARD',
        'LEFT': 'TURN_LEFT',
        'RIGHT': 'TURN_RIGHT',
        'STOP': 'STOP',
        'UNKNOWN': 'UNKNOWN',
    }
    label = labels.get(student_classify(landmarks), 'UNKNOWN')
    return {'label': label, 'hint': 'Student classifier: check the agreed gesture table.'}
```

Copy all helpers used by your classifier and adapt the landmark input format if
your own function expects arrays rather than MediaPipe objects. If your function
also needs handedness, pass it explicitly. Keep the UI label and hint consistent
with your classifier; the instructor's finger/palm diagnostics do not describe
your custom algorithm automatically. The minimal adapter above displays a label
and hint; richer recognition diagnostics are optional.

The hardware vocabulary is `FORWARD`, `STRAFE_LEFT`, `STRAFE_RIGHT`, `TURN_LEFT`,
`TURN_RIGHT`, `STOP`, `NO_HAND`, and `UNKNOWN`. Add sideways labels to your adapter
only if you deliberately implement and qualify those gestures. An old `LEFT`
label must not silently become sideways motion. Unsupported labels, including
`BACKWARD` in this version, map to `UNKNOWN` and zero request.

Keep no-hand/multiple-hand handling and acquisition timestamps in `vision.py`.
Preserve `safety.py`, `velocity.py`, and the browser robot adapter: the 300 ms hold,
400 ms input expiry, explicit enable, one-axis limits, and robot video/state checks
still apply. Go2 uses forward 0.5–1.0 m/s, sideways magnitude fixed at 0.5 m/s,
and turn magnitude 0.5–1.0 rad/s (default 0.8), rather than simulation limits.

## Check it before robot motion

1. Run your classifier tests on saved/synthetic landmarks and compare the label table. Keep the instructor baseline tests available as a reference; custom poses may need different recognition assertions.
2. Run `python -m webrtc.gesture_navigation` from the repository root to inspect supervised JSON velocities. This uses the webcam but never connects to the robot.
3. Close that program, then run `python -m webrtc.gesture_preview.server` and open the Clemson UI. Leave robot control disabled while checking skeletons, labels, requested velocities, and supervised velocities.
4. Check stop, ambiguous input, two hands, hand loss, stale input, and transitions between gestures. Record incorrect recognitions as well as successful ones.
5. Ask the instructor to review the mapping and approve brief supervised hardware checks before maze trials. Retain the paired remote and normal intervention procedure.

Document your gesture table, code changes, baseline commit, and results in the
weekly README on your playground team branch. Full run data stays local; use
small sanitized media only under the course submission policy. Never place the
AES key in your code, reports, recordings, or Git history.
