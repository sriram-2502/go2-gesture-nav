"""Bounded Windows Go2 WebRTC velocity test; robot must already stand."""
import asyncio
import argparse
import getpass
import json
import math
import os
import re
import time



def arguments(argv=None):
    parser = argparse.ArgumentParser(
        description='Go2 AP WebRTC velocity test. Robot must already be standing.')
    parser.add_argument('--vel', '--vx', dest='velocity', type=float, default=0.5,
                        help='Forward speed: zero or magnitude 0.5 to 1.0 m/s. Negative is backward. Default: 0.5.')
    parser.add_argument('--time', '--duration', dest='duration', type=float, default=1.0,
                        help='Velocity-command duration in seconds; greater than 0 and at most 30. Default: 1.')
    parser.add_argument('--vy', type=float, default=0.0, help='Lateral speed, within +/-0.5 m/s.')
    parser.add_argument('--yaw-rate', '--w', dest='yaw_rate', type=float, default=0.0,
                        help='Yaw rate, within +/-1.0 rad/s.')
    parser.add_argument('--stop', action='store_true', help='Zero velocity, StopMove, then guarded BalanceStand only.')
    args = parser.parse_args(argv)
    if args.stop:
        return args
    if not math.isfinite(args.velocity) or not (args.velocity == 0 or 0.5 <= abs(args.velocity) <= 1.0):
        parser.error('--vx/--vel must be zero or have magnitude between 0.5 and 1.0 m/s.')
    if not math.isfinite(args.duration) or not 0 < args.duration <= 30:
        parser.error('--time must be greater than 0 and at most 30 seconds.')
    for name, value, limit in [('vy', args.vy, 0.5), ('yaw-rate', args.yaw_rate, 1.0)]:
        if not math.isfinite(value) or abs(value) > limit:
            parser.error('--{} must be finite and within +/-{}.'.format(name, limit))
    if args.velocity == 0 and args.vy == 0 and args.yaw_rate == 0:
        parser.error('All velocities are zero. Use --stop for stop-and-stance only.')
    return args


def measurements(state):
    values = [float(v) for v in state['velocity']]
    yaw = float(state['yaw_speed'])
    height = float(state['body_height'])
    if len(values) != 3 or not all(math.isfinite(v) for v in values + [yaw, height]):
        raise RuntimeError('Invalid/nonfinite robot state; stopping.')
    return math.sqrt(sum(v*v for v in values)), abs(yaw), height


def is_slow(state):
    speed, yaw, _ = measurements(state)
    return speed < 0.08 and yaw < 0.15


async def finish_stance(fresh, get_state, request, topic, api, sleep=asyncio.sleep):
    """Only called after StopMove success and 0.3 seconds of low-speed feedback."""
    fresh()
    speed, yaw, height = measurements(get_state())
    if speed >= 0.08 or yaw >= 0.15 or height < 0.15:
        raise RuntimeError('Stopped upright state not confirmed; BalanceStand skipped.')
    print('Stop confirmed. Requesting BalanceStand (1002)...', flush=True)
    last_error = None
    for _ in range(3):
        fresh()
        if not is_slow(get_state()) or measurements(get_state())[2] < 0.15:
            raise RuntimeError('State changed; BalanceStand skipped.')
        try:
            await request(topic, api, timeout=0.5)
            break
        except asyncio.TimeoutError as error:
            last_error = error
    else:
        raise RuntimeError('BalanceStand acknowledgement missing. USE THE REMOTE.') from last_error
    # Reject explicit API errors immediately; only missing replies are retried.
    for _ in range(20):
        await sleep(0.05)
        fresh()
        if not is_slow(get_state()) or measurements(get_state())[2] < 0.15:
            raise RuntimeError('Upright low-speed stance not confirmed after BalanceStand. USE THE REMOTE.')
    print('BalanceStand accepted; reported body motion is low. Visually confirm all four feet are down.')


async def main(args):
    from unitree_webrtc_connect import UnitreeWebRTCConnection, WebRTCConnectionMethod
    from unitree_webrtc_connect.constants import RTC_TOPIC, SPORT_CMD
    key = os.environ.get('UNITREE_AES_128_KEY', '').strip()
    if not key:
        key = getpass.getpass('Go2 AES key (hidden input): ').strip()
    if not re.fullmatch(r'[0-9a-fA-F]{32}', key):
        raise RuntimeError('Expected a 32-character hexadecimal AES key.')
    conn = UnitreeWebRTCConnection(WebRTCConnectionMethod.LocalAP, aes_128_key=key)
    state = {}
    state_time = 0.0
    attempted_motion = False
    mode = None

    def receive(message):
        nonlocal state, state_time
        value = message.get('data', {})
        if isinstance(value, str):
            try:
                value = json.loads(value)
            except ValueError:
                return
        if isinstance(value, dict) and 'velocity' in value:
            state, state_time = value, time.monotonic()

    def fresh():
        if not state or time.monotonic() - state_time > 1.0:
            raise RuntimeError('No fresh Sport state; stopping test.')
        measurements(state)

    async def request(topic, api, parameter=None, timeout=1.0):
        options = {'api_id': api}
        if parameter is not None:
            options['parameter'] = parameter
        reply = await asyncio.wait_for(
            conn.datachannel.pub_sub.publish_request_new(topic, options), timeout)
        code = reply['data']['header']['status']['code']
        if code != 0:
            raise RuntimeError('API {} rejected: status {}'.format(api, code))
        return reply

    async def move(scale, timeout=0.4):
        parameter = ({'x': 0.0, 'y': 0.0, 'z': 0.0} if scale == 0 else
                     {'x': args.velocity * scale, 'y': args.vy * scale, 'z': args.yaw_rate * scale})
        if mode == 'mcf':
            # Match the upstream MCF example: Move is sent with no reply.
            channel = conn.datachannel.channel
            if channel.readyState != 'open':
                raise RuntimeError('Data channel closed; use the remote.')
            payload = {
                'header': {
                    'identity': {'id': int(time.time_ns() % 2147483648),
                                 'api_id': SPORT_CMD['Move']},
                    'policy': {'priority': 0, 'noreply': True},
                },
                'parameter': json.dumps(parameter),
                'binary': [],
            }
            conn.datachannel.pub_sub.publish_without_callback(RTC_TOPIC['SPORT_MOD'], payload)
        else:
            await request(RTC_TOPIC['SPORT_MOD'], SPORT_CMD['Move'], parameter, timeout)

    async def stop():
        accepted = False
        print('Sending zero velocity and StopMove...', flush=True)
        for _ in range(3):
            for api, parameter in [(SPORT_CMD['Move'], {'x': 0, 'y': 0, 'z': 0}),
                                   (SPORT_CMD['StopMove'], None)]:
                try:
                    if api == SPORT_CMD['Move']:
                        await move(0, timeout=0.5)
                    else:
                        await request(RTC_TOPIC['SPORT_MOD'], api, parameter, timeout=0.5)
                    if api == SPORT_CMD['StopMove']:
                        accepted = True
                except Exception as error:
                    print('Stop request warning:', type(error).__name__, str(error))
        if not accepted:
            raise RuntimeError('StopMove acknowledgement missing. USE THE REMOTE.')
        slow_since = None
        deadline = time.monotonic() + 3
        while time.monotonic() < deadline:
            fresh()
            slow = is_slow(state)
            if slow:
                slow_since = slow_since or time.monotonic()
                if time.monotonic() - slow_since >= 0.3:
                    break
            else:
                slow_since = None
            await asyncio.sleep(0.05)
        else:
            raise RuntimeError('Low body speed not confirmed; BalanceStand skipped. USE THE REMOTE.')
        await finish_stance(fresh, lambda: state, request, RTC_TOPIC['SPORT_MOD'], SPORT_CMD['BalanceStand'])

    try:
        await asyncio.wait_for(conn.connect(), 30)
        reply = await request(RTC_TOPIC['MOTION_SWITCHER'], 1001)
        mode_data = reply['data']['data']
        if isinstance(mode_data, str):
            mode_data = json.loads(mode_data)
        mode = mode_data['name']
        print('Motion service mode:', mode)
        if mode not in ('normal', 'mcf'):
            raise RuntimeError('Unsupported motion service: {}. No mode changes made.'.format(mode))
        if args.stop:
            attempted_motion = True
        for topic in ('LF_SPORT_MOD_STATE', 'SPORT_MOD_STATE'):
            conn.datachannel.pub_sub.subscribe(RTC_TOPIC[topic], receive)
        if args.stop:
            return  # Finally sends zero/stop immediately, before waiting for state.
        deadline = time.monotonic() + 5
        while not state and time.monotonic() < deadline:
            await asyncio.sleep(0.05)
        fresh()
        height = float(state.get('body_height', 0))
        print('Reported body height:', height, 'm')
        if not math.isfinite(height) or height < 0.15:
            raise RuntimeError('Upright height not confirmed; no motion requested.')
        print('Command: vx={:.2f}, vy={:.2f} m/s, yaw={:.2f} rad/s for {:.2f}s.'.format(
            args.velocity, args.vy, args.yaw_rate, args.duration))
        print('No acceleration/deceleration ramps; stop and guarded BalanceStand follow.')
        attempted_motion = True  # Also clean up interruptions during the countdown.
        print('Starts in 3 seconds. Remote ready. Ctrl+C requests immediate stop.')
        for _ in range(30):
            fresh()
            await asyncio.sleep(0.1)
        attempted_motion = True
        count = 0

        async def phase(duration, kind):
            nonlocal count
            print(kind, 'for', duration, 'seconds', flush=True)
            start = time.monotonic()
            end = start + duration
            while time.monotonic() < end:
                fresh()
                await move(1.0)
                count += 1
                await asyncio.sleep(min(0.02, max(0.0, end - time.monotonic())))
            fresh()

        await phase(args.duration, 'velocity command')
        print('Move requests sent (MCF does not acknowledge Move):' if mode == 'mcf'
              else 'Accepted Move replies:', count)
        print('Latest reported velocity:', state.get('velocity'))
    finally:
        try:
            if attempted_motion:
                await stop()
        finally:
            await asyncio.wait_for(conn.disconnect(), 5)


if __name__ == '__main__':
    try:
        asyncio.run(main(arguments()))
    except KeyboardInterrupt:
        print('Interrupted. Confirm the robot stopped using the remote.')
        raise SystemExit(130)
    except Exception as error:
        print('TEST ERROR:', type(error).__name__, str(error))
        print('If motion occurred, confirm stopping with the remote.')
        raise SystemExit(1)
