"""Step 3: timestamp validation, motion hold, limits and stop priority.

Pure Python so students can test the command path without a camera or MuJoCo.
All times are monotonic seconds. Zero command requests standing, not motor-off.
"""

from dataclasses import dataclass
from math import isfinite
from .velocity import Speeds, gesture_to_velocity


@dataclass(frozen=True)
class Prediction:
  label: str = "NO_HAND"
  timestamp: float = 0.0


@dataclass(frozen=True)
class Limits:
  forward: float = 0.5  # m/s; configurable from 0.5 to 1.0
  yaw: float = 0.8  # rad/s; configurable from 0.5 to 1.0
  hold: float = 0.30  # seconds of consistent, fresh motion predictions
  timeout: float = 0.40  # seconds since frame acquisition


class Supervisor:
  def __init__(self, limits=Limits()):
    if not all(isfinite(v) and v > 0 for v in (
        limits.forward, limits.yaw, limits.hold, limits.timeout)):
      raise ValueError("Limits must be finite and positive")
    Speeds(limits.forward, limits.yaw)
    self.limits = limits
    self.reset()

  def reset(self):
    self.candidate = None
    self.since = 0.0
    self.last_timestamp = None

  def requested(self, label):
    """Single mapping table shared by command approval and diagnostic logging."""
    return gesture_to_velocity(label, Speeds(self.limits.forward, self.limits.yaw))

  def approve(self, prediction, now, enabled=True, heartbeat=None):
    """Return (bounded command tuple, status); stops bypass motion hold."""
    age = now - prediction.timestamp
    if heartbeat is None:
      heartbeat = now
    if not enabled:
      reason = "DISARMED / STOP LATCHED"
    elif not isfinite(now - heartbeat) or not 0 <= now - heartbeat <= self.limits.timeout:
      reason = "DASHBOARD TIMEOUT"
    elif not isfinite(age) or prediction.timestamp <= 0 or not 0 <= age <= self.limits.timeout:
      reason = "STALE INPUT"
    elif self.last_timestamp is not None and (
        prediction.timestamp < self.last_timestamp
        or prediction.timestamp - self.last_timestamp > self.limits.timeout):
      reason = "OUT OF ORDER INPUT"
    elif self.requested(prediction.label) == (0.0, 0.0, 0.0):
      reason = prediction.label if prediction.label in ("STOP", "NO_HAND", "UNKNOWN") else "UNKNOWN"
    else:
      if self.candidate != prediction.label:
        self.candidate = prediction.label
        self.since = prediction.timestamp
      self.last_timestamp = prediction.timestamp
      # Re-reading one frame must never satisfy the hold interval.
      if prediction.timestamp - self.since < self.limits.hold:
        return (0.0, 0.0, 0.0), "HOLD GESTURE"
      return self.requested(prediction.label), prediction.label
    self.reset()
    return (0.0, 0.0, 0.0), reason
