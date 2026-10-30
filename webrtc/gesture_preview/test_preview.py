"""Preview lifecycle and stale-data checks without a webcam or robot."""
from http.server import ThreadingHTTPServer
import json
import threading
import time
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

from . import safety
from .server import Preview, make_handler


class Worker:
    def __init__(self, camera):
        self.quit = threading.Event()
        self.alive = False
        self.prediction = safety.Prediction('FORWARD', time.monotonic())

    def start(self): self.alive = True
    def is_alive(self): return self.alive
    def join(self, timeout=None): self.alive = False
    def extracted_snapshot(self):
        return [[[.5, .5, 0] for _ in range(21)]], self.prediction, '', 30.0


class PreviewTests(unittest.TestCase):
    def setUp(self): self.preview = Preview(Worker)
    def tearDown(self): self.preview.stop()

    def test_camera_off_until_explicit_start(self):
        self.assertFalse(self.preview.snapshot()['active'])
        self.assertIsNone(self.preview.worker)

    def test_fresh_preview_and_stale_frame_clearing(self):
        self.preview.start(0)
        fresh = self.preview.snapshot()
        self.assertTrue(fresh['fresh'])
        self.assertEqual(len(fresh['landmarks'][0]), 21)
        self.assertNotIn('frame', fresh)
        self.assertFalse(fresh['robot_control'])
        self.preview.worker.prediction = safety.Prediction('FORWARD', time.monotonic() - 2)
        stale = self.preview.snapshot()
        self.assertFalse(stale['fresh'])
        self.assertEqual(stale['landmarks'], [])
        self.assertEqual(stale['proposed_velocity'], [0, 0, 0])

    def test_idle_viewer_releases_camera(self):
        self.preview.start(0)
        self.preview.expire(self.preview.last_viewer + 9)
        self.assertIsNone(self.preview.worker)

    def test_rejects_competing_camera_and_invalid_index(self):
        for value in (True, -1, 10, '0', 0.5):
            with self.assertRaises(ValueError): self.preview.start(value)
        self.preview.start(0)
        with self.assertRaises(ValueError): self.preview.start(1)

    def test_http_contract_and_foreign_origin_rejection(self):
        server = ThreadingHTTPServer(('127.0.0.1', 0), make_handler(self.preview))
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        base = f'http://127.0.0.1:{server.server_port}'
        try:
            with urlopen(base + '/snapshot') as response:
                self.assertFalse(json.load(response)['active'])
            for headers in ({}, {'X-Clemson-Preview': '1', 'Origin': 'https://example.com'}):
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(base + '/start', data=b'{"camera":0}', headers=headers))
                self.assertEqual(error.exception.code, 403)
            request = Request(base + '/start', data=b'{"camera":0}', headers={'X-Clemson-Preview': '1'})
            with urlopen(request) as response:
                self.assertTrue(json.load(response)['ok'])
        finally:
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == '__main__': unittest.main()
