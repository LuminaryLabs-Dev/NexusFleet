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

test('job queue preserves cancellation while an adapter operation unwinds', async () => {
  const queue = new JobQueue({ concurrency: 1 });
  let release;
  const operationBlocked = new Promise(resolve => { release = resolve; });
  const running = new Promise(resolve => {
    const stop = queue.subscribe(jobs => {
      if (jobs[0]?.status === 'running') { stop(); resolve(jobs[0]); }
    });
  });
  const job = queue.enqueue({
    type: 'deploy', serial: 'TWIN-0001',
    operation: async ({ signal }) => { await operationBlocked; assert.equal(signal.aborted, true); return { message: 'late completion' }; }
  });
  await running;
  queue.cancel(job.id);
  release();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(queue.list()[0].status, 'cancelled');
});
