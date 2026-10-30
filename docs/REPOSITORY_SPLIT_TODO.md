# TODO: separate lab onboarding, simulation, and CI hardware development

Agreed plan: three active repositories, with the existing Go1 hardware project
retained as a separate reference. This document does not create, rename, move,
archive, or publish any repository.

## Current CI access

The existing setup folder is now published directly as
[`sriram-2502/unitree-go2-setup`](https://github.com/sriram-2502/unitree-go2-setup)
so students can clone it. This publishes the current combined setup; the future
lab/course split below remains a separate task. Students do not need a copy from
the instructor's laptop. Private AES access still comes from the instructor.

| Repository | Owner | Responsibility |
| --- | --- | --- |
| `unitree-go2-setup` (proposed) | DyCo-AI lab | Stable ROS/Ethernet/Jetson and Windows WebRTC onboarding; pinned basic Unitree UI |
| `go1-mujoco-playground` (existing) | sriram-2502 | First-half CI curriculum: Python, MediaPipe, gesture navigation, simulation, and evaluation |
| `go2-webrtc-gesture-nav` (proposed) | sriram-2502 | Second-half CI: Clemson Go2 UI, physical gesture navigation, recording, replay, and maze experiments |
| `go1_gesture_tracking` (existing) | DyCo-AI | Retain the Go1/ROS Noetic/Jetson AGX/ZED hardware path; identify it separately from the current Go2 course path |

## Migration checklist

- [ ] Preserve current working folders and reconcile unpublished local playground changes.
- [ ] Extract ROS and basic WebRTC setup, diagnostics, networking, and credential-access docs into the lab repo.
- [ ] Keep the lab baseline pointed at a tested, pinned upstream `unitree_ui` revision.
- [ ] Create the personal Go2 course repo as a fork of `legion1581/unitree_ui`, not of the lab setup repo.
- [ ] Move the Clemson application, student examples, diagrams, recording, replay, and tests into that fork.
- [ ] Maintain UI changes directly in the fork's source, replacing the prototype overlay mechanism.
- [ ] Retain upstream history, licenses, and copied-code attribution.
- [ ] Package shared perception, gesture vocabulary, mapping, and supervision as a small `gesture_nav` Python package in the course repo.
- [ ] Let the simulator install a pinned version of that Python package without requiring Node or hardware transports.
- [ ] Preserve the working Go1 simulation while adding a separate Go2 model and validated controller/policy adapter.
- [ ] Keep simulator and hardware limits explicit; preserve the agreed physical Go2 speed profile.
- [ ] Keep weekly activities in the playground's `course/` tree and link to hardware instructions rather than duplicating the curriculum.
- [ ] Add clear cross-links and deployment labels to all repository READMEs.
- [ ] Consider renaming the playground to `quadruped-gesture-playground` after both robot backends are established.
- [ ] Keep AES keys in the private lab access resource and recordings/archives out of public history.

## Student progression

1. First half: run the playground, learn Python/MediaPipe, implement gesture rules,
   test stop/freshness behavior, and evaluate repeatable simulated maze trials.
2. Hardware checkout: follow the lab repo for the Go2 connection, camera, voxels,
   basic commands, and supervised verification.
3. Second half: use the personal Go2 course repo for physical gesture navigation,
   recording, replay, and evaluation.

Go2 simulation is more than a robot-name change: qualify its model and locomotion
controller separately. Do not reuse the Go1 ONNX policy on Go2 without validation.

## References

- [Existing simulation/course repository](https://github.com/sriram-2502/go1-mujoco-playground)
- [Existing Go1 hardware project](https://github.com/DyCo-AI/go1_gesture_tracking)
- [Upstream Unitree UI](https://github.com/legion1581/unitree_ui)

## Course streamlining update

- [x] Prepare local website links and weekly schedule aligned with Go1 simulation then Go2 WebRTC hardware; retain course repository name.
- [x] Prepare weekly README-only submission policy, student folder convention, optional small media, and local full-data storage guidance.
- [x] Identify this local bundle as the instructor reference; require private instructor-issued AES access and the robot hotspot.
- [x] Publish the reviewed course website and student code integration after instructor authorization: website `e9b4103`; playground `f2c0493` plus required policy-threading fix `48abe06`, pushed to `main` and `creative-inquiry-dev`.
- [ ] Prepare the personal Go2 instructor repository, retain upstream license/history, exclude secrets and raw recordings, and pin a tested release for student links.
- [ ] Replace the temporary instructor-bundle references with the actual repository and tested release once available.

The course website owns schedule and assignment expectations. The playground
owns executable lab instructions and the detailed submission/data conventions.
The Go2 instructor project owns the working hardware application. Public naming
does not imply that the physical Go1 path is qualified; it is under development.
