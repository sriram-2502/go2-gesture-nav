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
    <p class="clemson-stream-status clemson-behavior-status">Checking video and robot feedback…</p>
    <div class="clemson-behavior-buttons">
      <button type="button" data-behavior="jump" title="Request one forward jump; pauses gesture navigation"><span aria-hidden="true">↗</span> Jump once</button>
      <button type="button" data-behavior="bound" aria-pressed="false"><span aria-hidden="true">⇢</span> Bound gait</button>
    </div>
    <p class="clemson-action-status clemson-behavior-status" role="status">Select a behavior</p>
    <button type="button" class="clemson-recovery" hidden title="First restore normal standing with the paired remote and check all four feet on the ground. This checks telemetry and clears the local lock; it sends no motion command.">I restored standing with the remote</button>`;
  parent.appendChild(controls);
  controls.querySelector('.clemson-recovery')!.addEventListener('click', () => void gestureRobot.confirmRemoteRecovery());
  for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-behavior]')) {
    button.addEventListener('click', () => {
      void gestureRobot.selectBehavior(button.dataset.behavior as 'jump' | 'bound');
    });
  }

  const render = () => {
    const state = gestureRobot.status();
    const percent = state.batteryFresh ? Math.round(state.batteryPercent!) : null;
    const battery = controls.querySelector<HTMLElement>('.clemson-battery')!;
    battery.classList.toggle('clemson-battery-fresh', percent !== null);
    battery.classList.toggle('clemson-battery-low', percent !== null && percent <= 20);
    controls.querySelector('.clemson-battery-value')!.textContent = percent === null ? '—%' : `${percent}%`;
    controls.querySelector('.clemson-battery-label')!.textContent = percent === null ? 'Battery unavailable' : 'Robot battery';
    controls.querySelector('.clemson-battery-fill')!.setAttribute('width', String(23 * (percent ?? 0) / 100));
    battery.title = percent === null ? 'No valid battery telemetry within 5 seconds' : `Go2 battery: ${percent}%`;
    controls.querySelector('.clemson-stream-status')!.textContent = `${state.videoFresh ? 'Video live' : 'Video stale'} · ${state.feedbackFresh ? 'Robot feedback live' : 'Robot feedback stale'}`;
    const locked = state.actionBusy || state.enabling || state.stopping || state.avoidanceBusy || state.behavior === 'jump';
    for (const button of controls.querySelectorAll<HTMLButtonElement>('[data-behavior]')) {
      button.disabled = locked || !state.actionReady;
      if (button.dataset.behavior !== 'jump') button.setAttribute('aria-pressed', String(state.behaviorConfirmed && state.behavior === button.dataset.behavior));
    }
    controls.querySelector('.clemson-action-status')!.textContent = state.stopping ? state.stopResult : state.actionMessage;
    const recovery = controls.querySelector<HTMLButtonElement>('.clemson-recovery')!;
    recovery.hidden = !state.recoveryRequired;
    recovery.disabled = !state.connected || state.stopping || state.actionBusy || !state.feedbackFresh || !state.videoFresh;
  };
  render();
  const timer = setInterval(() => {
    if (!controls.isConnected) { clearInterval(timer); return; }
    render();
  }, 100);
}
