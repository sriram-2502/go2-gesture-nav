#!/usr/bin/env python3
"""Bounded Go2 Sport velocity test using ROS 2 Foxy; no SDK2 Python needed.

Run on the Jetson after sourcing Foxy, cyclonedds_ws, and go2_ws.
Example: python3 go2_walk.py --vel 0.5 --time 5
The robot must already stand and walk normally with its remote.
Time is CRUISE duration; acceleration, deceleration and settling add time/travel.
Normal finish: ramp down, zero velocity, StopMove, then BalanceStand if stopped.
Ctrl+C, termination or faults bypass the ramp and request stopping immediately.
Default: no recording. Choose --record-states or --record-all for SQLite bags.
Stop-only commands bypass recording startup so stopping is never delayed by it.
No stand-up, damping, or motion-service changes are made.
"""

import argparse
from datetime import datetime, timezone
import json
import math
import os
from pathlib import Path
import shutil
import signal
import sqlite3
import subprocess
import sys
import time
import uuid
from xml.sax.saxutils import quoteattr


def arguments(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--vel', '--vx', dest='vx', type=float, default=0.5,
                        help='Forward cruise velocity: magnitude 0.5 to 1.0 m/s (default: 0.5).')
    parser.add_argument('--vy', type=float, default=0.0,
                        help='Lateral velocity in m/s (default: 0).')
    parser.add_argument('--yaw-rate', type=float, default=0.0,
                        help='Turning velocity in rad/s (default: 0).')
    parser.add_argument('--time', '--duration', dest='duration', type=float,
                        default=5.0, help='Cruise duration in seconds, excluding ramps (default: 5).')
    parser.add_argument('--ramp-up', type=float, default=1.0,
                        help='Acceleration ramp duration in seconds (default: 1).')
    parser.add_argument('--ramp-down', type=float, default=1.0,
                        help='Normal-finish deceleration duration in seconds (default: 1).')
    parser.add_argument('--interface', default='eth0')
    parser.add_argument('--state-topic', default='/lf/sportmodestate')
    parser.add_argument('--stop', action='store_true',
                        help='Stop immediately, then request BalanceStand only if stop is confirmed.')
    recording = parser.add_mutually_exclusive_group()
    recording.add_argument('--record-states', dest='record_mode', action='store_const',
                           const='states', help='Record robot states, commands and available visualization topics.')
    recording.add_argument('--record-all', dest='record_mode', action='store_const',
                           const='all', help='Record all discoverable supported ROS topics, including camera/LiDAR.')
    recording.add_argument('--no-record', dest='record_mode', action='store_const',
                           const='none', help='Do not record (default).')
    parser.set_defaults(record_mode='none')
    parser.add_argument('--log-dir', default=str(Path.home() / 'go2_ws' / 'logs'),
                        help='Parent directory for recordings (default: ~/go2_ws/logs).')
    args = parser.parse_args(argv)
    for name, value, limit in [('vel', args.vx, 1.0), ('vy', args.vy, 0.2),
                               ('yaw-rate', args.yaw_rate, 0.5)]:
        if not math.isfinite(value) or abs(value) > limit:
            parser.error('{} must be finite and within +/- {}'.format(name, limit))
    if not args.stop and abs(args.vx) < 0.5:
        parser.error('Cruise speed magnitude must be at least 0.5 m/s; use --stop to stop. '
                     'The ramps intentionally pass through lower speeds.')
    if not math.isfinite(args.duration) or not 0 < args.duration <= 30:
        parser.error('--time must be finite and between 0 and 30 seconds')
    if not args.interface:
        parser.error('--interface cannot be empty')
    for name, value in [('ramp-up', args.ramp_up), ('ramp-down', args.ramp_down)]:
        if not math.isfinite(value) or not 0.2 <= value <= 3.0:
            parser.error('--{} must be between 0.2 and 3 seconds'.format(name))
    return args


STATE_TOPICS = [
    '/sportmodestate', '/lf/sportmodestate', '/lowstate', '/lf/lowstate',
    '/wirelesscontroller', '/wirelesscontroller_unprocessed', '/servicestate',
    '/selftest', '/lf/battery_alarm', '/utlidar/imu', '/utlidar/robot_odom',
    '/utlidar/robot_pose', '/lio_sam_ros2/mapping/odometry',
    '/uslam/frontend/odom', '/uslam/localization/odom', '/utlidar/lidar_state',
    '/joint_states', '/imu/data', '/odom', '/tf', '/tf_static',
    '/robot_description', '/diagnostics', '/rosout',
    '/api/sport/request', '/api/sport/response',
]


class BagRecorder:
    """Separate recorder process, stopped only after robot stop/stance requests."""

    def __init__(self, args):
        self.args = args
        self.proc = None
        self.log_file = None
        self.folder = None
        self.info = {}
        self.last_disk_check = 0.0

    def snapshot_definitions(self):
        packages = ['unitree_go', 'unitree_api', 'builtin_interfaces', 'std_msgs',
                    'sensor_msgs', 'geometry_msgs', 'nav_msgs', 'tf2_msgs',
                    'diagnostic_msgs', 'rcl_interfaces', 'rosgraph_msgs']
        prefixes = os.environ.get('AMENT_PREFIX_PATH', '').split(os.pathsep)
        copied = []
        for package in packages:
            for prefix in prefixes:
                if not prefix:
                    continue
                source = Path(prefix) / 'share' / package
                if not (source / 'msg').is_dir():
                    continue
                target = self.folder / 'message_definitions' / 'share' / package
                shutil.copytree(str(source / 'msg'), str(target / 'msg'))
                if (source / 'package.xml').is_file():
                    shutil.copy2(str(source / 'package.xml'), str(target / 'package.xml'))
                copied.append(package)
                break
        return copied

    def write_info(self):
        if self.folder is not None:
            temp = self.folder / 'run.json.tmp'
            temp.write_text(json.dumps(self.info, indent=2) + '\n')
            temp.replace(self.folder / 'run.json')

    def start(self, node, pump, is_interrupted):
        ros2 = shutil.which('ros2')
        if ros2 is None:
            raise RuntimeError('ros2 executable unavailable; recording required, so not walking.')
        root = Path(self.args.log_dir).expanduser().resolve()
        root.mkdir(parents=True, exist_ok=True)
        if shutil.disk_usage(str(root)).free < 512 * 1024 * 1024:
            raise RuntimeError('Less than 512 MiB disk free; not starting a recorded walk.')
        stamp = datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S_%fZ')
        self.folder = root / ('walk_{}_{}'.format(stamp, uuid.uuid4().hex[:6]))
        self.folder.mkdir(exist_ok=False)  # A collision fails rather than overwriting a run.
        topics = sorted(set(STATE_TOPICS + [self.args.state_topic]))
        # Sensor streams may be best-effort. These subscriptions match both
        # reliable and best-effort publishers. Preserve static TF durability.
        overrides = []
        for topic in topics:
            if topic in ['/tf_static', '/robot_description']:
                overrides.append('{}:\n  reliability: reliable\n  durability: transient_local\n'
                                 '  history: keep_last\n  depth: 10\n'.format(topic))
            elif topic not in ['/api/sport/request', '/api/sport/response', '/rosout']:
                overrides.append('{}:\n  reliability: best_effort\n  durability: volatile\n'
                                 '  history: keep_last\n  depth: 200\n'.format(topic))
        qos_file = self.folder / 'qos_overrides.yaml'
        qos_file.write_text('\n'.join(overrides))
        command = [ros2, 'bag', 'record', '-s', 'sqlite3', '-o', str(self.folder / 'bag'),
                   '--qos-profile-overrides-path', str(qos_file)]
        command.extend(['-a'] if self.args.record_mode == 'all' else topics)
        self.info = {
            'started_utc': datetime.now(timezone.utc).isoformat(),
            'arguments': vars(self.args), 'command': command,
            'storage': 'sqlite3', 'topics_requested': 'all' if self.args.record_mode == 'all' else topics,
            'ros_distro': os.environ.get('ROS_DISTRO'),
            'ament_prefix_path': os.environ.get('AMENT_PREFIX_PATH'),
            'status': 'starting',
            'clock_note': 'Bag receive times use the Jetson clock; robot timestamps are preserved as received.',
        }
        try:
            self.info['message_definition_packages'] = self.snapshot_definitions()
        except Exception as exc:
            self.info['message_definition_snapshot_error'] = str(exc)
            print('Message-definition snapshot incomplete: {}'.format(exc), flush=True)
        shutil.copy2(str(Path(__file__).resolve()), str(self.folder / 'go2_walk.py'))
        self.write_info()
        self.log_file = (self.folder / 'recorder.log').open('wb')
        self.proc = subprocess.Popen(command, stdout=self.log_file, stderr=subprocess.STDOUT,
                                     stdin=subprocess.DEVNULL, start_new_session=True)
        print('Recording folder: {}'.format(self.folder), flush=True)
        # Require recorder subscriptions on state and command streams before
        # permitting nonzero velocity. Optional topics can appear later.
        required = set([self.args.state_topic, '/lf/lowstate',
                        '/api/sport/request', '/api/sport/response'])
        deadline = time.monotonic() + 12.0
        while time.monotonic() < deadline:
            if is_interrupted():
                raise InterruptedError()
            self.check()
            ready = set()
            for topic in required:
                endpoints = node.get_subscriptions_info_by_topic(topic)
                if any('rosbag' in ep.node_name or 'recorder' in ep.node_name for ep in endpoints):
                    ready.add(topic)
            if ready == required and any((self.folder / 'bag').glob('*.db3')):
                pump(0.5)  # Record a short stationary baseline.
                self.check()
                self.info['status'] = 'recording'
                self.write_info()
                print('Recorder subscribed to core state/command topics.', flush=True)
                return
            pump(0.1)
        raise RuntimeError('Recorder readiness timed out; not walking. See {}'.format(
            self.folder / 'recorder.log'))

    def check(self):
        if self.proc is not None and self.proc.poll() is not None:
            raise RuntimeError('Rosbag recorder exited ({}); see recorder.log.'.format(
                self.proc.returncode))
        now = time.monotonic()
        if self.folder is not None and now - self.last_disk_check >= 1.0:
            self.last_disk_check = now
            if shutil.disk_usage(str(self.folder)).free < 256 * 1024 * 1024:
                raise RuntimeError('Recording disk space low; stopping the walk.')

    def close(self, motion_result):
        if self.folder is None:
            return True
        clean = False
        if self.proc is not None:
            if self.proc.poll() is None:
                try:
                    os.killpg(self.proc.pid, signal.SIGINT)
                except ProcessLookupError:
                    pass
                try:
                    self.proc.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    print('Recorder flush timed out; terminating it. Bag may be incomplete.', flush=True)
                    try:
                        os.killpg(self.proc.pid, signal.SIGTERM)
                    except ProcessLookupError:
                        pass
                    try:
                        self.proc.wait(timeout=3)
                    except subprocess.TimeoutExpired:
                        try:
                            os.killpg(self.proc.pid, signal.SIGKILL)
                        except ProcessLookupError:
                            pass
                        self.proc.wait(timeout=3)
            self.info['recorder_returncode'] = self.proc.returncode
            clean = (self.proc.returncode in (0, 130, -signal.SIGINT)
                     and (self.folder / 'bag' / 'metadata.yaml').is_file())
        if self.log_file is not None:
            self.log_file.close()
        counts = {}
        try:
            for database in sorted((self.folder / 'bag').glob('*.db3')):
                with sqlite3.connect(database.as_uri() + '?mode=ro', uri=True) as conn:
                    rows = conn.execute(
                        'SELECT topics.name, COUNT(messages.id) FROM topics '
                        'LEFT JOIN messages ON messages.topic_id = topics.id GROUP BY topics.id')
                    for topic, count in rows:
                        counts[topic] = counts.get(topic, 0) + count
        except Exception as exc:
            self.info['bag_inspection_error'] = str(exc)
            clean = False
        required = set([self.args.state_topic, '/lf/lowstate',
                        '/api/sport/request', '/api/sport/response'])
        missing = sorted(topic for topic in required if counts.get(topic, 0) == 0)
        if missing:
            clean = False
            print('Recording has no messages on core topics: {}'.format(', '.join(missing)), flush=True)
        self.info.update({'finished_utc': datetime.now(timezone.utc).isoformat(),
                          'motion_exit_code': motion_result, 'recording_verified': clean,
                          'message_counts': counts,
                          'status': 'closed' if clean else 'incomplete_or_unverified'})
        self.write_info()
        print('Bag: {}'.format(self.folder / 'bag'), flush=True)
        print('Recording {}: {} messages on {} topics.'.format(
            'verified' if clean else 'incomplete/unverified', sum(counts.values()), len(counts)), flush=True)
        return clean


def main(argv=None):
    args = arguments(argv)
    os.environ['ROS_DOMAIN_ID'] = '0'
    os.environ['ROS_LOCALHOST_ONLY'] = '0'
    os.environ['RMW_IMPLEMENTATION'] = 'rmw_cyclonedds_cpp'
    os.environ['CYCLONEDDS_URI'] = (
        '<CycloneDDS><Domain><General><Interfaces><NetworkInterface name={}'
        ' priority="default" multicast="default"/>'
        '</Interfaces></General></Domain></CycloneDDS>'
    ).format(quoteattr(args.interface))

    try:
        import rclpy
        from rclpy.qos import qos_profile_sensor_data
        from unitree_api.msg import Request, Response
        from unitree_go.msg import SportModeState
    except ImportError as exc:
        print('Missing ROS environment: {}\nSource Foxy, cyclonedds_ws, and go2_ws.'.format(exc),
              file=sys.stderr)
        return 1

    rclpy.init(args=[])
    node = rclpy.create_node('go2_walk_test_{}'.format(os.getpid()))
    pub = node.create_publisher(Request, '/api/sport/request', 10)
    state = None
    state_received = 0.0
    interrupted = False
    requests = {}
    responses = {}
    replies = {}
    rejection = None
    samples = []
    phase = 'setup'
    stop_sent = False
    result = 0
    completed = False
    period = 0.02  # 50 Hz velocity requests.
    recorder = None

    def handle_signal(signum, frame):
        nonlocal interrupted
        interrupted = True

    old_handlers = {}
    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
        old_handlers[signum] = signal.signal(signum, handle_signal)

    def on_state(msg):
        nonlocal state, state_received
        state = msg
        state_received = time.monotonic()
        if phase == 'walk':
            samples.append(float(msg.velocity[0]))

    def on_response(msg):
        nonlocal rejection
        request_id = int(msg.header.identity.id)
        if request_id not in requests:
            return  # Do not attribute other clients' responses to this test.
        api = requests.pop(request_id)
        code = int(msg.header.status.code)
        replies[request_id] = code
        key = (api, code)
        responses[key] = responses.get(key, 0) + 1
        if code != 0 and api == 1008:
            rejection = 'Move response status {} (request {})'.format(code, request_id)
            print(rejection, flush=True)

    state_sub = node.create_subscription(
        SportModeState, args.state_topic, on_state, qos_profile_sensor_data)
    response_sub = node.create_subscription(
        Response, '/api/sport/response', on_response, qos_profile_sensor_data)

    def send(api, parameters):
        msg = Request()
        request_id = time.time_ns()
        msg.header.identity.id = request_id
        msg.header.identity.api_id = api
        msg.parameter = json.dumps(parameters)
        requests[request_id] = api
        pub.publish(msg)
        return request_id

    def pump(seconds):
        end = time.monotonic() + seconds
        while time.monotonic() < end:
            rclpy.spin_once(node, timeout_sec=min(0.02, max(0.0, end - time.monotonic())))

    def require_fresh_state():
        if state is None or time.monotonic() - state_received > 1.0:
            raise RuntimeError('No fresh Sport state for 1 second; stopping.')

    def check_motion():
        if interrupted:
            raise InterruptedError()
        if rejection:
            raise RuntimeError(rejection)
        require_fresh_state()
        if recorder is not None:
            recorder.check()

    def velocity(scale):
        send(1008, {'x': args.vx * scale, 'y': args.vy * scale,
                    'z': args.yaw_rate * scale})

    def ramp(duration, accelerating):
        nonlocal phase
        phase = 'ramp-up' if accelerating else 'ramp-down'
        print('{} for {:.1f} s'.format(phase, duration), flush=True)
        start = time.monotonic()
        while time.monotonic() - start < duration:
            check_motion()
            fraction = min(1.0, (time.monotonic() - start) / duration)
            velocity(fraction if accelerating else 1.0 - fraction)
            pump(min(period, max(0.0, start + duration - time.monotonic())))
        check_motion()
        velocity(1.0 if accelerating else 0.0)

    def stop_and_stand():
        """Request zero/stop; only change to balance stand after fresh slow state."""
        nonlocal phase, stop_sent
        phase = 'stop'
        print('Zero velocity, then StopMove...', flush=True)
        delivery_problem = False
        stop_ids = []
        # Continue zero commands briefly so the walking controller can settle.
        # Never issue further nonzero velocity from this function.
        for api in (1008, 1003):
            try:
                for _ in range(10):
                    request_id = send(api, {'x': 0.0, 'y': 0.0, 'z': 0.0} if api == 1008 else {})
                    if api == 1003:
                        stop_sent = True
                        stop_ids.append(request_id)
                    pump(0.05)
            except Exception as exc:
                print('Stop sequence communication problem: {}'.format(exc), file=sys.stderr)
                delivery_problem = True

        if delivery_problem:
            raise RuntimeError('Stop delivery is uncertain; use the remote.')

        # Base speed is a useful guard, not proof of four-foot contact.
        deadline = time.monotonic() + 3.0
        slow_since = None
        while time.monotonic() < deadline:
            require_fresh_state()
            speed = math.sqrt(sum(float(v) ** 2 for v in state.velocity))
            slow = math.isfinite(speed) and speed < 0.08 and abs(state.yaw_speed) < 0.15
            if slow:
                if slow_since is None:
                    slow_since = time.monotonic()
                if time.monotonic() - slow_since >= 0.3:
                    break
            else:
                slow_since = None
            pump(0.05)
        else:
            raise RuntimeError('Low base speed was not confirmed; BalanceStand skipped. Use the remote.')

        if not any(replies.get(i) == 0 for i in stop_ids):
            raise RuntimeError('No successful StopMove reply; BalanceStand skipped. Use the remote.')
        if not math.isfinite(state.body_height) or state.body_height < 0.15:
            raise RuntimeError('Upright body height not confirmed; BalanceStand skipped.')

        print('Low base speed confirmed. Requesting BalanceStand (1002)...', flush=True)
        accepted = False
        for _ in range(3):
            request_id = send(1002, {})
            deadline = time.monotonic() + 0.5
            while time.monotonic() < deadline and request_id not in replies:
                pump(0.02)
            if request_id in replies:
                if replies[request_id] != 0:
                    raise RuntimeError('BalanceStand rejected: status {}. Use the remote.'.format(
                        replies[request_id]))
                accepted = True
                break
        if not accepted:
            raise RuntimeError('BalanceStand acknowledgement missing; stance is unconfirmed.')
        pump(1.0)
        require_fresh_state()
        speed = math.sqrt(sum(float(v) ** 2 for v in state.velocity))
        if (not math.isfinite(speed) or not math.isfinite(state.yaw_speed)
                or speed >= 0.08 or abs(state.yaw_speed) >= 0.15):
            raise RuntimeError('Robot still reports motion after BalanceStand; use the remote.')
        print('BalanceStand accepted; base motion is low. Visually confirm all four feet are down.',
              flush=True)

    try:
        print('Recording mode: {}'.format(
            'none (stop-only)' if args.stop else args.record_mode), flush=True)
        print('Discovering Sport interface on {}...'.format(args.interface), flush=True)
        deadline = time.monotonic() + 5.0
        while pub.get_subscription_count() == 0 or (state is None and not args.stop):
            if interrupted:
                raise InterruptedError()
            if time.monotonic() >= deadline:
                raise RuntimeError('Missing Sport subscriber or state. Check DDS and --state-topic.')
            pump(0.05)

        if not args.stop:
            if args.record_mode != 'none':
                recorder = BagRecorder(args)
                recorder.start(node, pump, lambda: interrupted)
            require_fresh_state()
            print('State: mode={}, gait={}, error_code={}, height={:.3f} m'.format(
                state.mode, state.gait_type, state.error_code, state.body_height), flush=True)
            print('Request: vx={:.2f}, vy={:.2f} m/s, yaw={:.2f} rad/s for {:.1f} s'.format(
                args.vx, args.vy, args.yaw_rate, args.duration), flush=True)
            print('Cruise time excludes {:.1f}s ramp-up and {:.1f}s ramp-down; allow extra travel.'.format(
                args.ramp_up, args.ramp_down), flush=True)
            print('Starts in 3 seconds. Keep the remote ready. Ctrl+C requests stop.', flush=True)
            countdown = time.monotonic() + 3.0
            while time.monotonic() < countdown:
                check_motion()
                pump(0.05)
            require_fresh_state()

            ramp(args.ramp_up, accelerating=True)
            phase = 'walk'
            start = time.monotonic()
            end = start + args.duration
            next_report = start
            while time.monotonic() < end:
                check_motion()
                velocity(1.0)
                now = time.monotonic()
                if now >= next_report:
                    print('t={:.1f}s measured vx={:.3f} vy={:.3f} yaw={:.3f} | mode={} gait={} code={}'.format(
                        now - start, state.velocity[0], state.velocity[1], state.yaw_speed,
                        state.mode, state.gait_type, state.error_code), flush=True)
                    next_report = now + 0.5
                pump(min(period, max(0.0, end - time.monotonic())))
            check_motion()
            completed = True
    except InterruptedError:
        print('Interrupted; requesting stop.', flush=True)
        result = 130
    except Exception as exc:
        print('Test stopped: {}'.format(exc), file=sys.stderr, flush=True)
        result = 1
    finally:
        try:
            if completed and not interrupted and not rejection:
                try:
                    ramp(args.ramp_down, accelerating=False)
                except InterruptedError:
                    print('Ramp interrupted; stopping immediately.', flush=True)
                    result = 130
                except Exception as exc:
                    print('Ramp aborted: {}'.format(exc), file=sys.stderr)
                    result = 1
            stop_and_stand()
        except Exception as exc:
            print('Stop/stance not confirmed: {} Use the remote if needed.'.format(exc), file=sys.stderr)
            result = 1
        finally:
            # Keep recording through all zero/stop/BalanceStand requests and
            # the final settling observation. Finalize before restoring signals.
            if recorder is not None:
                try:
                    if not recorder.close(result):
                        result = 1
                except Exception as exc:
                    print('Could not finalize recording: {}'.format(exc), file=sys.stderr)
                    result = 1
            node.destroy_node()
            if rclpy.ok():
                rclpy.shutdown()
            for signum, handler in old_handlers.items():
                signal.signal(signum, handler)

    if samples:
        print('Mean reported forward velocity during command: {:.3f} m/s ({} samples)'.format(
            sum(samples) / len(samples), len(samples)))
    if responses:
        for (api, code), count in sorted(responses.items()):
            print('API {} response status {}: {} replies'.format(api, code, count))
    else:
        print('No matching API replies received; request publication does not prove execution.')
    if stop_sent:
        print('Stop sequence finished. Hardware contact/stance must be checked visually.')
    if rejection and result == 0:
        result = 1
    return result


if __name__ == '__main__':
    sys.exit(main())
