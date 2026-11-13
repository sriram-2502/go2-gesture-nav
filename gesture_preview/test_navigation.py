"""Synthetic hand geometry and command checks. These do not verify a real robot."""
import unittest
from .gestures import classify, diagnose
from .safety import Limits, Prediction, Supervisor
from .velocity import Speeds, gesture_to_velocity


def hand(extended=(False, False, False, False), pointing='UP', thumb=None):
    """A small artificial palm for tests; students can inspect all 21 points."""
    points = [[0.0, 0.0, 0.0] for _ in range(21)]
    points[2], points[3], points[4] = [-.18, -.1, 0], [-.12, -.15, 0], [-.08, -.12, 0]
    bases = [(-.15, -.30), (-.05, -.34), (.05, -.32), (.15, -.28)]
    dx, dy = {'UP': (0, -1), 'LEFT': (-1, 0), 'DIAGONAL': (-.7, -.7)}[pointing]
    for straight, base, (x, y) in zip(extended, (5, 9, 13, 17), bases):
        points[base] = [x, y, 0]
        points[base + 1] = [x + dx * .14, y + dy * .14, 0]
        points[base + 2] = [x, y, 0]
        points[base + 3] = [x + dx * .4, y + dy * .4, 0] if straight else [x * .7, y * .7, 0]
    if thumb == 'UP': points[3], points[4] = [-.18, -.25, 0], [-.18, -.5, 0]
    if thumb == 'DOWN': points[3], points[4] = [-.18, .05, 0], [-.18, .3, 0]
    return points


class RecognitionTests(unittest.TestCase):
    def test_gesture_vocabulary(self):
        cases = [(hand((1, 0, 0, 0)), 'FORWARD'),
                 (hand((1, 0, 0, 0), 'LEFT'), 'STRAFE_LEFT'),
                 (hand((1, 1, 0, 0), 'LEFT'), 'STRAFE_RIGHT'),
                 (hand(thumb='UP'), 'TURN_LEFT'), (hand(thumb='DOWN'), 'TURN_RIGHT'),
                 (hand(), 'STOP'), (hand((1, 1, 1, 1)), 'STOP')]
        for points, label in cases:
            with self.subTest(label=label): self.assertEqual(classify(points, 'Right'), label)

    def test_both_hands_and_palm_orientation(self):
        right = hand((1, 0, 0, 0))
        left = [[-x, y, z] for x, y, z in right]
        self.assertEqual(classify(left, 'Left'), 'FORWARD')
        self.assertEqual(classify(left, 'Right'), 'UNKNOWN')
        self.assertEqual(classify(right), 'UNKNOWN')

    def test_ambiguous_and_invalid_poses_stop_mapping(self):
        for points in ([], hand((1, 0, 0, 0), 'DIAGONAL'), hand((1, 1, 0, 0))):
            self.assertEqual(classify(points, 'Right'), 'UNKNOWN')
        points = hand()
        points[0][0] = float('nan')
        self.assertEqual(classify(points, 'Right'), 'UNKNOWN')

    def test_up_on_screen_is_not_rejected_for_fingertip_depth(self):
        points = hand((1, 0, 0, 0))
        points[8][2] = -.5
        self.assertEqual(classify(points, 'Right'), 'FORWARD')

    def test_forward_diagnostics_identify_the_blocking_check(self):
        points = hand((1, 0, 0, 0))
        self.assertIn('Forward recognized', diagnose(points, 'Right')['hint'])
        blocked = diagnose(points, 'Left')
        self.assertEqual(blocked['label'], 'UNKNOWN')
        self.assertEqual(blocked['index_direction'], 'UP')
        self.assertFalse(blocked['palm_facing'])
        self.assertIn('palm toward', blocked['hint'])


class NavigationTests(unittest.TestCase):
    def test_exact_axis_mapping_and_fixed_lateral_speed(self):
        for speeds in (Speeds(), Speeds(1, 1)):
            expected = {'FORWARD': (speeds.forward, 0, 0), 'STRAFE_LEFT': (0, .5, 0),
                        'STRAFE_RIGHT': (0, -.5, 0), 'TURN_LEFT': (0, 0, speeds.turn),
                        'TURN_RIGHT': (0, 0, -speeds.turn), 'UNKNOWN': (0, 0, 0)}
            for label, command in expected.items(): self.assertEqual(gesture_to_velocity(label, speeds), command)

    def test_reject_invalid_speed_settings(self):
        for value in (.49, 1.01, float('nan'), float('inf'), True):
            with self.assertRaises(ValueError): Speeds(forward=value)
            with self.assertRaises(ValueError): Speeds(turn=value)

    def test_hold_stop_and_direction_change(self):
        control = Supervisor()
        self.assertEqual(control.approve(Prediction('FORWARD', 10), 10)[0], (0, 0, 0))
        control.approve(Prediction('FORWARD', 10.2), 10.2)
        self.assertEqual(control.approve(Prediction('FORWARD', 10.31), 10.31)[0], (.5, 0, 0))
        self.assertEqual(control.approve(Prediction('STRAFE_LEFT', 10.4), 10.4)[0], (0, 0, 0))
        self.assertEqual(control.approve(Prediction('STOP', 10.41), 10.41)[0], (0, 0, 0))

    def test_frozen_future_stale_and_out_of_order_input(self):
        control = Supervisor()
        prediction = Prediction('FORWARD', 10)
        control.approve(prediction, 10)
        self.assertEqual(control.approve(prediction, 10.35)[1], 'HOLD GESTURE')
        self.assertEqual(control.approve(prediction, 10.41)[1], 'STALE INPUT')
        self.assertEqual(control.approve(Prediction('FORWARD', 12), 11)[1], 'STALE INPUT')
        control.approve(Prediction('FORWARD', 12), 12)
        self.assertEqual(control.approve(Prediction('FORWARD', 11.9), 12)[1], 'OUT OF ORDER INPUT')


if __name__ == '__main__': unittest.main()
