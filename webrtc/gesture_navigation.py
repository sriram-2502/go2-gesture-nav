"""Print gesture velocity commands as JSON. Never connects to a robot.

From repo root: python -m webrtc.gesture_navigation
Without camera: python -m webrtc.gesture_navigation --demo
"""
import argparse
import json
import time
from .gesture_preview.safety import Limits, Prediction, Supervisor


def print_command(supervisor, prediction, now):
    velocity, reason = supervisor.approve(prediction, now)
    print(json.dumps(dict(gesture=prediction.label, frame_time=prediction.timestamp,
                          vx=velocity[0], vy=velocity[1], wz=velocity[2], status=reason)), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--forward-speed', type=float, default=.5)
    parser.add_argument('--turn-speed', type=float, default=.8)
    parser.add_argument('--camera', type=int, default=0)
    parser.add_argument('--demo', action='store_true')
    args = parser.parse_args()
    try:
        supervisor = Supervisor(Limits(forward=args.forward_speed, yaw=args.turn_speed))
    except (TypeError, ValueError) as error:
        parser.error(str(error))
    if args.demo:
        # Five new frames satisfy the hold; no camera or robot is opened.
        timestamp = 10.0
        for label in ('FORWARD', 'STRAFE_LEFT', 'STRAFE_RIGHT', 'TURN_LEFT', 'TURN_RIGHT', 'STOP'):
            for index in range(5):
                print_command(supervisor, Prediction(label, timestamp), timestamp)
                timestamp += .1
            supervisor.reset()
        return
    from .gesture_preview.vision import Webcam
    worker = Webcam(args.camera)
    worker.start()
    try:
        while worker.is_alive():
            _, prediction, error, _ = worker.extracted_snapshot()
            if error:
                print(json.dumps({'status': error, 'vx': 0, 'vy': 0, 'wz': 0}), flush=True)
            else:
                print_command(supervisor, prediction, time.monotonic())
            time.sleep(.1)
    except KeyboardInterrupt:
        pass
    finally:
        worker.quit.set()
        worker.join(timeout=5)
        print(json.dumps({'status': 'STOP', 'vx': 0, 'vy': 0, 'wz': 0}), flush=True)


if __name__ == '__main__':
    main()
