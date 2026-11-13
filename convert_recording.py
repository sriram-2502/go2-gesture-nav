"""Extract dashboard/camera video from a run ZIP, converting WebM to MP4 locally.

Example: python -m convert_recording run.zip --output dashboard.mp4
PyAV is already installed with the standalone Go2 WebRTC driver. No robot I/O.
"""
import argparse
from fractions import Fraction
from io import BytesIO
from itertools import chain
import json
from pathlib import Path
from zipfile import ZipFile


def export_mp4(archive_path, output_path, stream_name='dashboard'):
    import av
    output_path = Path(output_path)
    if output_path.exists():
        raise FileExistsError(f'Output already exists: {output_path}')
    with ZipFile(archive_path) as archive:
        info = json.loads(archive.read('run.json'))
        if info.get('format') != 'clemson-go2-run' or info.get('version') != 1:
            raise ValueError('Unsupported recording format')
        candidates = [m for m in info['media'] if m['file'] in
                      (f'{stream_name}.mp4', f'{stream_name}.webm')]
        if not candidates:
            raise ValueError(f'No {stream_name} video in this recording')
        filename = candidates[0]['file']
        if archive.getinfo(filename).file_size > 256 * 1024 * 1024:
            raise ValueError('Video exceeds the 256 MB conversion limit')
        data = archive.read(filename)
    if filename.endswith('.mp4'):
        with output_path.open('xb') as target:
            target.write(data)
        return
    with av.open(BytesIO(data)) as source:
        video = source.streams.video[0]
        frames = source.decode(video)
        first = next(frames, None)
        if first is None:
            raise ValueError('Recording has no decodable video frames')
        rate = video.average_rate or Fraction(30, 1)
        time_base = Fraction(1, 90000)
        origin = first.time or 0
        with output_path.open('xb') as target:
            with av.open(target, mode='w', format='mp4', options={'movflags': '+faststart'}) as result:
                encoded = result.add_stream('libx264', rate=rate)
                encoded.width, encoded.height = first.width // 2 * 2, first.height // 2 * 2
                encoded.pix_fmt = 'yuv420p'
                encoded.codec_context.time_base = time_base
                encoded.options = {'crf': '20', 'preset': 'fast'}
                previous = -1
                for index, frame in enumerate(chain([first], frames)):
                    # Preserve presentation timing, including gaps in variable-rate captures.
                    seconds = frame.time - origin if frame.time is not None else index / float(rate)
                    timestamp = max(previous + 1, round(seconds / float(time_base)))
                    frame = frame.reformat(encoded.width, encoded.height, format='yuv420p')
                    frame.pts, frame.time_base = timestamp, time_base
                    for packet in encoded.encode(frame):
                        result.mux(packet)
                    previous = timestamp
                for packet in encoded.encode():
                    result.mux(packet)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('recording', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--stream', choices=('dashboard', 'robot_camera'), default='dashboard')
    args = parser.parse_args()
    export_mp4(args.recording, args.output, args.stream)
    print(f'Saved MP4: {args.output}')


if __name__ == '__main__':
    main()
