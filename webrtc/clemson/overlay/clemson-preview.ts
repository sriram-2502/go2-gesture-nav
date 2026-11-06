/** Student-facing panel. The separate robot adapter owns transmission checks. */
export {};
import { gestureRobot } from './gesture-robot';
import {sessionRecorder} from './session-recorder';
import {mountRecordingControls} from './recording-ui';
import {CameraStartup} from './camera-start';
type Snapshot = {
  active: boolean; fresh: boolean; label: string; fps: number;
  landmarks: number[][][]; error: string; proposed_velocity: number[];
  supervised_velocity: number[]; navigation_status: string; frame_id: number; age_ms: number | null;
  speeds: {forward: number; turn: number; lateral: number};
  recognition_hint?: string;
  recognition?: {extended_fingers?: string[]; index_direction?: string; palm_facing?: boolean; handedness?: string};
};

const panel = document.createElement('aside');
panel.className = 'clemson-preview';
panel.setAttribute('aria-label', 'MediaPipe webcam preview');
panel.innerHTML = `
  <header><div><span class="clemson-eyebrow">CLEMSON / CREATIVE INQUIRY</span>
    <h2>Gesture control</h2></div><button class="clemson-hide" aria-label="Hide gesture panel" title="Hide panel">×</button></header>
  <div class="clemson-webcam-stage"><canvas width="640" height="480" aria-label="Extracted hand skeleton"></canvas>
    <p class="clemson-camera-placeholder">Show one hand</p></div>
  <div class="clemson-control-buttons"><button class="clemson-enable">Enable gesture control</button>
    <button class="clemson-disable">Stop</button></div>
  <p class="clemson-control-status" role="status">Preview only</p>
  <span class="clemson-preview-badge">Preview mode</span>
  <div class="clemson-gesture-label" aria-live="polite">Webcam off</div>
  <p class="clemson-recognition-hint" aria-live="polite">For forward: index up, other fingers curled, palm toward webcam.</p>
  <details class="clemson-recognition-details"><summary>Recognition details</summary><p class="clemson-recognition-values"></p></details>
  <p class="clemson-preview-status" role="status">Checking preview service…</p>
  <section class="clemson-avoidance" aria-label="Obstacle avoidance">
    <label class="clemson-switch-row" for="clemson-avoidance-switch"><span>Obstacle avoidance</span>
      <input id="clemson-avoidance-switch" type="checkbox" role="switch" disabled>
      <span class="clemson-switch-state">Unknown</span></label>
    <p class="clemson-avoidance-status" role="status">Connect to read robot state.</p>
    <button class="clemson-avoidance-refresh" title="Read obstacle-avoidance state" aria-label="Refresh obstacle avoidance">↻</button>
  </section>
  <details class="clemson-speed-settings"><summary>Speed settings</summary>
    <label>Forward (m/s)<input class="clemson-forward" type="number" min="0.5" max="1" step="0.1" value="0.5"></label>
    <label>Turn (rad/s)<input class="clemson-turn" type="number" min="0.5" max="1" step="0.1" value="0.8"></label>
    <p>Sideways: fixed ±0.5 m/s</p><button class="clemson-apply">Apply speeds</button>
  </details>`;
document.body.appendChild(panel);
mountRecordingControls(panel);
// This lives inside the robot view, so it follows the viewport width and recording.
const telemetry=document.createElement('section');
telemetry.className='clemson-telemetry';
telemetry.setAttribute('aria-label','Robot velocity feedback');
telemetry.innerHTML=`<div class="clemson-telemetry-heading">VELOCITY <span>vx / vy / wz · m/s, m/s, rad/s</span></div>
  <dl><dt>Requested</dt><dd class="clemson-requested">0.00 / 0.00 / 0.00</dd>
  <dt>Supervised</dt><dd class="clemson-approved">0.00 / 0.00 / 0.00</dd>
  <dt title="A transmitted command is not proof of execution">Transmitted</dt><dd class="clemson-transmitted">0.00 / 0.00 / 0.00</dd>
  <dt>Measured</dt><dd class="clemson-measured">Not available</dd></dl><p class="clemson-stop-result" role="status" hidden></p>`;
const app=document.getElementById('app')!;
function placeTelemetry():void {
  const visible=app.classList.contains('control-screen');
  telemetry.hidden=!visible;
  if(visible&&telemetry.parentElement!==app)app.appendChild(telemetry);
}
new MutationObserver(placeTelemetry).observe(app,{childList:true,attributes:true,attributeFilter:['class']});
placeTelemetry();
const toggle = document.createElement('button');
toggle.className = 'clemson-preview-toggle';
toggle.textContent = 'Hand tracking';
toggle.hidden = true;
document.body.appendChild(toggle);
const handCanvas = panel.querySelector('canvas')!;
const handContext = handCanvas.getContext('2d')!;
const placeholder = panel.querySelector<HTMLElement>('.clemson-camera-placeholder')!;
const label = panel.querySelector<HTMLElement>('.clemson-gesture-label')!;
const status = panel.querySelector<HTMLElement>('.clemson-preview-status')!;
const output = telemetry.querySelector<HTMLElement>('.clemson-requested')!;
const approved = telemetry.querySelector<HTMLElement>('.clemson-approved')!;
const forward = panel.querySelector<HTMLInputElement>('.clemson-forward')!;
const turn = panel.querySelector<HTMLInputElement>('.clemson-turn')!;
const avoidanceSwitch = panel.querySelector<HTMLInputElement>('#clemson-avoidance-switch')!;
const avoidanceRefresh = panel.querySelector<HTMLButtonElement>('.clemson-avoidance-refresh')!;
let opened = true;
let busy = false;
let acting = false;
let stopWhenIdle=false;
const cameraStartup=new CameraStartup();
let actionError='';
let serviceFresh = false;
let settingsLoaded = false;
const format = (v: number[]) => v.map(x => x.toFixed(2)).join(' / ');

const connections = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],
  [5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],
  [13,17],[17,18],[18,19],[19,20],[0,17]];
function showHands(hands: number[][][]): void {
  handContext.clearRect(0, 0, 640, 480);
  placeholder.hidden = hands.length > 0;
  for (const hand of hands) {
    if (hand.length !== 21) continue;
    handContext.strokeStyle = '#40debe'; handContext.lineWidth = 3;
    for (const [a,b] of connections) {
      handContext.beginPath(); handContext.moveTo(hand[a][0]*640, hand[a][1]*480);
      handContext.lineTo(hand[b][0]*640, hand[b][1]*480); handContext.stroke();
    }
    handContext.fillStyle = '#ffcd5f';
    for (const point of hand) {
      handContext.beginPath(); handContext.arc(point[0]*640, point[1]*480, 4, 0, Math.PI*2); handContext.fill();
    }
  }
}

async function action(path: string): Promise<boolean> {
  if (acting) {if(path==='stop')stopWhenIdle=true;return false;}
  acting = true;
  actionError='';
  try {
    const response = await fetch(`/gesture-api/${path}`, {
      method: 'POST', headers: {'Content-Type': 'application/json', 'X-Clemson-Preview': '1'},
      body: JSON.stringify(path === 'settings' ? {forward: Number(forward.value), turn: Number(turn.value)} : {}), signal: AbortSignal.timeout(7000),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Preview request failed');
    return true;
  } catch (error) {
    actionError = error instanceof Error ? error.message : 'Preview request failed';
    status.textContent = actionError;
    return false;
  } finally {
    acting = false;
    if(stopWhenIdle){stopWhenIdle=false;void action('stop');}
  }
}

async function poll(): Promise<void> {
  if (!opened || busy || acting) return;
  busy = true;
  try {
    const fetchStarted = performance.now();
    const response = await fetch('/gesture-api/snapshot', {cache: 'no-store', signal: AbortSignal.timeout(2000)});
    if (!response.ok) throw new Error('Preview service unavailable');
    const value: Snapshot = await response.json();
    // Older services lack supervised_velocity; they must never drive the robot.
    if (!Array.isArray(value.supervised_velocity)) throw new Error('Restart the Python service');
    void cameraStartup.ensure(value.active,async()=>{
      if(!await action('start'))throw new Error(actionError||'Could not start hand tracking');
    });
    if (!settingsLoaded) {
      forward.value = String(value.speeds.forward);
      turn.value = String(value.speeds.turn);
      settingsLoaded = true;
    }
    serviceFresh = value.fresh;
    gestureRobot.updateInput(value, fetchStarted);
    sessionRecorder.recordGesture(value);
    showHands(value.fresh ? value.landmarks : []);
    label.textContent = value.fresh ? value.label.replace(/_/g, ' ') : cameraStartup.pending||value.active ? 'Starting hand tracking' : 'Webcam unavailable';
    const hint=panel.querySelector<HTMLElement>('.clemson-recognition-hint')!;
    hint.textContent=value.recognition_hint||'';
    hint.hidden=!value.fresh||value.label!=='UNKNOWN';
    const recognition=value.recognition;
    panel.querySelector('.clemson-recognition-values')!.textContent = recognition?.extended_fingers
      ? `Extended: ${recognition.extended_fingers.join(', ') || 'none'}. Index: ${recognition.index_direction}. Palm facing camera: ${recognition.palm_facing ? 'yes' : 'not confirmed'}. Hand: ${recognition.handedness}.`
      : 'Waiting for one clearly tracked hand.';
    status.textContent = cameraStartup.error || value.error || (value.fresh ? `${value.fps.toFixed(0)} FPS` : 'Retrying hand tracking automatically…');
    const velocities = value.fresh ? value.proposed_velocity : [0, 0, 0];
    output.textContent = format(velocities);
    approved.textContent = `${format(value.supervised_velocity)} · ${value.navigation_status}`;
  } catch {
    showHands([]);
    label.textContent = 'Preview offline';
    panel.querySelector('.clemson-recognition-hint')!.textContent = 'Start or restart the Python gesture service.';
    serviceFresh = false;
    settingsLoaded = false;
    cameraStartup.reset();
    void gestureRobot.disable('Python gesture service unavailable');
    output.textContent = approved.textContent = format([0, 0, 0]);
    status.textContent = 'Start or restart the local Python gesture service.';
  } finally { busy = false; }
}

function setOpen(value: boolean): void {
  opened = value;
  panel.hidden = !value;
  toggle.hidden = value;
  document.body.classList.toggle('clemson-preview-open', value);
  window.dispatchEvent(new Event('resize'));
  if (value) void poll();
  if(value)cameraStartup.reset();
}
panel.querySelector('.clemson-apply')!.addEventListener('click', async () => {
  await gestureRobot.disable('Speed settings changed');
  if (!forward.reportValidity() || !turn.reportValidity()) return;
  await action('settings');
});
panel.querySelector('.clemson-enable')!.addEventListener('click', () => void gestureRobot.enable());
panel.querySelector('.clemson-disable')!.addEventListener('click', () => void gestureRobot.disable());
avoidanceSwitch.addEventListener('change', () => {
  const desired = avoidanceSwitch.checked;
  // Keep showing confirmed state while the change is pending.
  avoidanceSwitch.checked = gestureRobot.status().avoidance === true;
  void gestureRobot.setObstacleAvoidance(desired);
});
avoidanceRefresh.addEventListener('click', () => void gestureRobot.refreshObstacleAvoidance());
panel.querySelector('.clemson-hide')!.addEventListener('click', () => {
  void action('stop');
  void gestureRobot.disable('Gesture panel hidden');
  setOpen(false);
});
toggle.addEventListener('click', () => setOpen(true));
setInterval(() => void poll(), 150);
setInterval(() => {
  const state = gestureRobot.status();
  sessionRecorder.recordControl(state);
  const battery = app.querySelector<HTMLOutputElement>('.clemson-battery');
  if (battery) {
    battery.textContent = state.batteryFresh ? `Battery: ${Math.round(state.batteryPercent!)}%` : 'Battery: unavailable';
    battery.classList.toggle('clemson-battery-fresh', state.batteryFresh);
    battery.title = state.batteryFresh ? 'Go2 battery state of charge reported by the robot'
      : 'No valid Go2 battery reading received within the last 5 seconds';
  }
  avoidanceSwitch.checked = state.avoidanceFresh && state.avoidance === true;
  avoidanceSwitch.indeterminate = !state.avoidanceFresh;
  avoidanceSwitch.disabled = !state.connected || !state.avoidanceFresh || state.avoidanceBusy || state.stopping || state.enabling;
  avoidanceSwitch.setAttribute('aria-checked', !state.avoidanceFresh ? 'mixed' : String(state.avoidance));
  avoidanceRefresh.disabled = !state.connected || state.avoidanceBusy;
  panel.querySelector('.clemson-switch-state')!.textContent = state.avoidanceBusy ? 'Pending…'
    : !state.avoidanceFresh ? 'Unknown' : state.avoidance ? 'ON' : 'OFF';
  const avoidanceStatus=panel.querySelector<HTMLElement>('.clemson-avoidance-status')!;
  avoidanceStatus.textContent = !state.connected ? 'Connect to read robot state.' : state.avoidanceMessage;
  avoidanceStatus.hidden=!state.connected||/^Robot (reports|confirms) (ON|OFF)$/.test(state.avoidanceMessage);
  avoidanceSwitch.title=state.avoidanceMessage;
  panel.querySelector('.clemson-preview-badge')!.textContent = state.enabled ? 'ROBOT CONTROL ENABLED' : 'Preview mode';
  panel.querySelector('.clemson-control-status')!.textContent = state.stopping ? 'Stopping…' : state.reason;
  telemetry.querySelector('.clemson-transmitted')!.textContent = format(state.sent);
  telemetry.querySelector('.clemson-measured')!.textContent = state.feedbackFresh && state.measured ? format(state.measured) : 'Not available / stale';
  const stopResult=telemetry.querySelector<HTMLElement>('.clemson-stop-result')!;
  stopResult.textContent=state.stopResult;stopResult.hidden=state.stopResult==='Not requested';
  panel.querySelector<HTMLButtonElement>('.clemson-enable')!.disabled = !state.connected || !serviceFresh || state.enabled || state.enabling || state.stopping || state.avoidanceBusy;
}, 100);
setInterval(() => {
  const state = gestureRobot.status();
  if (state.connected && !state.enabled && !state.enabling && !state.stopping && !state.avoidanceBusy)
    void gestureRobot.refreshObstacleAvoidance();
}, 3000);
setOpen(true);
