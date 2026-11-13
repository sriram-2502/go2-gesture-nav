# Contributing

Keep each setup guide usable by a student starting from a fresh terminal.
Label commands by where they run: Windows PowerShell or Anaconda Prompt.
Keep file paths consistent with this repository layout.

For documentation changes, check relative links and command paths. For Python
changes, check syntax and argument handling without connecting to the robot first.
Motion behavior changes need a supervised hardware check before being described
as verified. Record the robot firmware, host environment, and what was tested;
distinguish simulated checks from robot tests.

## Source layout and offline checks

The [repository map](README.md#project-layout) identifies tracked source.
Edit `dashboard/overlay/` for Clemson UI changes, not the ignored generated
`dashboard/unitree_ui/` checkout. Apply/rebuild only after disconnecting the
robot and stopping the UI server. Keep the pinned upstream Basic source separate.

From the repository root in **Anaconda Prompt**, with `go2wifi` active:

```bat
python -m unittest gesture_preview.test_navigation gesture_preview.test_preview -v
```

For UI changes, in **PowerShell**, after first-time setup:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\apply-clemson-overlay.ps1
$env:PATH = (Join-Path (Get-Location) '.tools/node-v22.23.4-win-x64') + ';' + $env:PATH
node --test dashboard/tests/test-gesture-robot.cjs dashboard/tests/test-camera-start.cjs dashboard/tests/test-recording.cjs
npm.cmd run build --prefix dashboard/unitree_ui
```

These checks do not connect to the robot. Stationary control is disabled in
production; its retained experimental tests explicitly opt in. Do not restore
the student control without completing the [roadmap qualification](docs/ROADMAP.md#optional-application-improvements).

## Reports, data, and attribution

Submit sanitized errors and reproduction steps. Never attach AES keys, passwords,
cloud tokens, private notes, or unsanitized logs. Coordinate private credential
issues directly with the lab maintainer through the lab's established channel.

Retain upstream attribution and the root MIT license. Preserve the Apache 2.0
scaffold license and other third-party notices; review the provenance of any new
media before publication.
