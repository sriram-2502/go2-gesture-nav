# Record a run and replay it

The Clemson UI can save one ZIP containing dashboard video, Go2 video when
available, and timestamped data. The replay page opens the ZIP locally and has
**no robot connection or command controls**.

## Try replay first—no robot needed

Start the Clemson UI normally, then open <http://127.0.0.1:5174/replay.html>.
Click **Try demo**, then **Play**. The synthetic demo includes hand landmarks,
robot-state samples, a local trajectory, and a generated voxel maze. It contains
no captured video or real robot data. Drag the interactive view to orbit and
scroll to zoom. Use the timeline to seek; playback speeds are 0.5×, 1×, and 2×.

## Record in three steps

1. Open the live Clemson UI and connect to the Go2 as usual. In the hand panel,
   find the **Recording** switch. Expand **Run name** if you want a custom name.
   Leave gesture control disabled.
2. Turn the overall **Recording** switch **ON** and select the **Clemson dashboard tab** in Chrome's capture
   chooser. The selected surface is what the dashboard video records, including
   the visible Go2 camera, voxels, hand skeletons, labels, and controls. Start
   recording after key entry. Audio and the full webcam image are not recorded.
3. Enable gesture control separately when ready. After the run, turn **Recording
   OFF**. This disables gesture control, waits for any active guarded stop,
   finalizes video, and downloads the run. Keep the remote ready if a stop is
   unconfirmed; saving a file is not confirmation of physical stopping.

Opening the browser capture chooser can trigger the focus-loss stop. Start
recording before enabling gesture control. The browser requires you to choose
and approve a capture surface each time; the application cannot choose silently.

There is one overall recording switch, with no per-stream settings. It records
dashboard video plus all available Go2 video, hand, command, telemetry, and voxel
data. If you cancel the capture chooser, recording stays OFF. The switch shows
Starting or Saving while those operations are pending.

## Open a saved run

Click **Replay**, then **Open recording ZIP** and select the download.
There is no extraction or upload step.

- **Recorded dashboard** shows what was captured on screen.
- **Interactive data** reconstructs extracted hands, telemetry, local pose, and
  received voxel snapshots. It uses a simplified robot pose marker, not a full
  joint animation. You can change the 3D viewing angle independently of the video.
- The separate **Robot camera** panel appears if that video was saved.
- **Download video** exports the dashboard clip from the ZIP in its actual format.
- Details list stream counts, format, duration, recording limits, and events.

Replay never executes logged commands. The live dashboard in another tab can
still have a connection; switching to replay triggers its existing focus-loss
stop. For offline review, disconnect the live dashboard first.

## Files in the ZIP

| File | Contents |
| --- | --- |
| `run.json` | Format/version, UTC start, duration, media offsets, counts, dropped events, limit status |
| `dashboard.mp4` or `.webm` | Selected dashboard/tab/window recording, when enabled |
| `robot_camera.mp4` or `.webm` | Go2 camera stream, when available and video enabled |
| `events.jsonl` | Full timeline: extracted hands, requested/supervised velocities, sent commands, API replies, feedback, binary voxel packets, and control events |
| `gestures.csv` | Gesture and numeric velocity intent/supervision, with timestamps |
| `commands.csv` | Commands sent and request IDs; a sent command is not labelled executed |
| `robot_states.csv` | Received velocity, position, body height, and available source timestamp |
| `events.csv` | Control/event summaries and API reply IDs/status codes |

The recorder uses an allowlist of local robot topics. It does not save AES keys,
cloud login exchanges, DOM snapshots, or webcam pixels. Landmarks and robot camera
video are still experiment data; share recordings according to the lab's practice.
ZIPs, MP4s, and WebMs are ignored by this repo's Git rules.

## MP4 compatibility

The recorder tries native MP4 first. If this Chrome/Windows combination cannot
record MP4, it uses WebM and names the file correctly. Both formats work in the
replay page. To get MP4 from a saved ZIP, run in Anaconda Prompt from the repo root:

```bat
conda activate go2wifi
python -m webrtc.convert_recording "PATH_TO_RUN.zip" --output "dashboard.mp4"
```

For the separate robot-camera clip, add `--stream robot_camera`. Existing output
files are not overwritten. Conversion is local and uses PyAV, installed with the
standalone Go2 WebRTC driver; it does not require a separate FFmpeg installation.
The converter preserves video presentation timing. If the ZIP already contains
MP4, it copies that clip without re-encoding.

## Timing, coverage, and limits

The timeline uses the browser's monotonic receive clock. Python frame-acquisition
timestamps and robot timestamps are retained where available, but these are
different clock domains. Video start offsets and stream alignment are approximate,
not hardware synchronization. Video presentation times remain in the media files.

Only data received through this interface is saved. Hand snapshots are sampled
by the UI (roughly every 150 ms), not every webcam inference frame. Voxel packets
are the compressed occupancy data exposed by WebRTC, not raw LiDAR measurements.
Missing streams cannot be reconstructed from velocity commands. Interrupted
robot camera tracks are not silently replaced with invented footage.

To keep the first version easy to use, data stays in browser memory until saved.
A run automatically starts saving near **128 MB** or **10 minutes**; media flush
may take it slightly over the size limit. Dropped events and limits are recorded
in metadata. Replay imports are limited to 256 MB expanded. Save before reloading
or closing the page: this version has no crash recovery. If export fails, keep
the page open and use **Retry save**. A download-again link remains after saving.

## Verification

Offline tests exercise ZIP export/import, exact binary voxel round-trips, CSVs,
timeline lookup, codec fallback, media finalization, and separation from robot
commands. The actual upstream WASM decoder successfully decodes the demo maze.
A synthetic variable-frame-rate video verifies WebM-to-MP4 conversion timing.
These checks do not establish browser screen-capture permission behavior, actual
Chrome codec availability, or simultaneous recording performance on the robot;
those require a short hands-on recording in Chrome.
