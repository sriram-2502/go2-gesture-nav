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
type SportState = {velocity: number[]; yaw_speed: number; body_height: number};
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
  private avoidance: boolean | null = null;
  private avoidanceAt = -Infinity;
  private avoidanceBusy = false;
  private avoidanceMessage = 'Connect to read robot state';
  private pending = new Map<number, {topic: string; resolve: (reply: Reply) => void;
    reject: (error: Error) => void; timer: ReturnType<typeof setTimeout>}>();

  constructor(private now = () => performance.now(),
              private sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms)),
              timers = true) {
    if (timers) {
      setInterval(() => void this.tick(), 50);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void this.disable('Browser hidden');
      });
      window.addEventListener('blur', () => void this.disable('Browser lost focus'));
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
    if (!this.connected() || this.avoidanceBusy || typeof enabled !== 'boolean') return;
    const connection = this.connectionEpoch;
    const neededStop = this.moving || !!this.stopping;
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
          this.state = data; this.stateAt = this.now();
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

  private problem(): string {
    const now = this.now();
    if (!this.connected() || !this.send) return 'Robot not connected';
    if (document.hidden) return 'Browser hidden';
    if (!this.state || now - this.stateAt > 1000) return 'Robot feedback expired';
    if (this.state.body_height < .15) return 'Robot is not confirmed upright';
    if (now - this.videoAt > 1000) return 'Go2 camera frames expired';
    if (!this.input?.fresh || now - this.inputAt + this.inputAge > 400 || now - this.frameAt > 400) return 'Gesture input expired';
    return '';
  }

  async enable(): Promise<void> {
    if (this.enabled || this.enabling || this.stopping || this.avoidanceBusy) return;
    const problem = this.problem();
    if (problem) { this.reason = problem; return; }
    if (this.input?.label !== 'STOP') { this.reason = 'Show an open palm or fist before enabling'; return; }
    const epoch = ++this.epoch;
    this.enabling = true;
    this.reason = 'Checking robot motion service…';
    try {
      await this.refreshMode();
      if (epoch !== this.epoch) return;
      const changed = this.problem();
      if (changed || this.input?.label !== 'STOP') throw new Error(changed || 'Keep the stop gesture while enabling');
      this.enabled = true;
      this.reason = 'Gesture control enabled';
    } catch (error) { this.reason = String(error); }
    finally { this.enabling = false; }
  }

  private async refreshMode(): Promise<void> {
    const reply = await this.request(RTC_TOPIC.MOTION_SWITCHER, 1001);
    const mode = unpack(reply.data)?.name;
    if (mode !== 'normal' && mode !== 'mcf') throw new Error('Unsupported robot motion service');
    this.mode = mode; this.modeAt = this.now();
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
      const velocity = this.input!.supervised_velocity as Velocity;
      if (!nonzero(velocity)) {
        if (this.moving) await this.stopMotion();
      } else {
        this.moving = true;
        await this.move(velocity);
      }
    } catch (error) { await this.disable(String(error)); }
    finally { this.busy = false; }
  }

  async disable(reason = 'Stopped by operator'): Promise<void> {
    this.epoch++;
    this.enabled = this.enabling = false;
    this.reason = reason;
    if (this.moving || this.stopping) await this.stopMotion();
    this.sent = zero();
  }

  private slowUpright(): boolean {
    return !!this.state && this.now() - this.stateAt <= 1000 && this.state.body_height >= .15
      && Math.hypot(...this.state.velocity) < .08 && Math.abs(this.state.yaw_speed) < .15;
  }

  private stopMotion(): Promise<void> {
    if (this.stopping) return this.stopping;
    const connection = this.connectionEpoch;
    this.moving = false;
    this.stopResult = 'Requesting stop';
    this.stopConfirmed = false;
    this.stopping = (async () => {
      let accepted = false;
      for (let attempt = 0; attempt < 3; attempt++) {
        try { await this.move(zero()); } catch { /* Still attempt StopMove. */ }
        try { await this.request(RTC_TOPIC.SPORT_MOD, SPORT_CMD.StopMove); accepted = true; } catch { }
      }
      if (!accepted) throw new Error('StopMove not acknowledged; USE THE REMOTE');
      let slowSince: number | null = null;
      const deadline = this.now() + 3000;
      while (this.now() < deadline) {
        if (connection !== this.connectionEpoch || !this.connected()) throw new Error('Connection lost during stop; USE THE REMOTE');
        if (this.slowUpright()) {
          slowSince ??= this.stateAt;
          // Require new low-speed feedback spanning the interval, not re-reading one sample.
          if (this.stateAt - slowSince >= 300) break;
        } else slowSince = null;
        await this.sleep(50);
      }
      if (slowSince === null || this.stateAt - slowSince < 300) throw new Error('Stopped upright state not confirmed; stance skipped; USE THE REMOTE');
      await this.request(RTC_TOPIC.SPORT_MOD, SPORT_CMD.BalanceStand);
      for (let count = 0; count < 20; count++) {
        await this.sleep(50);
        if (connection !== this.connectionEpoch || !this.slowUpright()) throw new Error('Stance not confirmed; USE THE REMOTE');
      }
      this.stopResult = 'Stop acknowledged; low-speed upright feedback confirmed';
      this.stopConfirmed = true;
    })().catch(error => {
      this.enabled = false; this.epoch++;
      this.reason = this.stopResult = String(error);
    }).finally(() => { this.stopping = null; this.sent = zero(); });
    return this.stopping;
  }

  status() {
    const batteryAge = this.now() - this.batteryAt;
    const batteryFresh = this.connected() && this.batteryPercent !== null
      && batteryAge >= 0 && batteryAge <= 5000;
    return {connected: this.connected(), enabled: this.enabled, enabling: this.enabling,
      batteryPercent: batteryFresh ? this.batteryPercent : null, batteryFresh,
      stopping: !!this.stopping, reason: this.reason, stopResult: this.stopResult,
      sent: this.sent, measured: this.state ? [...this.state.velocity.slice(0, 2), this.state.yaw_speed] : null,
      feedbackFresh: this.now() - this.stateAt <= 1000,
      awaitingMoveAck: this.mode !== 'mcf' && this.busy, mcf: this.mode === 'mcf',
      avoidance: this.avoidance,
      avoidanceFresh: this.connected() && this.avoidance !== null && this.now() - this.avoidanceAt <= 10000,
      avoidanceBusy: this.avoidanceBusy, avoidanceMessage: this.avoidanceMessage};
  }
}

export const gestureRobot = new GestureRobot();
