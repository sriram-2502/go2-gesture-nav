import {gestureRobot} from './gesture-robot';
import {sessionRecorder} from './session-recorder';

export function mountRecordingControls(parent:HTMLElement):void {
  const section=document.createElement('section');
  section.className='clemson-recording';
  section.innerHTML=`<div class="clemson-recording-row"><label class="clemson-switch-row" for="clemson-recording-switch"><span>Recording</span>
      <input id="clemson-recording-switch" type="checkbox" role="switch">
      <span class="record-state">OFF</span></label><a href="/replay.html" target="_blank" rel="noopener">Replay</a></div>
    <details class="clemson-run-details"><summary>Run name</summary><label><input aria-label="Recording run name" class="run-name" value="Go2 run" maxlength="80"></label></details>
    <button class="record-retry" hidden>Retry save</button>
    <p class="record-status" role="status" hidden></p>`;
  parent.insertBefore(section,parent.querySelector('.clemson-avoidance'));
  const toggle=section.querySelector<HTMLInputElement>('#clemson-recording-switch')!;
  const retry=section.querySelector<HTMLButtonElement>('.record-retry')!;
  const stateLabel=section.querySelector<HTMLElement>('.record-state')!;
  const status=section.querySelector<HTMLElement>('.record-status')!;
  let choosing=false, saving=false;
  let lastDownload: string|null=null;

  async function save():Promise<void> {
    if (saving || (!sessionRecorder.status().active&&!sessionRecorder.status().unsaved)) return;
    saving=true;
    toggle.checked=false;toggle.disabled=true;
    status.textContent='Stopping gesture control, then saving…';
    try {
      await gestureRobot.disable('Recording finished');
      sessionRecorder.recordControl(gestureRobot.status());
      const result=await sessionRecorder.finish();
      if (lastDownload) URL.revokeObjectURL(lastDownload);
      lastDownload=URL.createObjectURL(result.blob);
      const link=document.createElement('a');
      link.href=lastDownload;link.download=result.filename;link.textContent='Download again';
      link.click();
      status.textContent='Saved ZIP. ';
      status.appendChild(link);
    } catch (error) {status.textContent=`Could not save: ${String(error)}. Keep this page open and use Retry save.`;}
    finally {saving=false;}
  }

  async function start():Promise<void> {
    toggle.checked=false;
    if (choosing || saving || sessionRecorder.status().active || sessionRecorder.status().unsaved) return;
    const robot=gestureRobot.status();
    if (robot.enabled || robot.enabling || robot.stopping) {
      status.textContent='Stop gesture control before starting a recording.';return;
    }
    choosing=true;
    toggle.disabled=true;
    let stream:MediaStream|null=null;
    try {
      // Invoke directly from the switch event: capture needs user activation.
      stream=await navigator.mediaDevices.getDisplayMedia({video:{frameRate:30},audio:false});
      sessionRecorder.start(section.querySelector<HTMLInputElement>('.run-name')!.value,stream);
      sessionRecorder.recordControl(gestureRobot.status());
      toggle.checked=true;
      status.textContent='Recording';
    } catch (error) {
      stream?.getTracks().forEach(track=>track.stop());
      status.textContent=`Recording not started: ${String(error)}. Switch ON again when ready.`;
    } finally {choosing=false;}
  }
  toggle.addEventListener('change',()=>{
    if(toggle.checked)void start();else void save();
  });
  retry.addEventListener('click',()=>void save());
  sessionRecorder.onAutomaticStop=()=>void save();
  setInterval(()=>{
    const recording=sessionRecorder.status();
    sessionRecorder.heartbeat();
    toggle.checked=recording.active&&!saving;
    toggle.disabled=choosing||saving||recording.saving||(recording.unsaved&&!recording.active);
    stateLabel.textContent=choosing?'Starting…':saving||recording.saving?'Saving…':recording.active?'ON':'OFF';
    retry.hidden=!(recording.unsaved&&!recording.active&&!saving);
    status.hidden=!status.textContent;
    if (recording.active&&!saving)
      status.textContent=`Recording ${(recording.elapsed_ms/1000).toFixed(0)} s · ${(recording.bytes/1048576).toFixed(1)} MB. ${recording.limits_reached?'Limit reached; saving…':''}`;
  },500);
  window.addEventListener('beforeunload',event=>{
    if (sessionRecorder.status().unsaved||saving) {event.preventDefault();event.returnValue='';}
  });
}
