"""Loopback-only preview of the existing course perception worker. No robot I/O."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import threading
import time

from . import safety, vision


class Preview:
    def __init__(self, worker_factory=vision.Webcam):
        self.factory = worker_factory
        self.lock = threading.RLock()
        self.worker = None
        self.last_viewer = 0.0
        self.supervisor = safety.Supervisor()

    def configure(self, forward, turn):
        with self.lock:
            self.supervisor = safety.Supervisor(safety.Limits(forward=forward, yaw=turn))

    def start(self, camera):
        if isinstance(camera, bool) or not isinstance(camera, int) or not 0 <= camera <= 9:
            raise ValueError('Camera index must be an integer from 0 to 9')
        with self.lock:
            if self.worker is not None:
                if self.worker.is_alive():
                    raise ValueError('Webcam is already active; stop it before changing camera')
                self.worker = None
            self.worker = self.factory(camera)
            self.supervisor.reset()
            self.last_viewer = time.monotonic()
            self.worker.start()

    def stop(self):
        with self.lock:
            worker = self.worker
            if worker is None:
                return
            worker.quit.set()
        worker.join(timeout=5)
        with self.lock:
            if worker.is_alive():
                raise RuntimeError('Webcam is still shutting down; try Stop again')
            if self.worker is worker:
                self.worker = None

    def snapshot(self):
        with self.lock:
            now = time.monotonic()
            self.last_viewer = now
            data = dict(active=False, fresh=False, label='NO_HAND', fps=0,
                        landmarks=[], age_ms=None, proposed_velocity=[0, 0, 0],
                        supervised_velocity=[0, 0, 0], navigation_status='WEBCAM OFF',
                        frame_id=0, input_timeout_ms=400,
                        speeds=dict(forward=self.supervisor.limits.forward,
                                    turn=self.supervisor.limits.yaw, lateral=.5),
                        recognition={}, recognition_hint='Start the webcam to check your gesture.',
                        robot_control=False, error='')
            if self.worker is None:
                return data
            landmarks, prediction, error, fps = self.worker.extracted_snapshot()
            age = now - prediction.timestamp
            fresh = bool(not error and 0 < prediction.timestamp and 0 <= age <= .4)
            approved, reason = self.supervisor.approve(prediction, now, enabled=not bool(error))
            data.update(active=self.worker.is_alive(), fresh=fresh, error=error,
                        fps=round(fps, 1), label=prediction.label if fresh else 'NO_HAND',
                        frame_id=prediction.timestamp, supervised_velocity=list(approved), navigation_status=reason,
                        age_ms=round(age * 1000) if prediction.timestamp else None)
            if fresh:
                data.update(landmarks=landmarks,
                            proposed_velocity=list(self.supervisor.requested(prediction.label)))
                recognition = getattr(self.worker, 'recognition_snapshot', lambda: {})()
                if recognition.get('timestamp') == prediction.timestamp:
                    data.update(recognition=recognition, recognition_hint=recognition.get('hint', ''))
                else:
                    data['recognition_hint'] = 'Keep one hand visible; recognition is updating.'
            return data

    def expire(self, now=None):
        with self.lock:
            expired = self.worker is not None and (now or time.monotonic()) - self.last_viewer > 8
        if expired:
            self.stop()


def make_handler(preview, default_camera=0):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def reply(self, status, data):
            raw = json.dumps(data, allow_nan=False).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Cache-Control', 'no-store')
            self.send_header('Content-Length', str(len(raw)))
            self.end_headers()
            try:
                self.wfile.write(raw)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def trusted(self):
            origin = self.headers.get('Origin')
            return origin in (None, 'http://127.0.0.1:5174', 'http://localhost:5174')

        def do_GET(self):
            if not self.trusted():
                return self.reply(403, {'error': 'Local Clemson dashboard only'})
            if self.path.split('?')[0] != '/snapshot':
                return self.reply(404, {'error': 'Unknown endpoint'})
            try:
                self.reply(200, preview.snapshot())
            except Exception as error:
                self.reply(500, {'error': str(error)})

        def do_POST(self):
            if not self.trusted() or self.headers.get('X-Clemson-Preview') != '1':
                return self.reply(403, {'error': 'Local preview request required'})
            try:
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 <= length <= 256:
                    return self.reply(413, {'error': 'Request too large'})
                data = json.loads(self.rfile.read(length) or b'{}')
                if self.path == '/start':
                    preview.start(data.get('camera', default_camera))
                elif self.path == '/stop':
                    preview.stop()
                elif self.path == '/settings':
                    preview.configure(data.get('forward'), data.get('turn'))
                else:
                    return self.reply(404, {'error': 'Unknown endpoint'})
                self.reply(200, {'ok': True})
            except (ValueError, TypeError, AttributeError) as error:
                self.reply(400, {'error': str(error)})
            except Exception as error:
                self.reply(500, {'error': str(error)})
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=8766)
    parser.add_argument('--camera', type=int, default=0, help='Webcam index, default 0; no camera selector in the UI')
    args = parser.parse_args()
    if not 0 <= args.camera <= 9:
        parser.error('--camera must be from 0 to 9')
    preview = Preview()
    server = ThreadingHTTPServer(('127.0.0.1', args.port), make_handler(preview, args.camera))
    done = threading.Event()

    def watchdog():
        while not done.wait(1):
            try:
                preview.expire()
            except RuntimeError:
                pass

    threading.Thread(target=watchdog, daemon=True).start()
    print(f'Webcam preview service: http://127.0.0.1:{args.port}', flush=True)
    print('Hand tracking starts when the UI panel opens. Gesture control stays disabled until enabled in the UI.', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        done.set()
        preview.stop()
        server.server_close()


if __name__ == '__main__':
    main()
