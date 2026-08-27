import test from 'node:test';
import assert from 'node:assert/strict';
import { JobQueue } from '../packages/jobs/job-queue.js';

test('job queue deduplicates active device operations and completes them', async () => {
  const queue = new JobQueue({ concurrency: 2 });
  const done = new Promise(resolve => {
    const stop = queue.subscribe(jobs => {
      if (jobs[0]?.status === 'completed') { stop(); resolve(); }
    });
  });
  const first = queue.enqueue({ type: 'install', serial: 'Q-1', operation: async () => ({ message: 'Installed' }) });
  const duplicate = queue.enqueue({ type: 'install', serial: 'Q-1', operation: async () => ({ message: 'Should not run' }) });
  assert.equal(first.id, duplicate.id);
  await done;
  assert.equal(queue.list()[0].status, 'completed');
});
