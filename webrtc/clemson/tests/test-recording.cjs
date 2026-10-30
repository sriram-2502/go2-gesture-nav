// Recording/export/import tests use fake media encoders. No screen or robot access.
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ui=path.resolve(__dirname,'../unitree_ui');
const ts=require(path.join(ui,'node_modules/typescript'));
const fflate=require(path.join(ui,'node_modules/fflate'));
let clock=1000, allowedMime='video/mp4';
class FakeStream {
  constructor(tracks=[{stopped:false,stop(){this.stopped=true;},addEventListener(){}}]){this.tracks=tracks;}
  getVideoTracks(){return this.tracks;}getTracks(){return this.tracks;}
}
class FakeRecorder {
  static isTypeSupported(type){return type===allowedMime;}
  constructor(stream,options){this.stream=stream;this.mimeType=options.mimeType;this.state='inactive';}
  start(){this.state='recording';queueMicrotask(()=>this.onstart?.());}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['fake-video'])});this.onstop?.();});}
}
function load(file,imports={}){
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};vm.runInNewContext(code,{exports,require:name=>imports[name],TextEncoder,TextDecoder,Blob,Uint8Array,ArrayBuffer,
    btoa,atob,queueMicrotask,MediaRecorder:FakeRecorder,MediaStream:FakeStream,performance:{now:()=>clock}});return exports;
}
const format=load(path.resolve(__dirname,'../overlay/session-format.ts'));
const topics=load(path.join(ui,'src/protocol/topics.ts'));
const {SessionRecorder}=load(path.resolve(__dirname,'../overlay/session-recorder.ts'),{'fflate':fflate,'./session-format':format,'../protocol/topics':topics});

test('voxel bytes round-trip exactly and timeline seeks select the last prior event',()=>{
  const line=format.encodeEvent({t:10,kind:'voxel',data:{data:new Uint8Array([0,7,128,255])}});
  const decoded=format.decodeEvents(line);
  assert.deepEqual(Array.from(new Uint8Array(decoded[0].data.data)),[0,7,128,255]);
  assert.equal(format.atOrBefore([{t:1},{t:2},{t:2},{t:5}],2),2);
  assert.equal(format.atOrBefore([{t:1}],0),-1);
});
test('bad timestamps, media names, and unsupported file versions are rejected',()=>{
  assert.throws(()=>format.decodeEvents('{"t":2,"kind":"state"}\n{"t":1,"kind":"state"}'));
  assert.throws(()=>format.validateInfo({format:'clemson-go2-run',version:2,duration_ms:1,media:[]}));
  assert.throws(()=>format.validateInfo({format:'clemson-go2-run',version:1,duration_ms:1,media:[{file:'../../key.txt',mime:'video/mp4',offset_ms:0}]}));
});
test('CSV quotes labels safely and preserves numerical signs',()=>{
  const output=format.csv(['name','vy'],[['=SUM(A1)',-.5],['a,b',.5]]);
  assert.match(output,/'=SUM/);assert.match(output,/"-0.5"/);assert.match(output,/"a,b"/);
});
test('data-only recording produces a complete importable single ZIP without credentials',async()=>{
  const recorder=new SessionRecorder();recorder.attachCamera(new FakeStream());recorder.start('Class run',null);
  clock+=100;
  recorder.recordGesture({frame_id:10,label:'FORWARD',fresh:true,landmarks:[],proposed_velocity:[.5,0,0],supervised_velocity:[0,0,0],navigation_status:'HOLD',speeds:{forward:.5,turn:.8}});
  recorder.robotMessage('received',{topic:'cloud/login',type:'response',data:{password:'DO-NOT-RECORD'}});
  recorder.robotMessage('received',{topic:topics.RTC_TOPIC.LF_SPORT_MOD_STATE,type:'msg',data:{velocity:[0,0,0],yaw_speed:0,body_height:.3}});
  const result=await recorder.finish();
  const files=fflate.unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  const metadata=format.validateInfo(JSON.parse(fflate.strFromU8(files['run.json'])));
  const text=fflate.strFromU8(files['events.jsonl']);
  assert.equal(metadata.media.length,0);assert.equal(metadata.counts.gesture,1);
  assert.equal(text.includes('DO-NOT-RECORD'),false);assert.ok(files['commands.csv']);
  assert.ok(format.decodeEvents(text).length>=3);assert.equal(recorder.status().active,false);
});
test('MP4 capture finalizes before export and does not stop the shared robot camera track',async()=>{
  allowedMime='video/mp4';const recorder=new SessionRecorder();
  const camera=new FakeStream(),display=new FakeStream();recorder.attachCamera(camera);
  recorder.start('Video run',display);await Promise.resolve();clock+=1000;
  const result=await recorder.finish();
  const files=fflate.unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  const info=JSON.parse(fflate.strFromU8(files['run.json']));
  assert.ok(files['dashboard.mp4']);assert.ok(files['robot_camera.mp4']);
  assert.equal(info.media.length,2);assert.equal(display.tracks[0].stopped,true);assert.equal(camera.tracks[0].stopped,false);
});
test('unsupported MP4 falls back to a correctly named WebM file',async()=>{
  allowedMime='video/webm';const recorder=new SessionRecorder();recorder.start('Fallback',new FakeStream());
  const result=await recorder.finish();const files=fflate.unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.ok(files['dashboard.webm']);assert.equal(files['dashboard.mp4'],undefined);allowedMime='video/mp4';
});
test('failed ZIP export keeps data for a retry instead of overwriting or discarding the run',async()=>{
  let attempts=0;
  const retryZip={...fflate,zip:(files,options,callback)=>{
    if(attempts++===0)callback(new Error('Simulated export failure'));else fflate.zip(files,options,callback);
  }};
  const {SessionRecorder:RetryRecorder}=load(path.resolve(__dirname,'../overlay/session-recorder.ts'),{'fflate':retryZip,'./session-format':format,'../protocol/topics':topics});
  const recorder=new RetryRecorder();recorder.start('Retry test',null);recorder.record('event',{name:'keep-me'});
  await assert.rejects(recorder.finish(),/Simulated export failure/);
  assert.equal(recorder.status().unsaved,true);assert.throws(()=>recorder.start('Overwrite',null));
  const result=await recorder.finish();
  const files=fflate.unzipSync(new Uint8Array(await result.blob.arrayBuffer()));
  assert.match(fflate.strFromU8(files['events.jsonl']),/keep-me/);assert.equal(recorder.status().unsaved,false);
});
test('replay entry point has no live robot modules or command API',()=>{
  const source=fs.readFileSync(path.resolve(__dirname,'../overlay/replay.ts'),'utf8');
  assert.equal(/from ['"].*(gesture-robot|connection\/|ui\/app|session-recorder)/.test(source),false);
  assert.equal(/robot-api|publishRequest|connectLocal/.test(source),false);
  const demo=format.demoRun();format.validateInfo(demo.info);
  assert.equal(format.decodeEvents(demo.events.map(format.encodeEvent).join('\n')).length,163);
});
test('the actual upstream WASM worker decodes the synthetic replay voxel packet',async()=>{
  const code=ts.transpileModule(fs.readFileSync(path.join(ui,'src/workers/voxel-worker.ts'),'utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const wasm=fs.readFileSync(path.join(ui,'public/libvoxel.wasm'));
  const replies=[];let receive;
  vm.runInNewContext(code,{exports:{},require:()=>({workerLog:{info(){},error(error){throw new Error(String(error));}}}),
    WebAssembly,Uint8Array,Int8Array,Int16Array,Int32Array,Uint32Array,Float32Array,Float64Array,ArrayBuffer,
    fetch:async()=>({arrayBuffer:async()=>wasm.buffer.slice(wasm.byteOffset,wasm.byteOffset+wasm.byteLength)}),
    self:{postMessage:message=>replies.push(message),addEventListener:(_type,handler)=>{receive=handler;}}});
  for(let attempt=0;attempt<100&&!replies.some(m=>m.type==='clemson-ready');attempt++)await new Promise(resolve=>setTimeout(resolve,5));
  assert.ok(replies.some(m=>m.type==='clemson-ready'));
  const packet=format.demoRun().events[0].data;
  receive({data:{...packet,__clemson_revision:7}});
  const output=replies.find(m=>m.geometryData);
  assert.ok(output.geometryData.face_count>0);assert.ok(output.geometryData.positions.length>0);
  assert.equal(output.__clemson_revision,7);
});
