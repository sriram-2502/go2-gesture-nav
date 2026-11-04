# Sources and third-party notices

This repository is a setup and integration project, not a fork or complete copy
of `unitree_ui`. `webrtc/ui-source.json` pins the upstream source downloaded by
`setup-ui.ps1`. Generated upstream and Clemson checkouts are ignored by Git;
the setup retains the upstream MIT license in each generated checkout.

- Upstream UI: https://github.com/legion1581/unitree_ui, pinned revision in `webrtc/ui-source.json`.
- UI-derived overlays and patch snippets: the upstream MIT notice is retained in `webrtc/clemson/UPSTREAM_LICENSE`.
- README image `docs/assets/go2-camera-voxels.png`: unmodified `images/webview_go2.png` from the pinned `legion1581/unitree_ui` revision. It illustrates the upstream Basic UI, not a Clemson trial. The upstream MIT notice is retained in `webrtc/clemson/UPSTREAM_LICENSE`.
- MediaPipe/gesture scaffold: adapted from `sriram-2502/go1-mujoco-playground`; Apache 2.0 notice and license are retained in `webrtc/gesture_preview/NOTICE.md` and `LICENSE` in that directory.
- The lab controller photograph is documentation media; no additional reuse license is asserted here.
- Project dashboard demos: `docs/assets/go2-gesture-dashboard-demo.gif`, `go2-gesture-dashboard-demo-02.gif`, and `go2-gesture-dashboard.png` are selected exports from the maintainer-supplied October 30, 2026 run. They show this project's integration of upstream Unitree UI and the gesture panel. See `docs/DEMO.md` for provenance, cropping, and the silent release videos. Upstream notices still apply to the interface; the media does not relicense third-party components.

No project-wide license has been selected for the remaining original materials.
Dependencies and model downloads remain subject to their respective licenses.
