"""Step 2: map gestures to (vx, vy, wz) in robot body coordinates.

vx/vy: metres/second. wz: radians/second. +vx forward, +vy left, +wz left turn.
"""
from dataclasses import dataclass
from math import isfinite


@dataclass(frozen=True)
class Speeds:
    forward: float = 0.5
    turn: float = 0.8

    def __post_init__(self):
        for name, value in (('forward', self.forward), ('turn', self.turn)):
            if isinstance(value, bool) or not isfinite(value) or not .5 <= value <= 1:
                raise ValueError(f'{name} speed must be finite and between 0.5 and 1.0')


def gesture_to_velocity(label, speeds=Speeds()):
    """One gesture uses one axis. Sideways magnitude is always exactly 0.5."""
    commands = {
        'FORWARD':      (speeds.forward, 0.0, 0.0),
        'STRAFE_LEFT':  (0.0, +0.5, 0.0),
        'STRAFE_RIGHT': (0.0, -0.5, 0.0),
        'TURN_LEFT':    (0.0, 0.0, +speeds.turn),
        'TURN_RIGHT':   (0.0, 0.0, -speeds.turn),
    }
    return commands.get(label, (0.0, 0.0, 0.0))
