import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { QuestTwin } from '../packages/simulator/quest-twin.js';
import { TraceReplayer } from '../packages/simulator/trace-replayer.js';
import { TraceRecorder } from '../packages/simulator/trace-recorder.js';
import { VirtualClock } from '../packages/simulator/virtual-clock.js';

const catalog = JSON.parse(await fs.readFile(new URL('../scenarios/quest/scenarios.json', import.meta.url), 'utf8'));

test('virtual clock runs ordered events deterministically', () => {
  const clock = new VirtualClock();
  const observed = [];
  clock.schedule(10, () => observed.push('second'), 'second');
  clock.schedule(5, () => observed.push('first'), 'first');
  clock.advance(10);
  assert.deepEqual(observed, ['first', 'second']);
  assert.equal(clock.now, 10);
});

test('scenario catalog contains 30 unique bounded Quest failure scenarios', () => {
  assert.equal(catalog.scenarios.length, 30);
  assert.equal(new Set(catalog.scenarios.map(value => value.name)).size, 30);
  for (const scenario of catalog.scenarios) {
    assert.ok(scenario.events.length > 0);
    assert.ok(scenario.events.length <= 10_000);
  }
});

test('Quest Twin replays USB authorization changes using virtual time', () => {
  const twin = new QuestTwin({ scenarios: catalog.scenarios });
  twin.start({ deviceCount: 1, seed: 42 });
  twin.loadScenario({ name: 'usb-authorization-flap' });
  assert.equal(twin.inspect().devices[0].connectionState, 'unauthorized');
  twin.step({ milliseconds: 4_000 });
  assert.equal(twin.inspect().devices[0].connectionState, 'absent');
  twin.step({ milliseconds: 5_000 });
  assert.equal(twin.inspect().devices[0].connectionState, 'device');
  assert.equal(twin.inspect().now, 9_000);
});

test('Quest Twin exposes allowlisted ADB operations and consumes one-shot faults', () => {
  const twin = new QuestTwin({ scenarios: catalog.scenarios });
  twin.start({ deviceCount: 1 });
  twin.injectFault({ serial: 'TWIN-0001', type: 'storage-full' });
  assert.throws(
    () => twin.adb({ command: 'install', serial: 'TWIN-0001', packageName: 'dev.luminarylabs.demo', apkPath: 'demo.apk' }),
    /INSUFFICIENT_STORAGE/
  );
  assert.doesNotThrow(() => twin.adb({ command: 'install', serial: 'TWIN-0001', packageName: 'dev.luminarylabs.demo', apkPath: 'demo.apk' }));
  assert.deepEqual(twin.adb({ command: 'pm-list-packages', serial: 'TWIN-0001' }), ['dev.luminarylabs.demo']);
  assert.throws(() => twin.adb({ command: 'shell', serial: 'TWIN-0001' }), /Unsupported virtual ADB command/);
});

test('Quest Twin seeded device generation and deployment timing are repeatable', () => {
  const run = seed => {
    const twin = new QuestTwin({ scenarios: catalog.scenarios });
    twin.start({ deviceCount: 8, seed });
    const models = twin.inspect().devices.map(device => device.model);
    twin.adb({ command: 'deploy', serial: 'TWIN-0001' });
    return { models, now: twin.inspect().now };
  };
  assert.deepEqual(run(712), run(712));
  assert.notDeepEqual(run(712), run(713));
});

test('sanitized traces can be converted into deterministic replay scenarios', () => {
  const scenario = TraceReplayer.toScenario({
    name: 'captured-session',
    seed: 9,
    events: [
      { at: 1000, type: 'adb.offline', target: 'TWIN-0001', payload: {} },
      { at: 1500, type: 'adb.daemon.ready', target: 'TWIN-0001', payload: {} }
    ]
  });
  assert.deepEqual(scenario.events.map(event => event.at), [0, 500]);
  assert.equal(scenario.name, 'captured-session-replay');
});

test('trace recorder bounds output and redacts credentials and local paths', () => {
  const recorder = new TraceRecorder({ limit: 2 });
  recorder.record(0, 'first', '*', { token: 'secret', apkPath: '/private/demo.apk' });
  recorder.record(1, 'second', '*', { value: 'safe' });
  recorder.record(2, 'third', '*', { password: 'secret' });
  const records = recorder.snapshot();
  assert.equal(records.length, 2);
  assert.equal(records[1].payload.password, '[redacted]');
  const pathRecorder = new TraceRecorder();
  pathRecorder.record(0, 'install', '*', { apkPath: '/private/demo.apk', profile: 'Quest Twin' });
  assert.equal(pathRecorder.snapshot()[0].payload.apkPath, '[redacted]');
  assert.equal(pathRecorder.snapshot()[0].payload.profile, 'Quest Twin');
});
