// Run with the workspace Node runtime. No browser, credentials, or robot needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = path.resolve(__dirname, '../unitree_ui');
const ts = require(path.join(ui, 'node_modules/typescript'));
function load(filename, imports = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {exports, require: name => imports[name],
    setTimeout, clearTimeout, setInterval: () => 0, performance,
    document: {hidden: false, addEventListener() {}}, window: {addEventListener() {}}, ...globals});
  return exports;
}
const topics = load(path.join(ui, 'src/protocol/topics.ts'));
const {GestureRobot, validVelocity, gestureToPose} = load(path.resolve(__dirname, '../overlay/gesture-robot.ts'), {
  '../protocol/topics': topics,
  './session-recorder': {sessionRecorder:{robotMessage(){},attachCamera(){},detachCamera(){}}}
});
const {RTC_TOPIC: T, SPORT_CMD: A, DATA_CHANNEL_TYPE: D} = topics;

function fixture(mode = 'mcf', rejectStop = false, avoidanceOptions = {}, experimentalStationaryGestures = true) {
  let clock = 10000, frame = 1, height = .3;
  let avoidance = false;
  let behavior = 'none';
  const messages = [];
  // Existing stationary experiments remain testable, but production defaults off.
  const robot = new GestureRobot(() => clock, async ms => { clock += ms; feedback(); robot.noteVideoFrame(); }, false, experimentalStationaryGestures);
  function feedback() { robot.receive({type: D.MSG, topic: T.LF_SPORT_MOD_STATE,
    data: {velocity: [0,0,0], yaw_speed: 0, body_height: height,
      mode: avoidanceOptions.missingMode ? undefined : behavior === 'pose' ? 2 : behavior === 'bound' ? 15 : behavior === 'stand' ? 1 : 0,
      error_code: avoidanceOptions.missingMode ? undefined : behavior === 'pose' ? 1091 : behavior === 'bound' ? 2008 : 1013,
      foot_force: avoidanceOptions.noFeet ? undefined : [30, 30, 30, 30]}}); }
  function input(label = 'STOP', velocity = [0,0,0], newFrame = true) {
    if (newFrame) frame++;
    robot.updateInput({fresh: true, label, frame_id: frame, age_ms: 0, supervised_velocity: velocity}, clock);
  }
  robot.bind(message => {
    messages.push({message, time: clock});
    if (message.type !== D.REQUEST) return;
    const api = message.data.header.identity.api_id;
    const avoidRequest = message.topic === T.OBSTACLES_AVOID;
    if (!avoidanceOptions.ignoreBehavior && api !== avoidanceOptions.rejectApi) {
      if (api === A.Pose) behavior = JSON.parse(message.data.parameter).data ? 'pose' : 'none';
      if (api === A.FreeBound) behavior = JSON.parse(message.data.parameter).data ? 'bound' : 'none';
      if (api === A.BalanceStand) behavior = 'stand';
    }
    if (avoidRequest && api === 1001 && !avoidanceOptions.rejectSet && !avoidanceOptions.ignoreSet)
      avoidance = JSON.parse(message.data.parameter).enable;
    robot.receive({type: D.RESPONSE, topic: message.topic.replace(/request$/, 'response'),
      data: {header: {identity: message.data.header.identity, status: {code: api === avoidanceOptions.rejectApi || (rejectStop && api === A.StopMove) || (avoidRequest && api === 1001 && avoidanceOptions.rejectSet) ? 1 : 0}},
        data: JSON.stringify(avoidRequest ? {enable: avoidance} : {name: mode})}});
  }, () => true);
  feedback(); robot.noteVideoFrame(); input();
  return {robot, messages, input, feedback, setHeight: v => {height = v; feedback();},
    setBehavior: value => {behavior = value; feedback();},
    advance: ms => {clock += ms;}, now: () => clock};
}
function apiMessages(f, api) { return f.messages.filter(x => x.message.data.header.identity.api_id === api); }

test('production rejects deferred stationary control before sending any robot request', async () => {
  let requests = 0;
  const robot = new GestureRobot(() => 10000, async () => {}, false);
  robot.bind(() => { requests++; }, () => true);
  await robot.selectBehavior('pose');
  assert.equal(requests, 0);
  assert.equal(robot.status().behavior, 'none');
  assert.equal(robot.status().poseReady, false);
  assert.match(robot.status().actionMessage, /deferred/);
});

test('transport rejects mixed axes and speeds outside the agreed contract', () => {
  for (const v of [[.5,0,0], [1,0,0], [0,-.5,0], [0,0,-.8], [0,0,0]]) assert.equal(validVelocity(v), true);
  for (const v of [[.49,0,0], [0,.4,0], [.5,.5,0], [0,0,1.01], [NaN,0,0]]) assert.equal(validVelocity(v), false);
});
test('preview sends no robot requests until explicitly enabled', async () => {
  const f = fixture(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  assert.equal(f.messages.length, 0);
  await f.robot.enable(); assert.equal(f.robot.status().enabled, true);
});
test('MCF sends bounded no-reply Move through the shared connection', async () => {
  const f = fixture(); await f.robot.enable(); f.input('STRAFE_RIGHT', [0,-.5,0]); await f.robot.tick();
  const move = apiMessages(f, A.Move).at(-1).message;
  assert.equal(move.type, D.MSG); assert.equal(move.data.header.policy.noreply, true);
  assert.deepEqual(JSON.parse(move.data.parameter), {x:0,y:-.5,z:0});
  await f.robot.disable();
});
test('normal mode Move waits for a successful API acknowledgement', async () => {
  const f = fixture('normal'); await f.robot.enable(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  assert.equal(apiMessages(f, A.Move).at(-1).message.type, D.REQUEST);
  assert.equal(f.robot.status().sent[0], .5); await f.robot.disable();
});
test('StopMove acknowledgement and sustained low speed precede BalanceStand', async () => {
  const f = fixture(); await f.robot.enable(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  const before = f.now(); await f.robot.disable();
  assert.equal(f.robot.status().enabled, false);
  assert.equal(apiMessages(f, A.StopMove).length, 3);
  assert.ok(apiMessages(f, A.BalanceStand)[0].time - before >= 300);
  assert.match(f.robot.status().stopResult, /confirmed/);
});
test('rejected StopMove never proceeds to BalanceStand', async () => {
  const f = fixture('mcf', true); await f.robot.enable(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  await f.robot.disable(); assert.equal(apiMessages(f, A.BalanceStand).length, 0);
  assert.match(f.robot.status().stopResult, /USE THE REMOTE/);
});
test('low body height prevents the final stance command', async () => {
  const f = fixture(); await f.robot.enable(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  f.setHeight(.1); await f.robot.disable(); assert.equal(apiMessages(f, A.BalanceStand).length, 0);
});
test('stale camera disarms and sends a stop sequence', async () => {
  const f = fixture(); await f.robot.enable(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  f.advance(1100); f.feedback(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  assert.equal(f.robot.status().enabled, false); assert.ok(apiMessages(f, A.StopMove).length > 0);
});
test('repeated copies of one frame cannot keep motion alive', async () => {
  const f = fixture(); await f.robot.enable(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  f.advance(401); f.feedback(); f.robot.noteVideoFrame(); f.input('FORWARD', [.5,0,0], false); await f.robot.tick();
  assert.equal(f.robot.status().enabled, false);
});
test('a student mapping error cannot move on UNKNOWN or the wrong axis', async () => {
  const f = fixture(); await f.robot.enable();
  f.input('UNKNOWN', [.5,0,0]); await f.robot.tick();
  assert.equal(f.robot.status().enabled, false);
  assert.equal(apiMessages(f, A.Move).length, 0);
  f.input(); await f.robot.enable(); f.input('TURN_LEFT', [.5,0,0]); await f.robot.tick();
  assert.equal(f.robot.status().enabled, false);
});
test('avoidance reads actual state without changing it', async () => {
  const f = fixture(); await f.robot.refreshObstacleAvoidance();
  assert.equal(f.robot.status().avoidance, false); assert.equal(f.robot.status().avoidanceFresh, true);
  assert.equal(f.messages.filter(x => x.message.topic === T.OBSTACLES_AVOID && x.message.data.header.identity.api_id === 1001).length, 0);
});
test('avoidance switch uses set then readback and leaves gesture control disabled', async () => {
  const f = fixture(); await f.robot.enable(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  await f.robot.setObstacleAvoidance(true);
  const commands = f.messages.filter(x => x.message.topic === T.OBSTACLES_AVOID);
  assert.equal(commands.length, 2);
  assert.deepEqual(JSON.parse(commands[0].message.data.parameter), {enable: true});
  assert.equal(commands[1].message.data.header.identity.api_id, 1002);
  assert.equal(f.robot.status().avoidance, true); assert.equal(f.robot.status().enabled, false);
  assert.match(f.robot.status().avoidanceMessage, /confirms ON/);
  assert.ok(apiMessages(f, A.BalanceStand)[0].time <= commands[0].time);
});
test('rejected avoidance change remains unconfirmed', async () => {
  const f = fixture('mcf', false, {rejectSet: true});
  await f.robot.setObstacleAvoidance(true);
  assert.equal(f.robot.status().avoidanceFresh, false);
  assert.match(f.robot.status().avoidanceMessage, /not confirmed/);
});
test('mismatched readback displays actual OFF rather than requested ON', async () => {
  const f = fixture('mcf', false, {ignoreSet: true});
  await f.robot.setObstacleAvoidance(true);
  assert.equal(f.robot.status().avoidance, false);
  assert.match(f.robot.status().avoidanceMessage, /still reports OFF/);
});
test('failed stop prevents an avoidance change', async () => {
  const f = fixture('mcf', true); await f.robot.enable(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  await f.robot.setObstacleAvoidance(false);
  assert.equal(f.messages.filter(x => x.message.topic === T.OBSTACLES_AVOID).length, 0);
  assert.match(f.robot.status().avoidanceMessage, /Stop not confirmed/);
});
test('disconnect clears the displayed avoidance state', async () => {
  const f = fixture(); await f.robot.setObstacleAvoidance(true); f.robot.detach();
  assert.equal(f.robot.status().avoidance, null); assert.equal(f.robot.status().avoidanceFresh, false);
});

function battery(f, soc, json = false) {
  const data = {bms_state: {soc}};
  f.robot.receive({type: D.MSG, topic: T.LOW_STATE, data: json ? JSON.stringify(data) : data});
}

test('battery accepts object and JSON lowstate telemetry, including zero, without robot requests', () => {
  const f = fixture();
  assert.equal(f.robot.status().batteryPercent, null);
  assert.equal(f.robot.status().batteryFresh, false);
  for (const [soc, json] of [[82, false], [45, true], [0, false], [100, true]]) {
    battery(f, soc, json);
    assert.equal(f.robot.status().batteryPercent, soc);
    assert.equal(f.robot.status().batteryFresh, true);
  }
  assert.equal(f.messages.length, 0);
});

test('invalid or unrelated packets cannot refresh battery freshness', () => {
  const f = fixture(); battery(f, 73);
  f.advance(4900);
  for (const soc of [-1, 101, NaN, Infinity, '90', null, undefined, true]) battery(f, soc);
  f.robot.receive({type: D.MSG, topic: T.LOW_STATE, data: '{bad json'});
  f.robot.receive({type: D.MSG, topic: T.LF_SPORT_MOD_STATE, data: {bms_state: {soc: 90}}});
  f.robot.receive({type: D.RESPONSE, topic: T.LOW_STATE, data: {bms_state: {soc: 90}}});
  assert.equal(f.robot.status().batteryPercent, 73);
  f.advance(101); f.feedback();
  assert.equal(f.robot.status().batteryFresh, false);
  assert.equal(f.robot.status().batteryPercent, null);
  battery(f, 72);
  assert.equal(f.robot.status().batteryPercent, 72);
});

test('battery is unavailable when transport disconnects and is cleared on a new session', () => {
  const f = fixture(); battery(f, 80);
  f.robot.connected = () => false;
  assert.equal(f.robot.status().batteryPercent, null);
  f.robot.bind(() => {}, () => true);
  assert.equal(f.robot.status().batteryPercent, null);
  assert.equal(f.robot.status().batteryFresh, false);
  battery(f, 60);
  f.robot.detach();
  assert.equal(f.robot.status().batteryPercent, null);
});

test('Enable accepts missing-hand input and a preheld movement requires new post-enable frames', async () => {
  const f = fixture(); f.input('NO_HAND'); await f.robot.enable();
  assert.equal(f.robot.status().enabled, true);
  await f.robot.disable();
  f.input('FORWARD', [.5,0,0]); await f.robot.enable();
  await f.robot.tick();
  assert.equal(apiMessages(f, A.Move).length, 0);
  f.input('FORWARD', [.5,0,0], false); await f.robot.tick();
  assert.equal(apiMessages(f, A.Move).length, 0);
  f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  assert.equal(apiMessages(f, A.Move).length, 1);
});

test('stale state or camera prevents scene actions independently of hand recognition', async () => {
  for (const behavior of ['jump', 'backflip', 'bound', 'pose']) {
    const f = fixture(); f.advance(1100);
    await f.robot.selectBehavior(behavior);
    assert.equal(f.messages.length, 0);
    assert.match(f.robot.status().actionMessage, /expired/);
  }
});

test('Bound selection pauses navigation, verifies mode feedback, and lets gestures use the selected gait', async () => {
  const f = fixture(); await f.robot.enable(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  await f.robot.selectBehavior('bound');
  assert.equal(f.robot.status().enabled, false);
  assert.equal(f.robot.status().behavior, 'bound');
  assert.equal(f.robot.status().behaviorConfirmed, true);
  assert.deepEqual(JSON.parse(apiMessages(f, A.FreeBound)[0].message.data.parameter), {data:true});
  f.input(); await f.robot.enable(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  assert.equal(f.robot.status().enabled, true);
  assert.equal(f.robot.status().sent[0], .5);
  await f.robot.disable();
  assert.deepEqual(JSON.parse(apiMessages(f, A.FreeBound).at(-1).message.data.parameter), {data:false});
  assert.equal(f.robot.status().behavior, 'none');
});

test('stationary gestures send roll/pitch/yaw targets without walking and center on stale hand input', async () => {
  const f = fixture('normal');
  await f.robot.selectBehavior('pose');
  assert.equal(f.robot.status().behaviorConfirmed, true);
  await f.robot.enable(); assert.equal(f.robot.status().enabled, false);
  f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  assert.deepEqual(JSON.parse(apiMessages(f, A.Euler).at(-1).message.data.parameter), {x:0,y:.12,z:0});
  f.input('STRAFE_LEFT', [0,.5,0]); await f.robot.tick();
  assert.deepEqual(JSON.parse(apiMessages(f, A.Euler).at(-1).message.data.parameter), {x:.12,y:0,z:0});
  f.input('TURN_RIGHT', [0,0,-.8]); await f.robot.tick();
  assert.deepEqual(JSON.parse(apiMessages(f, A.Euler).at(-1).message.data.parameter), {x:0,y:0,z:-.15});
  assert.equal(apiMessages(f, A.Move).length, 0);
  f.advance(401); f.feedback(); f.robot.noteVideoFrame(); await f.robot.tick();
  assert.deepEqual(JSON.parse(apiMessages(f, A.Euler).at(-1).message.data.parameter), {x:0,y:0,z:0});
  await f.robot.disable();
  assert.equal(apiMessages(f, A.Pose).length, 0);
  assert.ok(apiMessages(f, A.BalanceStand).length >= 2);
  assert.equal(f.robot.status().behavior, 'none');
});

test('selecting a second behavior exits the previous persistent mode first', async () => {
  const f = fixture(); await f.robot.selectBehavior('pose');
  await f.robot.selectBehavior('bound');
  const poseExit = apiMessages(f, A.Euler).at(-1);
  const boundEnter = apiMessages(f, A.FreeBound)[0];
  assert.deepEqual(JSON.parse(poseExit.message.data.parameter), {x:0,y:0,z:0});
  assert.ok(f.messages.indexOf(poseExit) < f.messages.indexOf(boundEnter));
  assert.equal(f.robot.status().behavior, 'bound');
  await f.robot.selectBehavior('bound');
  assert.equal(f.robot.status().behavior, 'none');
});

test('rejected or unconfirmed behavior entry is never highlighted as active', async () => {
  for (const options of [{rejectApi:A.BalanceStand}, {ignoreBehavior:true, missingMode:true}]) {
    const f = fixture('normal', false, options); await f.robot.selectBehavior('pose');
    assert.equal(f.robot.status().behaviorConfirmed, false);
    assert.equal(f.robot.status().enabled, false);
    assert.match(f.robot.status().actionMessage, /rejected|not confirmed/);
    f.input('FORWARD', [.5,0,0]); const before = apiMessages(f, A.Euler).length; await f.robot.tick();
    assert.equal(apiMessages(f, A.Euler).length, before);
  }
});

test('Jump sends one action, latches against repeats, and Stop waits for grounded recovery', async () => {
  const f = fixture(); await f.robot.selectBehavior('jump');
  assert.equal(apiMessages(f, A.FrontJump).length, 1);
  assert.deepEqual(JSON.parse(apiMessages(f, A.FrontJump)[0].message.data.parameter), {});
  const jumped = f.now();
  await f.robot.selectBehavior('jump'); await f.robot.selectBehavior('bound'); await f.robot.enable();
  assert.equal(apiMessages(f, A.FrontJump).length, 1);
  assert.equal(apiMessages(f, A.FreeBound).length, 0);
  assert.equal(f.robot.status().enabled, false);
  await f.robot.disable();
  assert.ok(apiMessages(f, A.BalanceStand)[0].time - jumped >= 3300);
  assert.equal(f.robot.status().behavior, 'none');
});

test('missing foot-contact telemetry cannot qualify jump recovery as landed', async () => {
  const f = fixture('mcf', false, {noFeet:true}); await f.robot.selectBehavior('jump');
  await f.robot.disable();
  assert.equal(apiMessages(f, A.BalanceStand).length, 0);
  assert.equal(f.robot.status().behavior, 'jump');
  assert.match(f.robot.status().stopResult, /not confirmed/);
});

test('Backflip sends one SDK request and blocks other actions until grounded recovery', async () => {
  for (const mode of ['normal', 'mcf']) {
    const f = fixture(mode);
    await f.robot.selectBehavior('backflip');
    assert.equal(A.BackFlip, 2043);
    assert.equal(apiMessages(f, A.BackFlip).length, 1);
    assert.deepEqual(JSON.parse(apiMessages(f, A.BackFlip)[0].message.data.parameter), {});
    assert.equal(f.robot.status().behavior, 'backflip');
    const requested = f.now();
    await f.robot.selectBehavior('backflip');
    await f.robot.selectBehavior('jump');
    await f.robot.selectBehavior('bound');
    await f.robot.enable();
    assert.equal(apiMessages(f, A.BackFlip).length, 1);
    assert.equal(apiMessages(f, A.FrontJump).length, 0);
    assert.equal(apiMessages(f, A.FreeBound).length, 0);
    assert.equal(f.robot.status().enabled, false);
    await f.robot.disable();
    assert.ok(apiMessages(f, A.BalanceStand)[0].time - requested >= 3300);
    assert.equal(f.robot.status().behavior, 'none');
    assert.equal(f.robot.status().enabled, false);
  }
});

test('Backflip requires fresh stationary feedback and never treats missing contacts as landing', async () => {
  const stale = fixture(); stale.advance(1100);
  await stale.robot.selectBehavior('backflip');
  assert.equal(apiMessages(stale, A.BackFlip).length, 0);
  const low = fixture(); low.setHeight(.1);
  await low.robot.selectBehavior('backflip');
  assert.equal(apiMessages(low, A.BackFlip).length, 0);
  const f = fixture('mcf', false, {noFeet:true});
  await f.robot.selectBehavior('backflip');
  await f.robot.disable();
  assert.equal(apiMessages(f, A.BalanceStand).length, 0);
  assert.equal(f.robot.status().behavior, 'backflip');
  assert.equal(f.robot.status().recoveryRequired, true);
  assert.match(f.robot.status().stopResult, /foot-contact telemetry unavailable/);
});

test('rejected Backflip stays disarmed and cannot be retried automatically', async () => {
  const f = fixture('mcf', false, {rejectApi:A.BackFlip});
  await f.robot.selectBehavior('backflip');
  assert.equal(f.robot.status().behaviorConfirmed, false);
  assert.equal(f.robot.status().enabled, false);
  assert.match(f.robot.status().actionMessage, /rejected/);
  await f.robot.selectBehavior('backflip');
  await f.robot.enable();
  assert.equal(apiMessages(f, A.BackFlip).length, 1);
  assert.equal(f.robot.status().enabled, false);
});

test('external mode change during Pose stops posture streaming', async () => {
  const f = fixture('normal'); await f.robot.selectBehavior('pose'); f.setBehavior('pose');
  await f.robot.tick();
  assert.equal(f.robot.status().behaviorConfirmed, false);
  assert.equal(f.robot.status().enabled, false);
});

test('pose mapping is bounded, single-axis, and centers for all stop/unknown labels', () => {
  for (const [label, expected] of Object.entries({FORWARD:[0,.12,0], STRAFE_LEFT:[.12,0,0],
    STRAFE_RIGHT:[-.12,0,0], TURN_LEFT:[0,0,.15], TURN_RIGHT:[0,0,-.15],
    STOP:[0,0,0], UNKNOWN:[0,0,0], NO_HAND:[0,0,0], INVALID:[0,0,0]})) {
    assert.deepEqual(Array.from(gestureToPose(label)), expected);
  }
});

test('gesture pose respects post-enable hold and centers immediately on missing hand', async () => {
  const f = fixture(); f.input('FORWARD', [.5,0,0]); await f.robot.selectBehavior('pose');
  await f.robot.tick();
  assert.deepEqual(JSON.parse(apiMessages(f, A.Euler).at(-1).message.data.parameter), {x:0,y:0,z:0});
  f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  f.input('NO_HAND'); await f.robot.tick();
  assert.deepEqual(JSON.parse(apiMessages(f, A.Euler).at(-1).message.data.parameter), {x:0,y:0,z:0});
  assert.equal(f.robot.status().poseReady, true);
  assert.equal(apiMessages(f, A.Move).length, 0);
});

test('gesture pose cannot be entered without fresh hand tracking', async () => {
  const f = fixture(); f.robot.input = null; await f.robot.selectBehavior('pose');
  assert.equal(apiMessages(f, A.BalanceStand).length, 0);
  assert.equal(f.robot.status().poseReady, false);
  assert.match(f.robot.status().actionMessage, /fresh hand tracking/);
});

test('Stop during an asynchronous mode check cancels the pending action', async () => {
  const f = fixture();
  const transport = f.robot.send;
  let held;
  f.robot.send = message => {
    if (message.topic === T.MOTION_SWITCHER) held = message;
    else transport(message);
  };
  const selection = f.robot.selectBehavior('jump');
  for (let i = 0; i < 5 && !held; i++) await Promise.resolve();
  assert.ok(held);
  await f.robot.disable();
  transport(held); await selection;
  assert.equal(apiMessages(f, A.FrontJump).length, 0);
  assert.equal(f.robot.status().behavior, 'none');
});

test('a previously active robot pose is stopped before any navigation can be enabled', async () => {
  const f = fixture(); f.setBehavior('pose'); await f.robot.enable();
  assert.equal(f.robot.status().enabled, false);
  assert.equal(f.robot.status().behavior, 'pose');
  assert.equal(f.robot.status().behaviorConfirmed, false);
  assert.equal(apiMessages(f, A.Move).length, 0);
  await f.robot.disable();
  assert.equal(f.robot.status().behavior, 'none');
});

test('missing jump contacts ends stopping with an explicit recovery lock, without repeated stop traffic', async () => {
  const f = fixture('mcf', false, {noFeet:true}); await f.robot.selectBehavior('jump');
  const beforeWebcamLoss = f.messages.length;
  await f.robot.disableGestures('Webcam offline');
  assert.equal(f.messages.length, beforeWebcamLoss);
  await f.robot.disable();
  assert.equal(f.robot.status().stopping, false);
  assert.equal(f.robot.status().recoveryRequired, true);
  assert.match(f.robot.status().actionMessage, /foot-contact telemetry unavailable/);
  const before = f.messages.length;
  await f.robot.focusLost('Browser lost focus');
  await f.robot.disableGestures('Webcam offline');
  await f.robot.enable(); await f.robot.selectBehavior('bound');
  assert.equal(f.messages.length, before);
  assert.equal(f.robot.status().enabled, false);
});

test('operator-confirmed remote recovery checks new standing feedback without sending robot commands or enabling motion', async () => {
  const f = fixture('mcf', false, {noFeet:true}); await f.robot.selectBehavior('jump'); await f.robot.disable();
  const before = f.messages.length;
  await f.robot.confirmRemoteRecovery();
  assert.equal(f.messages.length, before);
  assert.equal(f.robot.status().recoveryRequired, false);
  assert.equal(f.robot.status().behavior, 'none');
  assert.equal(f.robot.status().enabled, false);
  assert.match(f.robot.status().actionMessage, /gesture control remains disabled/);
});

test('manual recovery cannot clear the lock with stale video or unchanged state samples', async () => {
  for (const staleVideo of [true, false]) {
    const f = fixture('mcf', false, {noFeet:true}); await f.robot.selectBehavior('jump'); await f.robot.disable();
    if (staleVideo) { f.advance(1100); f.feedback(); }
    else f.robot.sleep = async ms => f.advance(ms);
    const before = f.messages.length;
    await f.robot.confirmRemoteRecovery();
    assert.equal(f.messages.length, before);
    assert.equal(f.robot.status().recoveryRequired, true);
    assert.equal(f.robot.status().enabled, false);
    assert.match(f.robot.status().actionMessage, /not confirmed/);
  }
});

test('video and robot feedback freshness are reported independently', () => {
  const f = fixture(); f.advance(1001); f.feedback();
  assert.equal(f.robot.status().videoFresh, false);
  assert.equal(f.robot.status().feedbackFresh, true);
  f.robot.noteVideoFrame(); assert.equal(f.robot.status().videoFresh, true);
});

test('the Clemson BLE replacement opens no WebSockets and schedules no reconnects', () => {
  let sockets = 0, timers = 0;
  const {btBackend} = load(path.resolve(__dirname, '../overlay/bt-backend.ts'), {}, {
    WebSocket: class { constructor() { sockets++; } },
    location: {protocol:'http:', host:'127.0.0.1:5174'},
    setTimeout() { timers++; return 0; },
  });
  for (const topic of ['status','adapters','remote_state']) {
    const unsubscribe = btBackend().subscribe(topic, () => assert.fail('Unexpected Bluetooth data'));
    unsubscribe(); unsubscribe();
  }
  assert.equal(sockets, 0); assert.equal(timers, 0);
});
