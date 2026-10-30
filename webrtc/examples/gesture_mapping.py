"""First student example: no webcam, dashboard, AES key, or robot required.

Run: python -m webrtc.examples.gesture_mapping
"""
from webrtc.gesture_preview.velocity import Speeds, gesture_to_velocity


speeds = Speeds(forward=0.5, turn=0.8)
gestures = ['FORWARD', 'STRAFE_LEFT', 'STRAFE_RIGHT', 'TURN_LEFT', 'TURN_RIGHT', 'STOP']

for gesture in gestures:
    vx, vy, wz = gesture_to_velocity(gesture, speeds)
    print(f'{gesture:14s} -> vx={vx:+.2f} m/s, vy={vy:+.2f} m/s, wz={wz:+.2f} rad/s')
