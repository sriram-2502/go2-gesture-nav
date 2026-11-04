# Repository organization and remaining work

Reviewed November 4, 2026. The agreed public repository structure is in place.
Hardware acceptance and future development remain separate work.

## Published repositories

| Repository | Responsibility | Status |
| --- | --- | --- |
| [DyCo-AI/lab-robots](https://github.com/DyCo-AI/lab-robots) | Multi-robot onboarding and GitHub Pages | Published; Go2/G1 guides and temporary Go1 reference |
| [DyCo-AI/go2-ros](https://github.com/DyCo-AI/go2-ros) | Basic Ethernet/SSH/Jetson/ROS 2 starter | Published independently |
| [DyCo-AI/go2-webRTC](https://github.com/DyCo-AI/go2-webRTC) | Basic Windows/Wi-Fi/WebRTC UI and Python examples | Published independently; excludes the gesture dashboard |
| [DyCo-AI/g1-ros2](https://github.com/DyCo-AI/g1-ros2) | G1 ROS 2 and sensor/Rerun diagnostics | Public and linked; acceptance work remains in its roadmap |
| [sriram-2502/go2-gesture-nav](https://github.com/sriram-2502/go2-gesture-nav) | Personal gesture dashboard, MediaPipe, supervision, recording/replay | Published; renamed from go2-webrtc-gesture-nav; demo GIFs and silent videos added |
| [sriram-2502/go1-mujoco-playground](https://github.com/sriram-2502/go1-mujoco-playground) | Student code, simulation, weekly labs, Go2 onboarding | Published; links updated to the personal hardware reference |
| [DyCo-AI/go1_gesture_tracking](https://github.com/DyCo-AI/go1_gesture_tracking) | CI website, schedule, concepts, assignments | Published; links to student code and the Go2 instructor reference |

The course retains its Go1 repository name. Its current hardware route uses Go2
and WebRTC on Windows 11. Physical Go1 integration remains under development.

## Completed organization work

- [x] Publish separate lightweight lab starters for Go2 ROS and Basic WebRTC.
- [x] Keep multi-robot onboarding in its own GitHub Pages repository.
- [x] Publish the personal gesture project without Clemson in its repository name.
- [x] Retain simulation/student code separately from the hardware reference.
- [x] Cross-link the handbook, lab starters, personal projects, and CI website.
- [x] Provide weekly README reports, team-branch conventions, local full-data guidance, and instructions for integrating earlier gesture classifiers.
- [x] Add optimized robot/demo media, illustrated gestures, setup instructions, and attribution.
- [x] Publish a [v0.1.0 reference snapshot and demo assets](https://github.com/sriram-2502/go2-gesture-nav/releases/tag/v0.1.0).
- [x] Keep archived ZIPs, credentials, full recordings, and generated dependencies out of ordinary Git staging.
- [x] Preserve the pinned upstream UI revision and applicable MIT/Apache notices.

The tagged snapshot is a reference release, not a hardware acceptance report.
Students currently follow the maintained repository and record the approved commit.

## How this workspace maps to GitHub

The local `unitree_go2_setup` folder is the checkout of
**sriram-2502/go2-gesture-nav**. The old local folder name can stay. The lab
starters, handbook, simulation, and course website have independent Git checkouts
and histories. They are not automatically synchronized copies of this folder.

Update the owning lab repository for basic onboarding and the personal repository
for gesture-application changes. Port shared fixes deliberately and verify each
checkout. Legacy ROS/Basic files remain here for continuity; removing duplicates
is optional cleanup rather than a blocker to the published structure.

## Remaining follow-through

- [ ] Have a new student follow each onboarding path and record corrections.
- [ ] Record actual robot firmware, Jetson/JetPack/L4T versions, and hardware checkout evidence.
- [ ] Verify gesture recognition, velocity/stop/focus-loss behavior, avoidance readback, and recording/replay on the assigned robot.
- [ ] Complete the maze layout, scoring, and repeatable evaluation procedure.
- [ ] Select a project-wide license for the remaining original personal-project materials. Third-party licenses remain in effect; the independent lab starters retain their selected MIT licenses.
- [ ] Review public Git history and confirm available secret-scanning/push-protection settings; ignored files alone do not establish this.
- [ ] Migrate the private inventory to the planned institution-approved Proton Pass arrangement; verify sharing capacity and assign primary/backup maintainers.
- [ ] Obtain and verify the G1 Wi-Fi SSID/password and AES key privately.

## Optional future work from the older plan

These are retained ideas, not missing public repositories.

- [ ] Decide whether to replace the reproducible UI overlay with a maintained upstream fork. The delivered personal repo is an integration project that downloads pinned source, not a GitHub fork of Unitree UI.
- [ ] Package shared perception/gesture/supervision code for pinned reuse by simulation and hardware, without adding Node/hardware dependencies to simulation.
- [ ] Add a separate Go2 simulation model with a qualified controller/policy adapter while preserving Go1 simulation. Do not reuse the Go1 ONNX policy on Go2 by assumption.
- [ ] Consider renaming the simulation repo only after both robot backends work.
- [ ] Optionally remove redundant legacy ROS/Basic files after checking downstream links.

MATLAB bridging, external Jetson sensor streaming, Wi-Fi SSH, and host-PC RL
workflows remain on the owning lab starters' roadmaps. They were not implemented
as part of the repository/documentation split.
