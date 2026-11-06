/** Robot adapter: students can read the Python examples without changing this file.
 * One existing WebRTC connection; no key handling or second robot connection.
 */
import { RTC_TOPIC, SPORT_CMD, DATA_CHANNEL_TYPE } from '../protocol/topics';
import type { DataChannelMessage } from '../types';
import {sessionRecorder} from './session-recorder';

type Velocity = [number, number, number];
export type GestureInput = {
  fresh: boolean; label: string; frame_id: number; age_ms: number | null;
  supervised_velocity: number[];
};
type SportState = {velocity: number[]; yaw_speed: number; body_height: number;
  mode?: number; error_code?: number; foot_force?: number[]};
export type RobotBehavior = 'none' | 'jump' | 'bound' | 'pose';
type Reply = {header?: {identity?: {id?: number}; status?: {code?: number}}; data?: unknown};
const zero = (): Velocity => [0, 0, 0];
const nonzero = (v: number[]) => v.some(x => x !== 0);
function unpack(value: unknown): any { return typeof value === 'string' ? JSON.parse(value) : value; }

export function validVelocity(v: number[]): v is Velocity {
  if (v.length !== 3 || !v.every(Number.isFinite) || v.filter(x => x !== 0).length > 1) return false;
  const [vx, vy, wz] = v;
  return (vx === 0 || (vx >= .5 && vx <= 1))
    && (vy === 0 || Math.abs(vy) === .5)
    && (wz === 0 || (Math.abs(wz) >= .5 && Math.abs(wz) <= 1));
}

function matchesGesture(input: GestureInput): boolean {
  const [vx, vy, wz] = input.supervised_velocity;
  if (!nonzero(input.supervised_velocity)) return true; // Hold/stop is always allowed.
  return (input.label === 'FORWARD' && vx > 0)
    || (input.label === 'STRAFE_LEFT' && vy === .5)
    || (input.label === 'STRAFE_RIGHT' && vy === -.5)
    || (input.label === 'TURN_LEFT' && wz > 0)
    || (input.label === 'TURN_RIGHT' && wz < 0);
}

export function gestureToPose(label: string): Velocity {
  switch (label) {
    case 'FORWARD': return [0, .12, 0];
    case 'STRAFE_LEFT': return [.12, 0, 0];
    case 'STRAFE_RIGHT': return [-.12, 0, 0];
    case 'TURN_LEFT': return [0, 0, .15];
    case 'TURN_RIGHT': return [0, 0, -.15];
    default: return zero();
  }
}

export class GestureRobot {
  private send: ((message: DataChannelMessage) => void) | null = null;
  private connected: () => boolean = () => false;
  private state: SportState | null = null;
  private stateAt = -Infinity;
  private batteryPercent: number | null = null;
  private batteryAt = -Infinity;
  private videoAt = -Infinity;
  private video: HTMLVideoElement | null = null;
  private mode = '';
  private modeAt = -Infinity;
  private input: GestureInput | null = null;
  private inputAt = -Infinity;
  private inputAge = Infinity;
  private frameAt = -Infinity;
  private lastFrame = 0;
  private enabled = false;
  private enabledFrame = 0;
  private behavior: RobotBehavior = 'none';
  private behaviorConfirmed = false;
  private actionBusy = false;
  private actionGeneration = 0;
  private actionMessage = 'Select a behavior';
  private stateSerial = 0;
  private jumpAt = -Infinity;
  private poseTarget: Velocity = zero();
  private poseEnabledFrame = 0;
  private poseDirty = false;
  private firmwarePose = false;
  private enabling = false;
  private moving = false;
  private busy = false;
  private stopping: Promise<void> | null = null;
  private epoch = 0;
  private connectionEpoch = 0;
  private nextId = 1800000000;
  private sent: Velocity = zero();
  private reason = 'Preview only';
  private stopResult = 'Not requested';
  private stopConfirmed = false;
  private recoveryRequired = false;
  private avoidance: boolean | null = null;
  private avoidanceAt = -Infinity;
  private avoidanceBusy = false;
  private avoidanceMessage = 'Connect to read robot state';
  private pending = new Map<number, {topic: string; resolve: (reply: Reply) => void;
    reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>();

  constructor(private now = () => performance.now(),
              private sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
              timers = true,
              private experimentalStationaryGestures = false) {
    if (timers) {
      setInterval(() => void this.tick(), 50);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void this.focusLost('Browser hidden');
      });
      window.addEventListener('blur', () => void this.focusLost('Browser lost focus'));
    }
  }

  bind(send: (message: DataChannelMessage) => void, connected: () => boolean): void {
    this.detach();
    this.send = send;
    this.connected = connected;
    this.reason = 'Preview only';
  }

  detach(): void {
    sessionRecorder.detachCamera();
    this.enabled = this.enabling = false;
    this.actionGeneration++;
    this.actionBusy = false;
    this.behavior = 'none';
    this.behaviorConfirmed = false;
    this.stopping = null;
    this.actionMessage = 'Select a behavior';
    this.poseTarget = zero();
    this.poseDirty = false;
    this.firmwarePose = false;
    this.jumpAt = -Infinity;
    this.recoveryRequired = false;
    this.epoch++;
    this.connectionEpoch++;
    this.send = null;
    this.connected = () => false;
    this.state = null;
    this.stateAt = -Infinity;
    this.batteryPercent = null;
    this.batteryAt = -Infinity;
    this.mode = '';
    this.videoAt = -Infinity;
    this.moving = false;
    this.sent = zero();
    this.avoidance = null;
    this.avoidanceAt = -Infinity;
    this.avoidanceBusy = false;
    this.avoidanceMessage = 'Connect to read robot state';
    for (const request of this.pending.values()) {
      clearTimeout(request.timer);
      request.reject(new Error('Robot disconnected'));
    }
    this.pending.clear();
    if (this.video) { this.video.srcObject = null; this.video = null; }
  }

  watchVideo(stream: MediaStream): void {
    sessionRecorder.attachCamera(stream);
    if (this.video) this.video.srcObject = null;
    const video = document.createElement('video');
    this.video = video;
    video.muted = true; video.autoplay = true; video.playsInline = true;
    video.srcObject = stream;
    const frame = () => {
      if (this.video !== video) return;
      this.noteVideoFrame();
      video.requestVideoFrameCallback(frame);
    };
    if (video.requestVideoFrameCallback) video.requestVideoFrameCallback(frame);
    void video.play().catch(() => { this.videoAt = -Infinity; });
  }

  noteVideoFrame(): void { this.videoAt = this.now(); }

  private async readAvoidance(connection: number): Promise<boolean> {
    const reply = await this.request(RTC_TOPIC.OBSTACLES_AVOID, 1002);
    const enabled = unpack(reply.data)?.enable;
    if (connection !== this.connectionEpoch) throw new Error('Robot connection changed');
    if (typeof enabled !== 'boolean') throw new Error('Robot did not report a valid avoidance state');
    this.avoidance = enabled;
    this.avoidanceAt = this.now();
    return enabled;
  }

  async refreshObstacleAvoidance(): Promise<void> {
    if (!this.connected() || this.avoidanceBusy) return;
    const connection = this.connectionEpoch;
    this.avoidanceBusy = true;
    this.avoidanceMessage = 'Reading robot state…';
    try {
      const enabled = await this.readAvoidance(connection);
      this.avoidanceMessage = `Robot reports ${enabled ? 'ON' : 'OFF'}`;
    } catch (error) {
      if (connection === this.connectionEpoch) {
        this.avoidance = null;
        this.avoidanceMessage = String(error);
      }
    } finally { if (connection === this.connectionEpoch) this.avoidanceBusy = false; }
  }

  async setObstacleAvoidance(enabled: boolean): Promise<void> {
    if (!this.connected() || this.avoidanceBusy || this.actionBusy || this.recoveryRequired || typeof enabled !== 'boolean') return;
    const connection = this.connectionEpoch;
    const neededStop = this.moving || !!this.stopping || this.behavior !== 'none';
    this.avoidanceBusy = true;
    this.avoidanceMessage = 'Stopping gesture control before changing avoidance…';
    try {
      await this.disable('Obstacle avoidance setting changed');
      if (neededStop && !this.stopConfirmed) throw new Error('Stop not confirmed; avoidance change cancelled');
      if (connection !== this.connectionEpoch) throw new Error('Robot connection changed');
      this.avoidanceMessage = 'Waiting for robot confirmation…';
      await this.request(RTC_TOPIC.OBSTACLES_AVOID, 1001, {enable: enabled});
      const actual = await this.readAvoidance(connection);
      this.avoidanceMessage = actual === enabled ? `Robot confirms ${actual ? 'ON' : 'OFF'}`
        : `Change not confirmed: robot still reports ${actual ? 'ON' : 'OFF'}`;
    } catch (error) {
      if (connection === this.connectionEpoch) {
        this.avoidance = null;
        this.avoidanceMessage = `Change not confirmed: ${String(error)}`;
      }
    } finally { if (connection === this.connectionEpoch) this.avoidanceBusy = false; }
  }

  receive(message: DataChannelMessage): void {
    sessionRecorder.robotMessage('received',message);
    try {
      const data = unpack(message.data);
      // Go2 battery SOC is already carried by the shared lowstate subscription.
      // Display only: this does not send commands or change motion eligibility.
      if (message.topic === RTC_TOPIC.LOW_STATE && message.type !== DATA_CHANNEL_TYPE.RESPONSE) {
        const soc = data?.bms_state?.soc;
        if (typeof soc === 'number' && Number.isFinite(soc) && soc >= 0 && soc <= 100) {
          this.batteryPercent = soc;
          this.batteryAt = this.now();
        }
      }
      if (message.type === DATA_CHANNEL_TYPE.RESPONSE) {
        const id = data?.header?.identity?.id;
        const request = this.pending.get(id);
        if (request && request.topic === message.topic) {
          clearTimeout(request.timer); this.pending.delete(id);
          if (data.header?.status?.code === 0) request.resolve(data);
          else request.reject(new Error(`Robot API rejected: ${data.header?.status?.code ?? 'missing status'}`));
        }
      }
      if (message.topic === RTC_TOPIC.LF_SPORT_MOD_STATE && message.type !== DATA_CHANNEL_TYPE.RESPONSE) {
        if (Array.isArray(data?.velocity) && data.velocity.length === 3
            && [...data.velocity, data.yaw_speed, data.body_height].every(Number.isFinite)) {
          this.state = data; this.stateAt = this.now(); this.stateSerial++;
        }
      }
    } catch { /* Malformed feedback never refreshes state freshness. */ }
  }

  updateInput(input: GestureInput, fetchStarted: number): void {
    const age = input.age_ms;
    if (!validVelocity(input.supervised_velocity) || !matchesGesture(input) || !Number.isFinite(input.frame_id)
        || age === null || !Number.isFinite(age) || age < 0 || input.frame_id < this.lastFrame) {
      this.input = null;
      if (this.enabled) void this.disable('Invalid or out-of-order gesture input');
      // A restarted Python worker must be able to begin a new session.
      if (!this.enabled) this.lastFrame = 0;
      return;
    }
    if (input.frame_id !== this.lastFrame) { this.lastFrame = input.frame_id; this.frameAt = this.now(); }
    this.input = input; this.inputAt = this.now();
    this.inputAge = age + Math.max(0, this.now() - fetchStarted);
    if (this.enabled && !input.fresh) void this.disable('Gesture input expired');
  }

  private problem(gesture = true): string {
    const now = this.now();
    if (!this.connected() || !this.send) return 'Robot not connected';
    if (document.hidden) return 'Browser hidden';
    if (!this.state || now - this.stateAt > 1000) return 'Robot feedback expired';
    if (this.state.body_height < .15) return 'Robot is not confirmed upright';
    if (now - this.videoAt > 1000) return 'Go2 camera frames expired';
    if (gesture && (!this.input?.fresh || now - this.inputAt + this.inputAge > 400 || now - this.frameAt > 400)) return 'Gesture input expired';
    return '';
  }

  async enable(): Promise<void> {
    if (this.enabled || this.enabling || this.stopping || this.avoidanceBusy || this.actionBusy) return;
    if (this.recoveryRequired) { this.reason = 'Restore standing with the remote, then confirm remote recovery'; return; }
    if (this.behavior === 'pose' || this.behavior === 'jump') {
      this.reason = 'Press Stop to leave the current behavior before enabling gestures'; return;
    }
    if (this.behavior === 'bound' && !this.behaviorConfirmed) {
      this.reason = 'Bound is not confirmed; press Stop before enabling gestures'; return;
    }
    const problem = this.problem();
    if (problem) { this.reason = problem; return; }
    const epoch = ++this.epoch;
    this.enabling = true;
    this.reason = 'Checking robot motion service…';
    try {
      await this.refreshMode();
      if (epoch !== this.epoch) return;
      const changed = this.problem();
      if (changed) throw new Error(changed);
      if (!this.navigationBehaviorReady())
        throw new Error('Robot reports an existing behavior; press Stop before enabling gestures');
      this.enabled = true;
      this.enabledFrame = this.input!.frame_id;
      this.reason = 'Gesture control enabled';
    } catch (error) { this.reason = String(error); }
    finally { this.enabling = false; }
  }

  private async refreshMode(): Promise<void> {
    const reply = await this.request(RTC_TOPIC.MOTION_SWITCHER, 1001);
    const mode = unpack(reply.data)?.name;
    if (mode !== 'normal' && mode !== 'mcf') throw new Error('Unsupported robot motion service');
    this.mode = mode; this.modeAt = this.now();
    // Recover ownership after a reconnect instead of sending walking commands
    // into a pose/gait that was already active on the robot.
    if (this.behavior === 'none') {
      const externalPose = mode === 'mcf' ? this.state?.error_code === 1091 : this.state?.mode === 2;
      const existing = externalPose ? 'pose' : this.reportedBehavior('bound') ? 'bound'
        : (mode === 'mcf' ? this.state?.error_code === 2009 : this.state?.mode === 16) ? 'jump' : 'none';
      if (existing !== 'none') {
        this.behavior = existing;
        this.behaviorConfirmed = false;
        this.firmwarePose = externalPose;
        if (existing === 'jump') this.jumpAt = this.now();
        this.actionMessage = 'Robot reports an existing behavior · press Stop first';
      }
    }
  }

  private navigationBehaviorReady(): boolean {
    return !this.recoveryRequired && (this.behavior === 'none' || (this.behavior === 'bound' && this.behaviorConfirmed));
  }

  private raw(topic: string, api: number, parameter: unknown, noreply = false): number {
    if (!this.connected() || !this.send) throw new Error('Robot connection lost; use the remote');
    const id = this.nextId++;
    const message = {type: noreply ? DATA_CHANNEL_TYPE.MSG : DATA_CHANNEL_TYPE.REQUEST, topic,
      data: {header: {identity: {id, api_id: api}, ...(noreply ? {policy: {priority: 0, noreply: true}} : {})},
        parameter: JSON.stringify(parameter ?? {}), binary: []}};
    this.send(message);
    sessionRecorder.robotMessage('sent',message);
    return id;
  }

  private request(topic: string, api: number, parameter: unknown = {}, timeout = 500): Promise<Reply> {
    return new Promise((resolve, reject) => {
      // Register before send; this also works with a synchronous test transport.
      const id = this.nextId;
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`API ${api} acknowledgement timed out; use the remote`)); }, timeout);
      this.pending.set(id, {topic: topic.replace(/request$/, 'response'), resolve, reject, timer});
      try { this.raw(topic, api, parameter); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  private async move(velocity: Velocity): Promise<void> {
    const [x, y, z] = velocity;
    if (this.mode === 'mcf') this.raw(RTC_TOPIC.SPORT_MOD, SPORT_CMD.Move, {x, y, z}, true);
    else await this.request(RTC_TOPIC.SPORT_MOD, SPORT_CMD.Move, {x, y, z});
    this.sent = velocity;
  }

  async tick(): Promise<void> {
    if (this.behavior === 'pose' && this.behaviorConfirmed && !this.actionBusy && !this.busy && !this.stopping) {
      const problem = this.problem(false);
      if (problem || !this.reportedBehavior('pose')) { await this.disable(problem || 'Pose mode feedback changed'); return; }
      const freshGesture = !this.problem();
      const ready = freshGesture && this.input!.frame_id - this.poseEnabledFrame >= .3
        && nonzero(this.input!.supervised_velocity);
      const target = ready ? gestureToPose(this.input!.label) : zero();
      if (target.some((v, i) => v !== this.poseTarget[i])) this.poseDirty = true;
      this.poseTarget = target;
      this.actionMessage = ready ? `Stationary gestures · ${this.input!.label.replace(/_/g, ' ')}`
        : freshGesture ? 'Pose centered · show a movement gesture' : 'Pose centered · waiting for fresh hand tracking';
      if (!this.poseDirty && !nonzero(this.poseTarget)) return;
      this.busy = true;
      const [x, y, z] = this.poseTarget;
      this.poseDirty = false;
      try { await this.request(RTC_TOPIC.SPORT_MOD, SPORT_CMD.Euler, {x, y, z}); }
      catch (error) { await this.disable(String(error)); }
      finally { this.busy = false; }
      return;
    }
    if (!this.enabled || this.busy || this.stopping) return;
    const problem = this.problem();
    if (problem) { await this.disable(problem); return; }
    const epoch = this.epoch;
    this.busy = true;
    try {
      if (this.now() - this.modeAt > 2000) await this.refreshMode();
      if (epoch !== this.epoch || !this.enabled) return;
      // Recheck freshness after asynchronous mode requests.
      const changed = this.problem();
      if (changed) throw new Error(changed);
      if (this.behavior === 'pose' || this.behavior === 'jump'
          || (this.behavior === 'bound' && (!this.behaviorConfirmed || !this.reportedBehavior('bound'))))
        throw new Error('Robot behavior feedback changed');
      // Enabling is a button action. Require new frames after that click before moving.
      const velocity = this.input!.frame_id - this.enabledFrame >= .3
        ? this.input!.supervised_velocity as Velocity : zero();
      if (!nonzero(velocity)) {
        if (this.moving) {
          if (this.behavior === 'bound') await this.disable('Bound navigation stopped; enable gestures to resume normal walking');
          else await this.stopMotion();
        }
      } else {
        this.moving = true;
        await this.move(velocity);
      }
    } catch (error) { await this.disable(String(error)); }
    finally { this.busy = false; }
  }

  async disable(reason = 'Stopped by operator'): Promise<void> {
    this.actionGeneration++;
    await this.stopControls(reason);
  }

  async disableGestures(reason: string): Promise<void> {
    // Webcam loss must not repeatedly restart a failed jump recovery or affect
    // the separate camera/scene controls when gesture navigation is already off.
    if (this.enabled || this.enabling) await this.disable(reason);
  }

  private async focusLost(reason: string): Promise<void> {
    if (this.enabled || this.enabling || (this.actionBusy && !this.recoveryRequired) || this.behaviorConfirmed)
      await this.disable(reason);
  }

  private async stopControls(reason: string): Promise<void> {
    this.behaviorConfirmed = false;
    this.epoch++;
    this.enabled = this.enabling = false;
    this.reason = reason;
    if (this.moving || this.stopping || this.behavior !== 'none') await this.stopMotion();
    this.sent = zero();
  }

  private slowUpright(): boolean {
    return !!this.state && this.now() - this.stateAt <= 1000 && this.state.body_height >= .15
      && Math.hypot(...this.state.velocity) < .08 && Math.abs(this.state.yaw_speed) < .15;
  }

  private stopMotion(): Promise<void> {
    if (this.stopping) return this.stopping;
    const connection = this.connectionEpoch;
    const behavior = this.behavior;
    this.moving = false;
    this.stopResult = 'Requesting stop';
    this.stopConfirmed = false;
    this.stopping = (async () => {
      let accepted = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (connection !== this.connectionEpoch) throw new Error('Robot connection changed');
        try { await this.move(zero()); } catch { /* Still attempt StopMove. */ }
        try { await this.request(RTC_TOPIC.SPORT_MOD, SPORT_CMD.StopMove); accepted = true; } catch { }
      }
      if (!accepted) throw new Error('StopMove not acknowledged; USE THE REMOTE');
      this.stopResult = 'Stop acknowledged; checking robot feedback';
      if (connection !== this.connectionEpoch) throw new Error('Robot connection changed');
      if (behavior === 'pose') {
        await this.request(RTC_TOPIC.SPORT_MOD, SPORT_CMD.Euler, {x: 0, y: 0, z: 0});
        if (connection !== this.connectionEpoch) throw new Error('Robot connection changed');
        if (this.firmwarePose) await this.request(RTC_TOPIC.SPORT_MOD, SPORT_CMD.Pose, {data: false});
      } else if (behavior === 'bound') {
        await this.request(RTC_TOPIC.SPORT_MOD, SPORT_CMD.FreeBound, {data: false});
      }
      let slowSince: number | null = null;
      if (behavior === 'jump' && (!Array.isArray(this.state?.foot_force) || this.state.foot_force.length !== 4
          || !this.state.foot_force.every(Number.isFinite))) {
        throw new Error('Landing not confirmed: foot-contact telemetry unavailable. Restore standing with the remote, then confirm remote recovery.');
      }
      const deadline = Math.max(this.now() + 3000, behavior === 'jump' ? this.jumpAt + 6000 : 0);
      while (this.now() < deadline) {
        if (connection !== this.connectionEpoch || !this.connected()) throw new Error('Connection lost during stop; USE THE REMOTE');
        // A walking stop is not proof of landing. Do not request stance while airborne.
        const landed = behavior !== 'jump' || (this.now() - this.jumpAt >= 3000
          && this.state?.foot_force?.length === 4 && this.state.foot_force.every(f => Number.isFinite(f) && f > 0));
        const modeExited = (behavior !== 'pose' && behavior !== 'bound') || this.reportedOutside(behavior);
        this.stopResult = behavior === 'jump' && !landed ? 'Stop acknowledged; waiting for landing / foot-contact feedback'
          : !modeExited ? 'Stop acknowledged; waiting for the selected mode to exit'
          : 'Stop acknowledged; verifying fresh low-speed upright feedback';
        if (this.slowUpright() && landed && modeExited) {
          slowSince ??= this.stateAt;
          // Require new low-speed feedback spanning the interval, not re-reading one sample.
          if (this.stateAt - slowSince >= 300) break;
        } else slowSince = null;
        await this.sleep(50);
      }
      if (slowSince === null || this.stateAt - slowSince < 300) throw new Error('Stopped upright state not confirmed; stance skipped. Restore standing with the remote, then confirm remote recovery.');
      this.stopResult = 'Stationary feedback received; checking balance stand';
      await this.request(RTC_TOPIC.SPORT_MOD, SPORT_CMD.BalanceStand);
      for (let count = 0; count < 20; count++) {
        await this.sleep(50);
        if (connection !== this.connectionEpoch || !this.slowUpright()) throw new Error('Stance not confirmed; USE THE REMOTE');
      }
      this.stopResult = 'Stop acknowledged; low-speed upright feedback confirmed';
      this.stopConfirmed = true;
      this.recoveryRequired = false;
      this.behavior = 'none';
      this.behaviorConfirmed = false;
      this.poseTarget = zero(); this.poseDirty = false;
      this.firmwarePose = false;
      this.actionMessage = 'Stopped; select a behavior or enable gestures';
    })().catch(error => {
      if (connection !== this.connectionEpoch) return;
      this.enabled = false; this.epoch++;
      this.recoveryRequired = true;
      this.reason = this.stopResult = this.actionMessage = String(error);
    }).finally(() => { if (connection === this.connectionEpoch) { this.stopping = null; this.sent = zero(); } });
    return this.stopping;
  }

  private reportedBehavior(behavior: 'pose' | 'bound'): boolean {
    // Bounded look-around uses the SDK's BalanceStand + Euler route, not raw
    // wireless-controller axes or the separate firmware Pose joystick mode.
    if (behavior === 'bound') return this.mode === 'mcf' ? this.state?.error_code === 2008 : this.state?.mode === 15;
    // Standing feedback codes vary by firmware; idle/joint-lock frames are also
    // permitted after the explicit BalanceStand acknowledgement, not other gaits.
    return this.mode === 'mcf' ? [0, 1002, 1013].includes(this.state?.error_code ?? -1)
      : [0, 1, 6].includes(this.state?.mode ?? -1);
  }

  private reportedOutside(behavior: 'pose' | 'bound'): boolean {
    const value = this.mode === 'mcf' ? this.state?.error_code : this.state?.mode;
    const standingOrWalking = this.mode === 'mcf' ? [0, 100, 1002, 1005, 1013, 1015, 1016, 1017] : [0, 1, 3, 6, 9];
    return value !== undefined && standingOrWalking.includes(value)
      && (behavior === 'pose' || !this.reportedBehavior(behavior));
  }

  async selectBehavior(behavior: Exclude<RobotBehavior, 'none'>): Promise<void> {
    if (!['jump', 'bound', 'pose'].includes(behavior)) return;
    if (behavior === 'pose' && !this.experimentalStationaryGestures) {
      this.actionMessage = 'Stationary control is deferred; see the project roadmap';
      return;
    }
    if (this.actionBusy || this.busy || this.enabling || this.stopping || this.avoidanceBusy) return;
    if (this.recoveryRequired) { this.actionMessage = 'Restore standing with the remote, then confirm remote recovery'; return; }
    if (this.behavior === 'jump') { this.actionMessage = 'Jump requested; press Stop to confirm recovery first'; return; }
    const toggleOff = this.behavior === behavior;
    const generation = ++this.actionGeneration;
    const connection = this.connectionEpoch;
    const current = () => generation === this.actionGeneration && connection === this.connectionEpoch;
    this.actionBusy = true;
    this.actionMessage = 'Preparing robot…';
    try {
      await this.stopControls('Gesture navigation paused for behavior selection');
      if (!current()) return;
      if (this.behavior !== 'none') throw new Error('Previous behavior has not stopped; use Stop / remote');
      if (toggleOff) return;
      const problem = this.problem(false);
      if (problem) throw new Error(problem);
      if (!this.slowUpright()) throw new Error('Wait for stationary upright robot feedback');
      if (behavior === 'pose' && this.problem()) throw new Error('Start fresh hand tracking before selecting stationary gestures');
      await this.refreshMode();
      if (!current()) return;
      if (this.behavior !== 'none') throw new Error('Robot reports an existing behavior; press Stop first');
      const changed = this.problem(false);
      if (changed || !this.slowUpright()) throw new Error(changed || 'Robot is not stationary');
      const serial = this.stateSerial;
      this.behavior = behavior; // Keep the attempted mode for cleanup if a reply is lost.
      this.firmwarePose = false;
      if (behavior === 'jump') this.jumpAt = this.now();
      await this.request(RTC_TOPIC.SPORT_MOD, behavior === 'jump' ? SPORT_CMD.FrontJump
        : behavior === 'bound' ? SPORT_CMD.FreeBound : SPORT_CMD.BalanceStand, behavior === 'bound' ? {data: true} : {});
      if (!current()) return;
      if (behavior !== 'jump') {
        const deadline = this.now() + 1500;
        while (this.now() < deadline && !(this.stateSerial > serial && this.reportedBehavior(behavior))) {
          await this.sleep(50);
          if (!current()) return;
        }
        if (this.stateSerial <= serial || !this.reportedBehavior(behavior) || this.problem(false))
          throw new Error('Mode not confirmed by robot feedback; press Stop before retrying');
      }
      this.poseTarget = zero(); this.poseDirty = behavior === 'pose';
      this.poseEnabledFrame = this.input?.frame_id ?? 0;
      this.behaviorConfirmed = true;
      this.actionMessage = behavior === 'jump' ? 'Jump requested; press Stop after landing'
        : behavior === 'bound' ? 'Bound confirmed · enable gestures to navigate' : 'Stationary gestures active · show a movement gesture';
    } catch (error) {
      if (current()) {
        const message = String(error);
        this.actionMessage = this.reason = message;
        if (this.behavior !== 'none' && this.behavior !== 'jump') {
          // No further posture streaming after an unconfirmed entry.
          this.poseDirty = false;
          await this.stopControls(this.reason);
          if (current()) this.actionMessage = this.reason = message;
        }
      }
    } finally { if (connection === this.connectionEpoch) this.actionBusy = false; }
  }

  async confirmRemoteRecovery(): Promise<void> {
    if (!this.recoveryRequired || this.stopping || this.actionBusy || this.enabled || this.enabling || this.moving) return;
    const connection = this.connectionEpoch;
    const generation = ++this.actionGeneration;
    const current = () => connection === this.connectionEpoch && generation === this.actionGeneration;
    this.actionBusy = true;
    this.actionMessage = 'Checking fresh standing feedback after remote recovery…';
    try {
      const serial = this.stateSerial;
      let since: number | null = null;
      const deadline = this.now() + 1500;
      let confirmed = false;
      while (this.now() < deadline) {
        if (!current()) return;
        const problem = this.problem(false);
        if (problem) throw new Error(problem);
        if ((this.mode !== 'normal' && this.mode !== 'mcf') || !this.reportedOutside('bound') || !this.slowUpright())
          throw new Error('Robot must report normal, low-speed upright standing after remote recovery');
        since ??= this.stateAt;
        if (this.stateSerial > serial && this.stateAt - since >= 500) { confirmed = true; break; }
        await this.sleep(50);
      }
      if (!current()) return;
      if (!confirmed) throw new Error('Fresh standing feedback did not span 500 ms');
      // The operator attests that the remote restored standing. This only clears
      // local control ownership; it sends no robot command and does not arm motion.
      this.recoveryRequired = false;
      this.behavior = 'none'; this.behaviorConfirmed = false;
      this.poseTarget = zero(); this.poseDirty = false; this.firmwarePose = false;
      this.jumpAt = -Infinity; this.sent = zero(); this.stopConfirmed = false;
      this.reason = this.actionMessage = this.stopResult = 'Remote recovery acknowledged · gesture control remains disabled';
    } catch (error) {
      if (current()) this.reason = this.actionMessage = `Remote recovery not confirmed: ${String(error)}`;
    } finally { if (connection === this.connectionEpoch) this.actionBusy = false; }
  }

  status() {
    const batteryAge = this.now() - this.batteryAt;
    const batteryFresh = this.connected() && this.batteryPercent !== null
      && batteryAge >= 0 && batteryAge <= 5000;
    return {connected: this.connected(), enabled: this.enabled, enabling: this.enabling,
      behavior: this.behavior, behaviorConfirmed: this.behaviorConfirmed,
      actionBusy: this.actionBusy, actionMessage: this.actionMessage,
      recoveryRequired: this.recoveryRequired,
      actionReady: !this.recoveryRequired && !this.problem(false) && this.slowUpright(),
      poseReady: this.behavior === 'pose' && this.behaviorConfirmed && !this.problem(false),
      poseTarget: [...this.poseTarget],
      batteryPercent: batteryFresh ? this.batteryPercent : null, batteryFresh,
      stopping: !!this.stopping, reason: this.reason, stopResult: this.stopResult,
      sent: this.sent, measured: this.state ? [...this.state.velocity.slice(0, 2), this.state.yaw_speed] : null,
      feedbackFresh: this.now() - this.stateAt <= 1000,
      videoFresh: this.connected() && this.now() - this.videoAt <= 1000,
      awaitingMoveAck: this.mode !== 'mcf' && this.busy, mcf: this.mode === 'mcf',
      avoidance: this.avoidance,
      avoidanceFresh: this.connected() && this.avoidance !== null && this.now() - this.avoidanceAt <= 10000,
      avoidanceBusy: this.avoidanceBusy, avoidanceMessage: this.avoidanceMessage};
  }
}

export const gestureRobot = new GestureRobot();
