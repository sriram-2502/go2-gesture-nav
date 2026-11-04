# Go2 gesture-navigation roadmap

This roadmap covers the Windows 11 Go2 gesture-navigation application.
Hardware validation of the existing setup is complete, as confirmed by the
maintainer.

## Delivered

- [x] Local Windows webcam extraction with MediaPipe and a landmark-only hand panel.
- [x] Readable gesture rules, velocity mapping, consistency hold, and freshness checks.
- [x] Go2 Wi-Fi/WebRTC connection and camera/voxel dashboard based on pinned Unitree UI source.
- [x] Explicit gesture enable, visible stop controls, bounded commands, and robot feedback.
- [x] Requested, supervised, transmitted, and measured velocity overlay.
- [x] Obstacle-avoidance switch with state readback.
- [x] Local recording toggle, structured run data, and offline replay.
- [x] Hardware validation of the existing Go2 gesture-navigation setup.
- [x] Windows dependency and launch instructions, illustrated gestures, and classifier integration guide.
- [x] Two dashboard GIFs, a readable still, and silent demo videos; see [DEMO.md](DEMO.md).
- [x] MIT license for original project code/documentation, with third-party notices retained.

## Documentation and onboarding

- [ ] Have a new user follow the Windows installation and first-session guides and record corrections.
- [ ] Record the supported Go2 firmware and host dependency versions with future releases.
- [ ] Add a short recording/replay walkthrough GIF.
- [ ] Optionally add focused forward/stop, sideways, and turn-in-place demonstration clips. These are presentation improvements, not outstanding baseline hardware validation.

## Private access

- [ ] Migrate Go2 credential distribution to the planned institution-approved Proton Pass arrangement; confirm sharing capacity and maintainer access.
- [ ] Review public Git history and confirm available secret-scanning/push-protection settings.

Keys, passwords, full recordings, and raw experiment data remain outside Git.
Until vault migration, authorized users request credentials privately from the
maintainer. See [KEY_ACCESS.md](KEY_ACCESS.md).

## Optional application improvements

- [ ] Evaluate maintaining the dashboard directly in an upstream fork instead of the current reproducible overlay.
- [ ] Add further operator recognition diagnostics or configurable gesture experiments while preserving command supervision.
- [ ] Qualify optional onboard mapping/SLAM features if a future navigation experiment needs them.

## Optional CI course extension

Students may build a maze and define scoring and repeatable navigation trials.
No student maze has been built yet. This is an optional course activity, not a
required feature of the gesture-navigation application; activity instructions
and submission expectations belong with the course materials.
