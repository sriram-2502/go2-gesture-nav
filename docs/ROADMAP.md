# Lab roadmap

## README images and motion GIFs

- [x] Add an attributed upstream reference screenshot showing Go2 camera, robot model, and voxels to the project README.
- [x] Show the project's MediaPipe-style gesture guide and link the student integration walkthrough.
- [x] Replace the upstream reference hero with an eight-second project dashboard GIF and still from the supplied October 30, 2026 recording; document exports in [DEMO.md](DEMO.md).
- [ ] Add a clear photo of the lab Go2 in the maze and record the photo source/permission.
- [ ] Record a short supervised forward-and-stop demo with the gesture and measured velocity visible.
- [ ] Record brief sideways and turn-in-place demos, returning to stop between gestures.
- [ ] Add a short recording/replay walkthrough GIF showing the overall toggle and offline playback.
- [x] Export two eight-second, 8 fps dashboard GIFs at 800 px width (about 3.3 and 2.9 MiB), plus higher-quality silent release MP4s.
- [x] Store reviewed dashboard GIF/still in `docs/assets/`; keep full source MP4/WebM, recording ZIPs, and raw telemetry local. Inspect future exports separately before publication.

The current hero comes from the supplied recorded Go2 dashboard session. It
illustrates the integrated view; it does not qualify every gesture or stop path.
Record firmware/setup details with future qualification captures and distinguish
hardware recordings from offline or synthetic replay demos.

## Repository separation TODO

- [ ] Carry out the [agreed repository split](REPOSITORY_SPLIT_TODO.md): lab onboarding,
  personal simulation/course workspace, personal Go2 WebRTC gesture-navigation fork,
  and a separately retained Go1/Jetson/ZED reference path.

## Student onboarding

- [x] Separate the ROS/Ethernet and WebRTC/Wi-Fi paths.
- [x] Archive original ZIP downloads and ignore local credentials and recordings.
- [ ] Establish private key distribution for approved students.
- [ ] Have a new student follow each guide and record corrections.

## ROS research path

- [ ] Verify a short `--record-states` run on the Jetson; inspect bag metadata,
  core topic counts, and `run.json`.
- [ ] Verify `--record-all` with the actual active sensor publishers.
- [ ] Add a sanitized recording example and an offline analysis workflow.

## WebRTC teaching path

- [ ] Verify the connection-only script on the lab robot and record software versions.
- [ ] Verify bounded velocity and stop behavior under lab supervision.
- [ ] Document camera streaming when implemented and tested.

## Dashboard using `unitree_ui`

- [x] Add the correct `unitree_ui` repository URL and integration instructions.
- [x] Provide Windows launch options for upstream Basic and a separate Clemson starter.
- [ ] Verify upstream camera, state, voxels, and onboard SLAM on the lab robot.
- [x] Add Windows webcam MediaPipe preview to the Clemson UI, reusing the Go1 scaffold in go2wifi.
- [ ] Verify operator gestures and simultaneous Go2 camera/voxels in Chrome.
- [x] Add supervised gesture command routing and beginner-friendly Python examples.
- [ ] Verify the new gesture vocabulary and physical Go2 motion/stop behavior.
- [ ] Complete the maze activity layout and scoring.
- [x] Add integrated CSV/data logs, optional video recording, and offline replay.
- [ ] Verify Chrome capture permissions, video codec, and combined live recording on the Go2.
- [ ] Define the local client/service boundary and private key handling.
- [ ] Add connection status, velocity controls, visible stop controls, and feedback.
- [ ] Document supported firmware and supervised classroom operation.

## Public release

- [ ] Choose the lab's license and verify script/photo provenance.
- [ ] Review publishable files and any Git history for credentials.
- [ ] Enable available GitHub secret scanning and push protection.
- [ ] Publish source and docs, keeping private access material and recordings separate.
