# WebRTC + Wi-Fi: Clemson student setup

## Choose your interface

| Option | Start here | Status |
| --- | --- | --- |
| Basic `unitree_ui` | [Windows dashboard setup](UI_SETUP.md) | Pinned upstream UI: camera, controls, voxels, onboard SLAM interface |
| Clemson UI | [Clemson edition](clemson/README.md) | Camera/voxel view, extracted MediaPipe hands, and explicitly enabled gesture navigation; hardware verification pending |
| Standalone Python scripts | Continue below | Connection and bounded velocity diagnostics |

Use the **Basic dashboard first**. All three options run on Windows 11 without
ROS. Connect only one robot client at a time; close or disconnect another edition
or standalone script before connecting.

See [DEPENDENCIES.md](DEPENDENCIES.md) for all Windows, Node, Python, and model
dependencies, including installation into `go2wifi` and webcam-panel startup.
For beginner-friendly Python examples, see the [gesture navigation walkthrough](gesture_preview/README.md).
For dashboard video, CSV/data logs, and offline playback, see [recording and replay](RECORDING.md).

For Creative Inquiry and undergraduate projects: connect a Windows laptop to the
Go2 Wi-Fi hotspot and run the Python client on the laptop. ROS and Jetson SSH are
not required for this path. For research recordings, use the [ROS path](../ros/README.md).

The original lab notes record successful key retrieval on **2026-10-28**, using
Windows 11, Python 3.11 in Conda, Go2 EDU software v1.1.15, and a North America
Unitree account. Connection, camera streaming, and motion are not yet documented
as verified. Do not treat the included velocity script as a completed hardware test.

## 1. Install while connected to the internet

Open **Anaconda Prompt** or **Miniconda Prompt** on Windows:

```bat
conda create -n go2wifi python=3.11 pip -y
conda activate go2wifi
python -m pip install --upgrade pip
python -m pip install -r webrtc\requirements.txt
python -c "from unitree_webrtc_connect import UnitreeWebRTCConnection, WebRTCConnectionMethod; print('Go2 WebRTC import OK')"
```

Run these commands from this repository's root folder. If the environment already
exists, activate it instead of creating it again. Install dependencies before
switching to the robot hotspot, which may not provide internet access.
The requirements file pins the driver source revision used in the original
key-retrieval notes; transitive dependencies are not locked.

## 2. Obtain the private robot key

Ask the lab maintainer for access through the lab's approved private resource.
See [the key access plan](../docs/KEY_ACCESS.md). Students do not need the lab's
Unitree account password to use an already supplied robot AES key.

Both scripts read `UNITREE_AES_128_KEY` if set, otherwise they prompt for the key
with **hidden input**. Paste the assigned 32-character hexadecimal key at the
prompt and press Enter. The prompt avoids putting the key into a shell command
or saving it in this repository. A local process still holds the key in memory.

An existing environment variable is supported for lab-managed launchers. No
`.env` loader is included. If a previously set variable contains an obsolete key,
clear it in Anaconda Prompt before using the prompt:

```bat
set UNITREE_AES_128_KEY=
```

Never put the real key in a Python file, README, screenshot, issue, or commit.

## 3. Join the Go2 hotspot

Power on the Go2 and connect Windows Wi-Fi to the assigned robot hotspot using
the lab-provided Wi-Fi credentials. This is **LocalAP** mode; the expected endpoint
is `192.168.12.1`. Robot Ethernet is not required. This guide covers the hotspot
path, not a shared-network or cloud-control setup.

## 4. Test connectivity without motion

In **Anaconda Prompt**, from the repository root:

```bat
conda activate go2wifi
python webrtc\go2_wifi_connect_test.py
```

Enter the private key when prompted. The script attempts a connection, holds it
for five seconds, then disconnects. It sends no motion commands. Resolve any
connection failure before attempting velocity control.

## 5. Supervised velocity test

Confirm normal standing and remote control, clear the travel area, and keep the
remote ready. The script does not stand the robot up. Run one controller at a time.
Review supported arguments without connecting:

```bat
python webrtc\go2_wifi_velocity_test.py --help
```

After the connection-only test succeeds and the lab supervisor approves the
physical setup, a short test is:

```bat
python webrtc\go2_wifi_velocity_test.py --vel 0.5 --time 1
```

The script checks fresh state and upright height, counts down three seconds, and
commands 0.5 m/s forward for one second. It has **no acceleration/deceleration
ramps**. Stopping adds time and distance. It sends zero velocity and StopMove,
then conditionally requests BalanceStand after low-speed upright feedback.
Visually confirm stopping and all four feet on the floor.

Ctrl+C requests cleanup. A separate stop-only invocation is:

```bat
python webrtc\go2_wifi_velocity_test.py --stop
```

This needs its own working connection and key; keep the remote available for
immediate intervention. Lost connectivity can prevent software stopping.
The script accepts normal and MCF motion-service modes without switching modes.
MCF Move commands have no acknowledgement; fresh state is still required.

| Argument | Default | Accepted range |
| --- | --- | --- |
| `--vel` / `--vx` | `0.5` m/s | Zero or magnitude 0.5 to 1.0; negative is backward |
| `--time` / `--duration` | `1` s | Greater than zero, at most 30 |
| `--vy` | `0` m/s | Within +/-0.5 |
| `--yaw-rate` / `--w` | `0` rad/s | Within +/-1.0 |
| `--stop` | Off | Zero velocity and guarded stop/stance only |

These are script limits, not recommended classroom operating speeds. This path
does not record ROS bags. Camera and dashboard support remain [roadmap items](../docs/ROADMAP.md).

## Maintainer: retrieve a key if needed

Use a computer with internet access and the Unitree account already bound to the
robot. The original successful lookup used a phone hotspot; mobile data is not
inherently required. The robot was listed as offline during that lookup.

The original client failed at cloud login with HTTP 567. The lab notes record
success with a pinned PR #66 revision and the `safari` TLS profile. After installing
the requirements, check that CLI help includes `--impersonate`:

```bat
python -m unitree_webrtc_connect._cli --help
python -m unitree_webrtc_connect._cli --email "YOUR_UNITREE_ACCOUNT_EMAIL" --device-type Go2 --region global --impersonate safari
```

Enter the account password at the interactive prompt; omit `--password` from
commands. For the recorded North America account, the CLI region was `global`;
the other region option is `cn`. Match the returned robot to the intended device
and retain the AES key only in the lab's private resource. The returned device
table contains secrets: do not copy it to public documentation or support logs.

HTTP 567 or an HTML challenge does not prove the password is wrong. The patched
client provides firewall-block diagnostics; changing networks alone did not fix
the recorded failure. The successful `safari` profile is a historical observation,
not a guarantee for future cloud requests. Camera and motion are separate tests.

## Troubleshooting

| Problem | Check |
| --- | --- |
| Driver import fails | Activate `go2wifi`; install dependencies while online |
| Key format error | Use the assigned 32-character hexadecimal key, without quotes |
| Authentication fails | Confirm robot-to-key mapping with the maintainer |
| Connection times out | Confirm Windows joined the correct Go2 hotspot |
| No fresh state / upright state rejected | Confirm normal robot operation; do not bypass feedback checks |
| Stop or stance not confirmed | Intervene with the remote and visually check the robot |

## References

- [Unitree WebRTC Connect](https://github.com/legion1581/unitree_webrtc_connect)
- [Cloud login issue #65](https://github.com/legion1581/unitree_webrtc_connect/issues/65)
- [PR #66](https://github.com/legion1581/unitree_webrtc_connect/pull/66)
- [Source revision recorded in the lab notes](https://github.com/Scherm-AI/unitree_webrtc_connect/commit/23dd4ad2b4d14a7edbfa0ea485067f84d44cb1bc)
