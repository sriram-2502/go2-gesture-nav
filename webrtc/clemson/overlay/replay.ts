/** Offline entry point. Deliberately imports no App, robot adapter, or WebRTC code. */
import './replay.css';
import * as THREE from 'three';
import {OrbitControls} from 'three/examples/jsm/controls/OrbitControls.js';
import {unzipSync,strFromU8} from 'fflate';
import {VoxelMap} from './scene/voxel-map';
import {atOrBefore,decodeEvents,demoRun,MAX_ARCHIVE_BYTES,validateInfo,type RunEvent,type RunInfo} from './session-format';

const byId=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const dashboard=byId<HTMLVideoElement>('dashboard-video');
const camera=byId<HTMLVideoElement>('robot-camera');
const seek=byId<HTMLInputElement>('seek');
const play=byId<HTMLButtonElement>('play');
const speed=byId<HTMLSelectElement>('speed');
const notice=byId('notice');
const hands=byId<HTMLCanvasElement>('hands').getContext('2d')!;
const edges=[[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
let info:RunInfo|null=null, events:RunEvent[]=[], gestures:RunEvent[]=[], states:RunEvent[]=[], voxels:RunEvent[]=[], controls:RunEvent[]=[];
let playing=false, time=0, previous=performance.now(), dashboardOffset=0, cameraOffset=0;
let mediaUrls:string[]=[], lastVoxel=-2;
let scene:THREE.Scene|null=null, renderer:THREE.WebGLRenderer|null=null, orbit:OrbitControls|null=null;
let voxelMap:VoxelMap|null=null, marker:THREE.Group|null=null;
let sceneCamera:THREE.PerspectiveCamera|null=null;
const format=(values:any)=>Array.isArray(values)?values.map(v=>Number.isFinite(v)?v.toFixed(2):'—').join(' / '):'—';

function dataView():void {
  byId('dashboard-view').hidden=true;byId('data-view').hidden=false;
  if (!renderer) {
    try {
      scene=new THREE.Scene();scene.background=new THREE.Color('#100d16');
      sceneCamera=new THREE.PerspectiveCamera(55,1,.05,200);
      sceneCamera.up.set(0,0,1);sceneCamera.position.set(4,-5,5);
      renderer=new THREE.WebGLRenderer({canvas:byId<HTMLCanvasElement>('voxel-canvas'),antialias:true});
      orbit=new OrbitControls(sceneCamera,renderer.domElement);orbit.target.set(0,0,0);orbit.update();
      const grid=new THREE.GridHelper(20,40,0x76518f,0x352444);grid.rotation.x=Math.PI/2;scene.add(grid);
      scene.add(new THREE.AxesHelper(1));
      marker=new THREE.Group();
      const body=new THREE.Mesh(new THREE.BoxGeometry(.45,.25,.15),new THREE.MeshBasicMaterial({color:0xf56600}));
      marker.add(body);marker.add(new THREE.ArrowHelper(new THREE.Vector3(1,0,0),new THREE.Vector3(0,0,.15),.6,0xffcd5f));
      scene.add(marker);voxelMap=new VoxelMap(scene);lastVoxel=-2;
    } catch (error) {byId('voxel-status').textContent=`3D rendering unavailable: ${String(error)}`;}
  }
}

function syncVideo(video:HTMLVideoElement,offset:number,force=false):void {
  if (!video.src) return;
  const target=(time-offset)/1000;
  const end=Number.isFinite(video.duration)?video.duration:Infinity;
  if (target<0 || target>end) {video.pause();video.hidden=true;return;}
  video.hidden=false;
  if (force || Math.abs(video.currentTime-target)>.2) {try{video.currentTime=target;}catch{}}
  video.playbackRate=Number(speed.value);
  if (playing) void video.play().catch(()=>{notice.textContent='Click Play again to allow video playback.';});
  else video.pause();
}

function update(force=false):void {
  if (!info) return;
  seek.value=String(time);
  byId('time').textContent=`${(time/1000).toFixed(1)} / ${(info.duration_ms/1000).toFixed(1)} s`;
  const gesture=gestures[atOrBefore(gestures,time)];
  const state=states[atOrBefore(states,time)];
  const control=controls[atOrBefore(controls,time)];
  hands.clearRect(0,0,640,480);
  if (gesture && time-gesture.t<=500 && gesture.data.fresh) {
    for(const hand of gesture.data.landmarks||[]) {
      if (!Array.isArray(hand)||hand.length!==21||!hand.every((p:any)=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite))) continue;
      hands.strokeStyle='#40debe';hands.lineWidth=3;hands.fillStyle='#ffcd5f';
      for(const [a,b] of edges){hands.beginPath();hands.moveTo(hand[a][0]*640,hand[a][1]*480);hands.lineTo(hand[b][0]*640,hand[b][1]*480);hands.stroke();}
      for(const p of hand){hands.beginPath();hands.arc(p[0]*640,p[1]*480,4,0,Math.PI*2);hands.fill();}
    }
    byId('gesture-label').textContent=String(gesture.data.label);
    byId('requested').textContent=format(gesture.data.proposed_velocity);
    byId('supervised').textContent=format(gesture.data.supervised_velocity);
  } else {
    byId('gesture-label').textContent='No fresh recorded gesture';
    byId('requested').textContent=byId('supervised').textContent='—';
  }
  byId('measured').textContent=state&&time-state.t<=1000?format([...(state.data.velocity||[]).slice(0,2),state.data.yaw_speed]):'Not available / stale';
  byId('control').textContent=control?String(control.data.reason||'—'):'Not recorded';
  if (marker && state?.data.position?.length===3 && state.data.position.every(Number.isFinite)) {
    marker.visible=true;marker.position.set(...state.data.position as [number,number,number]);
    const q=state.data.imu_state?.quaternion;
    if(Array.isArray(q)&&q.length===4&&q.every(Number.isFinite)) marker.quaternion.set(q[1],q[2],q[3],q[0]);
  } else if(marker) marker.visible=false;
  const voxelIndex=atOrBefore(voxels,time);
  if(voxelMap && voxelIndex!==lastVoxel) {
    lastVoxel=voxelIndex;voxelMap.clear();
    if(voxelIndex>=0){
      const packet=voxels[voxelIndex].data;
      const bytes=packet?.data;
      if(bytes instanceof ArrayBuffer&&bytes.byteLength>0&&bytes.byteLength<=61440
          &&Array.isArray(packet.origin)&&packet.origin.length>=3&&packet.origin.every(Number.isFinite)
          &&Number.isFinite(packet.resolution)&&packet.resolution>0&&packet.resolution<=1)
        voxelMap.processCompressed(packet);
    }
  }
  if(renderer) byId('voxel-status').textContent=voxelIndex>=0
    ?`Recorded local pose + voxel packet ${voxelIndex+1}/${voxels.length} · drag to orbit, scroll to zoom`
    :'No voxel packet at this time. Local pose is shown when recorded.';
  syncVideo(dashboard,dashboardOffset,force);syncVideo(camera,cameraOffset,force);
  byId('dashboard-missing').hidden=!!dashboard.src&&!dashboard.hidden;
  byId('camera-missing').hidden=!!camera.src&&!camera.hidden;
  const index=atOrBefore(events,time);
  byId('event-log').textContent=events.slice(Math.max(0,index-8),index+1).map(e=>`${(e.t/1000).toFixed(2)} s  ${e.kind}`).join('\n');
}

function load(infoValue:RunInfo,eventValue:RunEvent[],files:Record<string,Uint8Array>={}):void {
  playing=false;play.textContent='Play';dashboard.pause();camera.pause();
  for(const url of mediaUrls)URL.revokeObjectURL(url);mediaUrls=[];
  dashboard.removeAttribute('src');camera.removeAttribute('src');dashboard.load();camera.load();
  info=infoValue;events=eventValue;time=0;lastVoxel=-2;voxelMap?.clear();
  gestures=events.filter(e=>e.kind==='gesture');states=events.filter(e=>e.kind==='state');
  voxels=events.filter(e=>e.kind==='voxel');controls=events.filter(e=>e.kind==='control');
  byId('run-name').textContent=info.name;
  byId('details').textContent=JSON.stringify(info,null,2);
  seek.max=String(info.duration_ms);seek.disabled=false;play.disabled=false;
  const download=byId<HTMLAnchorElement>('download-video');download.hidden=true;
  for(const media of info.media){
    if(!files[media.file])continue;
    const url=URL.createObjectURL(new Blob([files[media.file] as BlobPart],{type:media.mime}));mediaUrls.push(url);
    if(media.file.startsWith('dashboard.')){
      dashboard.src=url;dashboardOffset=media.offset_ms;download.href=url;download.download=media.file;download.hidden=false;
    }else{camera.src=url;cameraOffset=media.offset_ms;}
  }
  if(dashboard.src){byId('dashboard-view').hidden=false;byId('data-view').hidden=true;}else dataView();
  notice.textContent=`${info.alignment}${info.limits_reached?' Recording limit reached; inspect dropped_events.':''}`;
  update(true);
}

byId<HTMLInputElement>('open-run').addEventListener('change',async event=>{
  const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;
  const input=event.target as HTMLInputElement;
  playing=false;play.textContent='Play';dashboard.pause();camera.pause();input.disabled=true;
  notice.textContent='Opening recording…';
  try{
    if(file.size>MAX_ARCHIVE_BYTES)throw new Error('Recording exceeds the 256 MB import limit');
    let total=0;
    const files=unzipSync(new Uint8Array(await file.arrayBuffer()),{filter:entry=>{
      if(!/^(run\.json|events\.jsonl|dashboard\.(mp4|webm)|robot_camera\.(mp4|webm))$/.test(entry.name))return false;
      total+=entry.originalSize;if(total>MAX_ARCHIVE_BYTES)throw new Error('Expanded recording is too large');return true;
    }});
    if(!files['run.json']||!files['events.jsonl'])throw new Error('Missing run.json or events.jsonl');
    const metadata=validateInfo(JSON.parse(strFromU8(files['run.json'])));
    load(metadata,decodeEvents(strFromU8(files['events.jsonl'])),files);
  }catch(error){notice.textContent=`Could not open recording: ${String(error)}`;}
  finally{input.disabled=false;input.value='';}
});
byId('demo').addEventListener('click',()=>{const demo=demoRun();load(demo.info,demo.events);});
play.addEventListener('click',()=>{if(!info)return;if(time>=info.duration_ms)time=0;playing=!playing;play.textContent=playing?'Pause':'Play';previous=performance.now();update(true);});
seek.addEventListener('input',()=>{time=Number(seek.value);update(true);});
speed.addEventListener('change',()=>update(true));
byId('show-data').addEventListener('click',()=>{dataView();update(true);});
byId('show-dashboard').addEventListener('click',()=>{byId('dashboard-view').hidden=false;byId('data-view').hidden=true;update(true);});
function frame(now:number):void {
  if(playing&&info){time=Math.min(info.duration_ms,time+(now-previous)*Number(speed.value));if(time===info.duration_ms){playing=false;play.textContent='Play';}update();}
  previous=now;
  if(renderer&&scene&&sceneCamera&&!byId('data-view').hidden){
    const parent=renderer.domElement.parentElement!;const w=parent.clientWidth,h=parent.clientHeight;
    if(w&&h){
      if(renderer.domElement.width!==w||renderer.domElement.height!==h){renderer.setSize(w,h,false);sceneCamera.aspect=w/h;sceneCamera.updateProjectionMatrix();}
      orbit?.update();renderer.render(scene,sceneCamera);
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
