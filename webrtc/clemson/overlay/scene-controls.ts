/** Camera-view controls; independent of the webcam service and hand sidebar. */
import {gestureRobot} from './gesture-robot';

export function mountSceneControls(parent: HTMLElement): void {
  const controls = document.createElement('section');
  controls.className = 'clemson-scene-controls';
  controls.setAttribute('aria-label', 'Robot battery and behaviors');
  controls.innerHTML = `
    <div class="clemson-battery" role="group" aria-label="Go2 battery">
      <svg class="clemson-battery-icon" viewBox="0 0 38 22" aria-hidden="true">
        <rect x="1" y="1" width="31" height="20" rx="4" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M35 7v8" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        <rect class="clemson-battery-fill" x="5" y="5" width="0" height="12" rx="1.5" fill="currentColor"/>
      </svg>
      <div><span class="clemson-battery-label">Robot battery</span><output class="clemson-battery-value">—%</output></div>
    </div>
    <div class="clemson-behavior-buttons">
      <button type="button" data-behavior="jump" title="Request one forward jump; pauses gesture navigation"><span aria-hidden="true">↗</span> Jump once</button>
      <button type="button" data-behavior="bound" aria-pressed="false"><span aria-hidden="true">⇢</span> Bound gait</button>
      <button type="button" data-behavior="pose" aria-pressed="false"><span aria-hidden="true">◎</span> Stationary look around</button>
    </div>
    <div class="clemson-peek" hidden>
      <p>Hold to peek · release to center</p>
      <div class="clemson-peek-pad">
        <button type="button" data-peek="up" aria-label="Peek up">↑</button>
        <button type="button" data-peek="left" aria-label="Peek left">←</button>
        <button type="button" data-peek="center" aria-label="Center body pose">●</button>
        <button type="button" data-peek="right" aria-label="Peek right">→</button>
        <button type="button" data-peek="down" aria-label="Peek down">↓</button>
      </div>
    </div>
    <p class="clemson-behavior-status" role="status">Select a behavior</p>`;
  parent.appendChild(controls);
  for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-behavior]')) {
    button.addEventListener('click', () => {
      void gestureRobot.selectBehavior(button.dataset.behavior as 'jump' | 'bound' | 'pose');
    });
  }

  let held: string | null = null;
  const stopPeek = () => { held = null; gestureRobot.peek(0, 0); };
  const sendPeek = () => {
    if (held) gestureRobot.peek(held === 'up' ? -.12 : held === 'down' ? .12 : 0,
      held === 'left' ? .15 : held === 'right' ? -.15 : 0);
  };
  for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-peek]')) {
    button.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      button.setPointerCapture(event.pointerId);
      held = button.dataset.peek!; sendPeek();
    });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur']) button.addEventListener(event, stopPeek);
    button.addEventListener('keydown', event => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault(); held = button.dataset.peek!; sendPeek();
      }
    });
    button.addEventListener('keyup', stopPeek);
    button.addEventListener('click', event => { if (event.detail === 0) stopPeek(); });
  }

  const render = () => {
    const state = gestureRobot.status();
    const percent = state.batteryFresh ? Math.round(state.batteryPercent!) : null;
    const battery = controls.querySelector<HTMLElement>('.clemson-battery')!;
    battery.classList.toggle('clemson-battery-fresh', percent !== null);
    battery.classList.toggle('clemson-battery-low', percent !== null && percent <= 20);
    controls.querySelector('output')!.textContent = percent === null ? '—%' : `${percent}%`;
    controls.querySelector('.clemson-battery-label')!.textContent = percent === null ? 'Battery unavailable' : 'Robot battery';
    controls.querySelector('.clemson-battery-fill')!.setAttribute('width', String(23 * (percent ?? 0) / 100));
    battery.title = percent === null ? 'No valid battery telemetry within 5 seconds' : `Go2 battery: ${percent}%`;
    const locked = state.actionBusy || state.enabling || state.stopping || state.avoidanceBusy || state.behavior === 'jump';
    for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-behavior]')) {
      button.disabled = locked || !state.actionReady;
      if (button.dataset.behavior !== 'jump') button.setAttribute('aria-pressed', String(state.behaviorConfirmed && state.behavior === button.dataset.behavior));
    }
    const peek = controls.querySelector<HTMLElement>('.clemson-peek')!;
    peek.hidden = !state.poseReady || locked;
    if (peek.hidden) held = null;
    for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-peek]')) button.disabled = peek.hidden;
    controls.querySelector('.clemson-behavior-status')!.textContent = state.stopping ? state.stopResult : state.actionMessage;
    if (document.hidden || !document.hasFocus()) held = null;
    if (held) sendPeek();
  };
  render();
  const timer = setInterval(() => {
    if (!controls.isConnected) { clearInterval(timer); return; }
    render();
  }, 100);
}
