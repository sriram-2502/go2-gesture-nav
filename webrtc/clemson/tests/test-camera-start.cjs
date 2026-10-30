const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const ts=require(path.resolve(__dirname,'../unitree_ui/node_modules/typescript'));
const source=fs.readFileSync(path.resolve(__dirname,'../overlay/camera-start.ts'),'utf8');
const exportsObject={};
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,
  {exports:exportsObject,performance});
const {CameraStartup}=exportsObject;

test('restarts after a previously active webcam is released',async()=>{
  let time=0,starts=0;
  const camera=new CameraStartup(()=>time);
  const start=async()=>{starts++;};
  await camera.ensure(false,start);assert.equal(starts,1);
  await camera.ensure(true,start);time=9000;
  await camera.ensure(false,start);assert.equal(starts,2);
});
test('failed start remains visible and retries after backoff',async()=>{
  let time=0,starts=0;
  const camera=new CameraStartup(()=>time);
  const start=async()=>{starts++;throw 'Webcam busy';};
  await camera.ensure(false,start);assert.equal(camera.error,'Webcam busy');
  time=1000;await camera.ensure(false,start);assert.equal(starts,1);
  time=5000;await camera.ensure(false,start);assert.equal(starts,2);
  await camera.ensure(true,start);assert.equal(camera.error,'');
});
test('polling cannot issue competing start requests',async()=>{
  let release,starts=0;
  const camera=new CameraStartup(()=>0);
  const first=camera.ensure(false,()=>{starts++;return new Promise(resolve=>{release=resolve;});});
  await camera.ensure(false,async()=>{starts++;});
  assert.equal(starts,1);assert.equal(camera.pending,true);
  release();await first;assert.equal(camera.pending,false);
});
