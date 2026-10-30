"""Step 1: turn 21 MediaPipe landmarks into one gesture name.

In the mirrored view, x increases right and y increases down. Ambiguous poses
return UNKNOWN. These are geometric rules, not classifier confidence scores.
"""
from math import isfinite, sqrt


def distance(a, b):
    return sqrt(sum((u - v) ** 2 for u, v in zip(a, b)))


def points_from(landmarks):
    """Accept MediaPipe objects or [x, y, z] lists for classroom examples."""
    if len(landmarks) != 21:
        return None
    try:
        points = [tuple((p.x, p.y, p.z) if hasattr(p, 'x') else p) for p in landmarks]
        if any(len(p) != 3 or not all(isfinite(v) for v in p) for p in points):
            return None
        return points
    except (TypeError, ValueError):
        return None


def direction(start, end):
    """Pointing direction is measured on the mirrored screen, not in depth.

    Palm orientation is checked separately. A raised fingertip's depth should
    not make an otherwise vertical screen direction become UNCLEAR.
    """
    dx, dy, _depth = (b - a for a, b in zip(start, end))
    length = sqrt(dx * dx + dy * dy)
    if length < .02:
        return 'UNCLEAR'
    if -dy / length >= .85:
        return 'UP'
    if dy / length >= .85:
        return 'DOWN'
    if -dx / length >= .85:
        return 'LEFT'
    return 'UNCLEAR'


def palm_faces_camera(points, handedness):
    """Estimate palm facing from a normal and mirrored MediaPipe handedness.

    This is a heuristic: check it with the operator in preview before motion.
    """
    wrist, index_base, little_base = points[0], points[5], points[17]
    a = [x - y for x, y in zip(index_base, wrist)]
    b = [x - y for x, y in zip(little_base, wrist)]
    normal = (a[1]*b[2] - a[2]*b[1], a[2]*b[0] - a[0]*b[2], a[0]*b[1] - a[1]*b[0])
    length = sqrt(sum(v*v for v in normal))
    if length < .0001:
        return False
    sign = {'Right': 1, 'Left': -1}.get(handedness, 0)
    return sign * normal[2] / length > .65


def classify(landmarks, handedness=None):
    """Return STOP, FORWARD, STRAFE_LEFT/RIGHT, TURN_LEFT/RIGHT, or UNKNOWN."""
    points = points_from(landmarks)
    if points is None:
        return 'UNKNOWN'
    # Wrist=0, thumb tip=4; finger tips=8,12,16,20. An extended finger
    # reaches farther from the wrist than its middle joint.
    extended = tuple(distance(points[tip], points[0]) > 1.18 * distance(points[joint], points[0])
                     for tip, joint in ((8, 6), (12, 10), (16, 14), (20, 18)))
    index, middle, ring, little = extended
    if all(extended):
        return 'STOP'
    if not any(extended):
        thumb_out = (distance(points[4], points[0]) > 1.18 * distance(points[3], points[0])
                     and distance(points[4], points[5]) > .6 * distance(points[5], points[17]))
        thumb_direction = direction(points[2], points[4])
        if thumb_out and thumb_direction == 'UP':
            return 'TURN_LEFT'
        if thumb_out and thumb_direction == 'DOWN':
            return 'TURN_RIGHT'
        return 'UNKNOWN' if thumb_out else 'STOP'
    index_direction = direction(points[5], points[8])
    if index and not middle and not ring and not little:
        if index_direction == 'UP' and palm_faces_camera(points, handedness):
            return 'FORWARD'
        if index_direction == 'LEFT':
            return 'STRAFE_LEFT'
    if index and middle and not ring and not little:
        if index_direction == 'LEFT' and direction(points[9], points[12]) == 'LEFT':
            return 'STRAFE_RIGHT'
    return 'UNKNOWN'


def diagnose(landmarks, handedness=None):
    """Explain recognition for the UI without relaxing motion/stop checks."""
    points = points_from(landmarks)
    if points is None:
        return {'label': 'UNKNOWN', 'hint': 'Keep your whole hand in view.'}
    names = ('index', 'middle', 'ring', 'little')
    extended = [name for name, (tip, joint) in zip(names, ((8,6),(12,10),(16,14),(20,18)))
                if distance(points[tip], points[0]) > 1.18 * distance(points[joint], points[0])]
    label = classify(points, handedness)
    pointing = direction(points[5], points[8])
    palm_facing = palm_faces_camera(points, handedness)
    if label == 'FORWARD':
        hint = 'Forward recognized. Hold steady for 0.3 seconds.'
    elif extended == ['index'] and pointing == 'UP' and not palm_facing:
        hint = 'Index is up. Turn your palm toward the webcam and keep your wrist visible.'
    elif extended == ['index'] and pointing != 'UP' and label == 'UNKNOWN':
        hint = 'Point your index straight up in the hand panel for forward.'
    elif label == 'UNKNOWN':
        hint = 'For forward: raise only the index; curl middle, ring, and little fingers.'
    else:
        hint = {'STOP': 'Stop pose. For forward, raise only your index finger.',
                'STRAFE_LEFT': 'Index points left: sideways left.',
                'STRAFE_RIGHT': 'Two fingers point left: sideways right.',
                'TURN_LEFT': 'Thumb up: turn left in place.',
                'TURN_RIGHT': 'Thumb down: turn right in place.'}.get(label, 'Keep one hand in view.')
    return {'label': label, 'hint': hint, 'extended_fingers': extended,
            'index_direction': pointing, 'palm_facing': palm_facing,
            'handedness': handedness or 'Unknown'}
