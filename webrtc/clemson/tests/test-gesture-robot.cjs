// Run with the workspace Node runtime. No browser, credentials, or robot needed.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ui = path.resolve(__dirname, '../unitree_ui');
const ts = require(path.join(ui, 'node_modules/typescript'));
function load(filename, imports = {}) {
  const code = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}
  }).outputText;
  const exports = {};
  vm.runInNewContext(code, {exports, require: name => imports[name],
    setTimeout, clearTimeout, setInterval: () => 0, performance,
    document: {hidden: false, addEventListener() {}}, window: {addEventListener() {}}});
  return exports;
}
const topics = load(path.join(ui, 'src/protocol/topics.ts'));
const {GestureRobot, validVelocity} = load(path.resolve(__dirname, '../overlay/gesture-robot.ts'), {
  '../protocol/topics': topics,
  './session-recorder': {sessionRecorder:{robotMessage(){},attachCamera(){},detachCamera(){}}}
});
const {RTC_TOPIC: T, SPORT_CMD: A, DATA_CHANNEL_TYPE: D} = topics;

function fixture(mode = 'mcf', rejectStop = false, avoidanceOptions = {}) {
  let clock = 10000, frame = 1, height = .3;
  let avoidance = false;
  const messages = [];
  const robot = new GestureRobot(() => clock, async ms => { clock += ms; feedback(); robot.noteVideoFrame(); }, false);
  function feedback() { robot.receive({type: D.MSG, topic: T.LF_SPORT_MOD_STATE,
    data: {velocity: [0,0,0], yaw_speed: 0, body_height: height}}); }
  function input(label = 'STOP', velocity = [0,0,0], newFrame = true) {
    if (newFrame) frame++;
    robot.updateInput({fresh: true, label, frame_id: frame, age_ms: 0, supervised_velocity: velocity}, clock);
  }
  robot.bind(message => {
    messages.push({message, time: clock});
    if (message.type !== D.REQUEST) return;
    const api = message.data.header.identity.api_id;
    const avoidRequest = message.topic === T.OBSTACLES_AVOID;
    if (avoidRequest && api === 1001 && !avoidanceOptions.rejectSet && !avoidanceOptions.ignoreSet)
      avoidance = JSON.parse(message.data.parameter).enable;
    robot.receive({type: D.RESPONSE, topic: message.topic.replace(/request$/, 'response'),
      data: {header: {identity: message.data.header.identity, status: {code: (rejectStop && api === A.StopMove) || (avoidRequest && api === 1001 && avoidanceOptions.rejectSet) ? 1 : 0}},
        data: JSON.stringify(avoidRequest ? {enable: avoidance} : {name: mode})}});
  }, () => true);
  feedback(); robot.noteVideoFrame(); input();
  return {robot, messages, input, feedback, setHeight: v => {height = v; feedback();},
    advance: ms => {clock += ms;}, now: () => clock};
}
function apiMessages(f, api) { return f.messages.filter(x => x.message.data.header.identity.api_id === api); }

test('transport rejects mixed axes and speeds outside the agreed contract', () => {
  for (const v of [[.5,0,0], [1,0,0], [0,-.5,0], [0,0,-.8], [0,0,0]]) assert.equal(validVelocity(v), true);
  for (const v of [[.49,0,0], [0,.4,0], [.5,.5,0], [0,0,1.01], [NaN,0,0]]) assert.equal(validVelocity(v), false);
});
test('preview sends no robot requests until explicitly enabled', async () => {
  const f = fixture(); f.input('FORWARD', [.5,0,0]); await f.robot.tick();
  assert.equal(f.messages.length, 0);
  await f.robot.enable(); assert.equal(f.robot.status().enabled, false);
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
