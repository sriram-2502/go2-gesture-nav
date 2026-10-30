# Lab roadmap

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
