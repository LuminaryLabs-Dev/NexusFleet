import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { RuntimeController } from '../packages/services/runtime-controller.js';

test('desktop runtime uses the supervised Quest Twin in simulation mode', async t => {
  const userDataPath = await fs.mkdtemp(path.join(os.tmpdir(), 'nexusfleet-runtime-test-'));
  const runtime = new RuntimeController({ resourcesPath: process.cwd(), userDataPath });
  t.after(() => runtime.shutdown());
  await runtime.initialize();
  assert.equal(runtime.listDevices().length, 6);
  await runtime.addSimulated(1);
  assert.equal(runtime.listDevices().length, 7);
  const status = await runtime.status();
  assert.equal(status.ready, true);
  assert.match(status.message, /Quest Device Twin/);
  assert.match(status.twinEndpoint, /^127\.0\.0\.1:\d+$/);
});
