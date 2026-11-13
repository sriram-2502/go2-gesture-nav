/** Local session recording. Never stores AES keys, cloud messages, or webcam video. */
import {zip, strToU8} from 'fflate';
import {RTC_TOPIC, DATA_CHANNEL_TYPE} from '../protocol/topics';
import type {DataChannelMessage} from '../types';
import {analysisFiles, encodeEvent, type RunEvent, type RunInfo, type RunMedia} from './session-format';

type Capture = {recorder: MediaRecorder; chunks: Blob[]; done: Promise<void>; media: RunMedia};
const SOFT_LIMIT = 128*1024*1024;
const MAX_DURATION_MS = 10*60*1000;

export class SessionRecorder {
  private active = false;
  private saving = false;
  private unsaved = false;
  private started = 0;
  private info: RunInfo | null = null;
  private lines: string[] = [];
  private bytes = 0;
  private captures: Capture[] = [];
  private displayStream: MediaStream | null = null;
  private cameraStream: MediaStream | null = null;
  private captureRobotVideo = false;
  private lastGestureFrame = -1;
  private lastControl = '';
  private limitNotified = false;
  onAutomaticStop: (() => void) | null = null;

  status() { return {active:this.active,saving:this.saving,unsaved:this.unsaved,elapsed_ms:this.active?performance.now()-this.started:0,
    bytes:this.bytes,counts:this.info?.counts || {},limits_reached:this.info?.limits_reached || false}; }

  start(name: string, display: MediaStream | null): void {
    if (this.active || this.saving || this.unsaved) throw new Error('Save the current recording before starting another');
    this.started = performance.now(); this.bytes=0; this.lines=[]; this.captures=[];
    this.lastGestureFrame=-1; this.lastControl=''; this.limitNotified=false;
    this.info={format:'clemson-go2-run',version:1,name:name.slice(0,80)||'Go2 run',started_utc:new Date().toISOString(),
      duration_ms:0,counts:{},media:[],limits_reached:false,dropped_events:0,
      alignment:'Browser monotonic receive times. Video offsets are approximate; robot timestamps are retained when received.'};
    this.active=true;
    this.unsaved=true;
    this.displayStream=display;
    this.captureRobotVideo=!!display;
    try {
      if (display) {
        this.capture(display,'dashboard');
        display.getVideoTracks()[0]?.addEventListener('ended',()=>this.onAutomaticStop?.(),{once:true});
      }
      if (this.cameraStream&&this.captureRobotVideo) {
        try {this.capture(this.cameraStream,'robot_camera');}
        catch (error) {this.record('event',{name:'camera_recording_failed',detail:String(error)});}
      }
      this.record('event',{name:'recording_started',dashboard_capture:!!display});
    } catch (error) {
      this.active=false;
      this.unsaved=false;
      for (const capture of this.captures) if (capture.recorder.state!=='inactive') capture.recorder.stop();
      display?.getTracks().forEach(track=>track.stop());
      throw error;
    }
  }

  attachCamera(stream: MediaStream): void {
    this.cameraStream=stream;
    if (this.active && this.captureRobotVideo && !this.captures.some(c=>c.media.file.startsWith('robot_camera.'))) {
      try { this.capture(stream,'robot_camera'); }
      catch (error) { this.record('event',{name:'camera_recording_failed',detail:String(error)}); }
    }
  }

  detachCamera():void {this.cameraStream=null;this.record('event',{name:'robot_camera_reference_cleared'});}

  private capture(stream: MediaStream, name: string): void {
    let recorder: MediaRecorder | null=null;
    for (const mimeType of ['video/mp4','video/mp4;codecs=avc1.42E01E','video/webm;codecs=vp8','video/webm']) {
      if (!MediaRecorder.isTypeSupported(mimeType)) continue;
      try { recorder=new MediaRecorder(new MediaStream(stream.getVideoTracks()),{mimeType,videoBitsPerSecond:2500000}); break; }
      catch { /* Try the next supported container/codec. */ }
    }
    if (!recorder) throw new Error('No supported browser video recording format');
    const media:RunMedia={file:`${name}.${recorder.mimeType.startsWith('video/mp4')?'mp4':'webm'}`,
      mime:recorder.mimeType,offset_ms:performance.now()-this.started,bytes:0};
    let finish!:()=>void;
    const capture:Capture={recorder,chunks:[],media,done:new Promise(resolve=>{finish=resolve;})};
    recorder.onstart=()=>{media.offset_ms=performance.now()-this.started;};
    recorder.ondataavailable=event=>{
      if (event.data.size) {capture.chunks.push(event.data); media.bytes+=event.data.size; this.bytes+=event.data.size; this.checkLimit();}
    };
    recorder.onerror=()=>{
      this.record('event',{name:'video_encoder_error',stream:name});
      if (recorder!.state!=='inactive') {try {recorder!.stop();} catch {finish();}}
      else finish();
      this.onAutomaticStop?.();
    };
    recorder.onstop=()=>{
      if(this.active&&!this.saving)this.record('event',{name:'video_stream_stopped',stream:name});
      finish();
    };
    this.captures.push(capture);
    recorder.start(1000);
  }

  record(kind:string,data:unknown):void {
    if (!this.active) return;
    try {
      const line=encodeEvent({t:Math.max(0,performance.now()-this.started),kind,data});
      const length=new TextEncoder().encode(line).length+1;
      if (this.bytes+length>SOFT_LIMIT) {this.info!.dropped_events++; this.checkLimit(true); return;}
      this.lines.push(line); this.bytes+=length;
      this.info!.counts[kind]=(this.info!.counts[kind]||0)+1;
      this.checkLimit();
    } catch {this.info!.dropped_events++;}
  }

  recordGesture(snapshot:any):void {
    if (snapshot.frame_id===this.lastGestureFrame) return;
    this.lastGestureFrame=snapshot.frame_id;
    // Explicit allowlist: no DOM snapshots, credentials, or raw webcam frames.
    this.record('gesture',{frame_id:snapshot.frame_id,label:snapshot.label,fresh:snapshot.fresh,
      age_ms:snapshot.age_ms,landmarks:snapshot.landmarks,proposed_velocity:snapshot.proposed_velocity,
      supervised_velocity:snapshot.supervised_velocity,navigation_status:snapshot.navigation_status,speeds:snapshot.speeds});
  }

  recordControl(status:unknown):void {
    if (!this.active) return;
    const text=JSON.stringify(status);
    if (text!==this.lastControl) {this.lastControl=text;this.record('control',status);}
  }

  robotMessage(direction:'sent'|'received',message:DataChannelMessage):void {
    if (!this.active) return;
    let data:any;
    try {data=typeof message.data==='string'?JSON.parse(message.data):message.data;} catch {return;}
    if (direction==='received' && message.topic===RTC_TOPIC.LIDAR_ARRAY) this.record('voxel',data);
    else if (direction==='received' && message.topic===RTC_TOPIC.LF_SPORT_MOD_STATE) this.record('state',data);
    else if (direction==='received' && message.topic===RTC_TOPIC.ROBOT_ODOM) this.record('odometry',data);
    else if (direction==='received' && message.topic===RTC_TOPIC.LOW_STATE) this.record('low_state',data);
    else if (message.topic && /^rt\/api\/(sport|motion_switcher|obstacles_avoid)\/(request|response)$/.test(message.topic)
        && [DATA_CHANNEL_TYPE.REQUEST,DATA_CHANNEL_TYPE.RESPONSE,DATA_CHANNEL_TYPE.MSG].includes(message.type as any))
      this.record(direction,{type:message.type,topic:message.topic,data});
  }

  private checkLimit(force=false):void {
    if (!this.active || this.saving || this.limitNotified) return;
    if (force || this.bytes>=SOFT_LIMIT || performance.now()-this.started>=MAX_DURATION_MS) {
      this.limitNotified=true;this.info!.limits_reached=true;
      queueMicrotask(()=>this.onAutomaticStop?.());
    }
  }

  heartbeat():void {this.checkLimit();}

  async finish():Promise<{blob:Blob;filename:string}> {
    if ((!this.active && !this.unsaved) || this.saving) throw new Error('No unsaved recording');
    this.saving=true;
    if (this.active) {
      this.record('event',{name:'recording_stopped'});
      this.info!.duration_ms=performance.now()-this.started;
    }
    this.active=false;
    // Stop recorders before releasing the screen track, preserving final MP4 metadata.
    for (const capture of this.captures) if (capture.recorder.state!=='inactive') capture.recorder.stop();
    await Promise.all(this.captures.map(capture=>capture.done));
    this.displayStream?.getTracks().forEach(track=>track.stop());
    this.displayStream=null;
    this.active=false;
    try {
      const files:Record<string,Uint8Array>={};
      const events=this.lines.map(line=>JSON.parse(line)) as RunEvent[];
      for (const [name,text] of Object.entries(analysisFiles(events))) files[name]=strToU8(text);
      files['events.jsonl']=strToU8(this.lines.join('\n')+'\n');
      this.info!.media=this.captures.filter(c=>c.media.bytes>0).map(c=>c.media);
      files['run.json']=strToU8(JSON.stringify(this.info,null,2));
      files['README.txt']=strToU8('Open this ZIP in the Clemson offline replay page. Videos may be MP4 or WebM depending on browser support. Data contains receive timestamps, not guaranteed sensor synchronization. Never replay command logs into a live robot.');
      for (const capture of this.captures.filter(c=>c.media.bytes>0))
        files[capture.media.file]=new Uint8Array(await new Blob(capture.chunks,{type:capture.media.mime}).arrayBuffer());
      const zipped=await new Promise<Uint8Array>((resolve,reject)=>zip(files,{level:0},(error,data)=>error?reject(error):resolve(data)));
      const filename=`${this.info!.name.replace(/[^a-z0-9_-]/gi,'_').slice(0,48)}_${this.info!.started_utc.replace(/[:.]/g,'-')}.zip`;
      const result={blob:new Blob([zipped as BlobPart],{type:'application/zip'}),filename};
      this.unsaved=false;this.lines=[];this.captures=[];
      return result;
    } finally {this.saving=false;}
  }
}

export const sessionRecorder=new SessionRecorder();
