# Lab roadmap

Hardware validation of the existing Go2 gesture-navigation setup is complete,
as confirmed by the maintainer. Firmware inventory and the separate ROS/G1 or
future-feature checks remain distinct tasks. No new hardware tests were run as
part of this documentation update.

## README images and motion GIFs

- [x] Add an attributed upstream reference screenshot showing Go2 camera, robot model, and voxels to the project README.
- [x] Show the project's MediaPipe-style gesture guide and link the student integration walkthrough.
- [x] Replace the upstream reference hero with an eight-second project dashboard GIF and still from the supplied October 30, 2026 recording; document exports in [DEMO.md](DEMO.md).
- [ ] Optional CI media: add a Go2 maze photo if students build a maze; no student maze exists yet.
- [ ] Record a short supervised forward-and-stop demo with the gesture and measured velocity visible.
- [ ] Record brief sideways and turn-in-place demos, returning to stop between gestures.
- [ ] Add a short recording/replay walkthrough GIF showing the overall toggle and offline playback.
- [x] Export an eight-second dashboard GIF at 800 px width and a 15-second GIF at 720 px width (about 3.3 and 4.0 MiB), plus higher-quality silent release MP4s.
- [x] Store reviewed dashboard GIF/still in `docs/assets/`; keep full source MP4/WebM, recording ZIPs, and raw telemetry local. Inspect future exports separately before publication.

The current hero comes from the supplied recorded Go2 dashboard session. It
illustrates the integrated view; it does not qualify every gesture or stop path.
Record firmware/setup details with future qualification captures and distinguish
hardware recordings from offline or synthetic replay demos.

## Repository separation TODO

- [x] Publish and link the separate lab handbook, Go2 ROS/Basic WebRTC starters,
  personal simulation and gesture-navigation repos, and CI website. See the
  [organization status](REPOSITORY_SPLIT_TODO.md) for independent-checkout
  maintenance, remaining work, and optional refactors.

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
- [x] Validate the existing Go2 gesture-navigation hardware setup, including bounded motion and stopping (maintainer-confirmed).
- [ ] Document camera streaming when implemented and tested.

## Dashboard using `unitree_ui`

- [x] Add the correct `unitree_ui` repository URL and integration instructions.
- [x] Provide Windows launch options for upstream Basic and a separate Clemson starter.
- [x] Validate the existing Go2 camera/state/voxel dashboard (maintainer-confirmed).
- [ ] Optional mapping extension: qualify onboard SLAM separately if used for a future experiment.
- [x] Add Windows webcam MediaPipe preview to the Clemson UI, reusing the Go1 scaffold in go2wifi.
- [x] Validate operator gestures and the integrated Go2 camera/voxel dashboard (maintainer-confirmed).
- [x] Add supervised gesture command routing and beginner-friendly Python examples.
- [x] Validate the existing gesture-navigation hardware behavior (maintainer-confirmed).
- [ ] Optional CI course extension: student-built maze layout, scoring, and repeatable trials; students have not built a maze yet. Track activity development in the student code repo and link expectations from the course website.
- [x] Add integrated CSV/data logs, optional video recording, and offline replay.
- [x] Capture a live Go2 run with dashboard video and data; the supplied recording supports the published demos.
- [x] Define the local Python landmark service/browser boundary and operator-supplied key handling; shared vault migration remains pending.
- [x] Add connection status, velocity controls, visible stop controls, and feedback.
- [ ] Document supported firmware and supervised classroom operation.

## Public release

- [x] Retain the independent lab starters' selected MIT licenses and source/media attribution.
- [x] Release original personal-project code and documentation under the [MIT License](../LICENSE); retain third-party licenses.
- [ ] Review publishable files and any Git history for credentials.
- [ ] Enable available GitHub secret scanning and push protection.
- [x] Publish source and docs, keeping private access material and full recordings separate.
