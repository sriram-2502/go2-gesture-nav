# Perception scaffold attribution

`vision.py`, `gestures.py`, and `safety.py` were adapted from the local Clemson
`go1-mujoco-playground` course scaffold on 2026-10-28:

- `course/week-03-webcam-basics/vision.py`
- `course/week-04-hand-landmarks/gestures.py`
- `course/week-05-gesture-classification/safety.py`

The source repository's Apache 2.0 license is retained as `LICENSE` here.
Changes in `vision.py`: package-relative imports, a workspace-local model path,
and an extraction-only snapshot returning normalized landmark coordinates.
Camera images are processed locally and are not returned by the preview API.
The MediaPipe extraction is retained. The gesture rules now include pointing,
thumb direction, and palm-facing checks; velocity mapping and supervision use
the Go2 navigation settings. The server/UI adapter is new. No MuJoCo simulation
or Qt dashboard dependency is required.
