"""Exercise real WebM -> MP4 conversion with synthetic frames, not screen capture."""
from fractions import Fraction
import json
from pathlib import Path
import tempfile
import unittest
from zipfile import ZipFile

import av
import numpy as np
from convert_recording import export_mp4


class ConversionTests(unittest.TestCase):
    def test_variable_frame_timing_and_no_overwrite(self):
        with tempfile.TemporaryDirectory(prefix='go2-replay-') as folder:
            folder = Path(folder)
            webm, archive, mp4 = folder/'sample.webm', folder/'run.zip', folder/'dashboard.mp4'
            timestamps = [0, 100, 200, 450, 500]
            with av.open(str(webm), 'w', format='webm') as output:
                stream = output.add_stream('libvpx', rate=10)
                stream.width, stream.height, stream.pix_fmt = 64, 48, 'yuv420p'
                stream.codec_context.time_base = Fraction(1, 1000)
                for index, timestamp in enumerate(timestamps):
                    frame = av.VideoFrame.from_ndarray(np.full((48, 64, 3), index*40, dtype=np.uint8), format='rgb24')
                    frame.pts, frame.time_base = timestamp, Fraction(1, 1000)
                    for packet in stream.encode(frame): output.mux(packet)
                for packet in stream.encode(): output.mux(packet)
            with ZipFile(archive, 'w') as zipped:
                zipped.writestr('run.json', json.dumps({'format':'clemson-go2-run','version':1,'media':[{'file':'dashboard.webm'}]}))
                zipped.write(webm, 'dashboard.webm')
            export_mp4(archive, mp4)
            with av.open(str(mp4)) as output:
                actual = [frame.time for frame in output.decode(video=0)]
                self.assertEqual(output.streams.video[0].codec_context.name, 'h264')
            self.assertEqual(len(actual), len(timestamps))
            for observed, expected in zip(actual, timestamps):
                self.assertAlmostEqual(observed, expected/1000, places=3)
            with self.assertRaises(FileExistsError): export_mp4(archive, mp4)


if __name__ == '__main__': unittest.main()
