# Dashboard demonstration

The README's animated hero is a selected excerpt from the instructor-supplied
`Go2_run_2026-10-30T19-27-14-135Z.zip`, recorded October 30, 2026. Only
`dashboard.mp4` was extracted for this export. The separate robot-camera video,
run metadata, and raw CSV/JSONL logs are not published with the demo.

## Public exports

| File | Export |
| --- | --- |
| `assets/go2-gesture-dashboard-demo.gif` | Source seconds 30–38; 800 × 406; 8 fps; 64 palette colors; looping; about 3.3 MiB |
| `assets/go2-gesture-dashboard-demo-02.gif` | Source seconds 15–30; 15-second loop; 720 × 366; 8 fps; 64 palette colors; about 4.0 MiB |
| `assets/go2-gesture-dashboard.png` | Still at source second 34; 1440 × 730; readable full dashboard reference |
| [Silent MP4](https://github.com/sriram-2502/go2-gesture-nav/releases/download/v0.1.0/go2-gesture-dashboard-demo.mp4) | Same eight-second segment; 1280 × 648; 20 fps; H.264; about 1.2 MiB; attached to the release rather than Git |
| [Second silent MP4](https://github.com/sriram-2502/go2-gesture-nav/releases/download/v0.1.0/go2-gesture-dashboard-demo-02.mp4) | Source seconds 15–30; 15 seconds; 1280 × 648; 20 fps; H.264; about 2.2 MiB |

The source is 2880 × 1800. Both exports crop to `2880:1460:0:244` before scaling,
removing browser tabs, the address/bookmarks bars, and the Windows taskbar. The
capture's small screen-sharing status overlay remains as recorded. The exports
contain no audio and strip source metadata. The excerpt was inspected for
credential entry screens and private browser content; no connection form or key
is shown. The embedded robot camera remains part of the dashboard scene.

The recording illustrates the interface and changing views, not a comprehensive
motion, obstacle-avoidance, or stop/fault acceptance report. Hardware validation
of the existing Go2 setup is complete, as confirmed by the maintainer. Future
work and software-inventory documentation remain on the [roadmap](ROADMAP.md).

## Reproduce the GIF

With a local FFmpeg installation and the extracted dashboard video:

```powershell
ffmpeg -ss 30 -t 8 -i dashboard.mp4 -filter_complex "[0:v]crop=2880:1460:0:244,fps=8,scale=800:-2:flags=lanczos,split[a][b];[a]palettegen=max_colors=64:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" -an -map_metadata -1 -loop 0 go2-gesture-dashboard-demo.gif
```

For the second segment, use `-ss 15 -t 15`, `scale=720:-2`, and `-frames:v 120`
before the output filename; save it with the `-02` filename.

Do not commit source recording ZIPs, full screen recordings, keys, or raw run
logs. The full supplied archive remains on the maintainer's computer. New public
exports should be selected and inspected separately before publication.
