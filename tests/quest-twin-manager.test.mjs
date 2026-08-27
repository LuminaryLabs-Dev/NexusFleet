import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { QuestTwinManager } from '../packages/simulator/quest-twin-manager.js';
import { QuestTwinAdapter } from '../packages/adapters/simulated/quest-twin-adapter.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('supervised Quest Twin daemon restores deterministic state after a crash', async t => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nexusfleet-twin-test-'));
  const manager = new QuestTwinManager({ repositoryRoot, userDataPath });
  t.after(() => manager.shutdown());
  await manager.request('start', { deviceCount: 2, seed: 7 });
  await manager.request('load-scenario', { name: 'adb-offline-recovery' });
  await manager.request('step', { milliseconds: 5_000 });
  const priorPid = manager.child.pid;
  manager.child.kill('SIGKILL');
  await new Promise(resolve => setTimeout(resolve, 100));
  const restored = await manager.request('inspect');
  assert.notEqual(manager.child.pid, priorPid);
  assert.equal(restored.devices.length, 2);
  assert.equal(restored.devices[0].connectionState, 'device');
  assert.equal(restored.now, 5_000);
});

test('virtual ADB adapter matches NexusFleet device operation contract', async t => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nexusfleet-adapter-test-'));
  const manager = new QuestTwinManager({ repositoryRoot, userDataPath });
  const adapter = new QuestTwinAdapter({ client: manager });
  t.after(() => manager.shutdown());
  await adapter.start({ deviceCount: 1, seed: 3 });
  const devices = await adapter.listDevices();
  assert.equal(devices.length, 1);
  await adapter.install('TWIN-0001', 'reboot-demo.apk', { packageName: 'dev.luminarylabs.reboot' });
  await adapter.launch('TWIN-0001', 'dev.luminarylabs.reboot');
  assert.deepEqual(await adapter.listPackages('TWIN-0001'), ['dev.luminarylabs.reboot']);
  await adapter.stopPackage('TWIN-0001', 'dev.luminarylabs.reboot');
  await adapter.uninstall('TWIN-0001', 'dev.luminarylabs.reboot');
  assert.deepEqual(await adapter.listPackages('TWIN-0001'), []);
});
