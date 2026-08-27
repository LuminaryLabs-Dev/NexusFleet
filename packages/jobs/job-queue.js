import { randomUUID } from 'node:crypto';

export class JobQueue {
  constructor({ concurrency = 4 } = {}) {
    this.concurrency = concurrency;
    this.jobs = [];
    this.pending = [];
    this.active = 0;
    this.deviceLocks = new Set();
    this.controllers = new Map();
    this.listeners = new Set();
  }

  subscribe(listener) { this.listeners.add(listener); return () => this.listeners.delete(listener); }
  list() { return this.jobs.map(job => this.#public(job)); }

  enqueue({ type, serial, operation, dedupeKey = `${type}:${serial}` }) {
    const duplicate = this.jobs.find(job => job.dedupeKey === dedupeKey && ['queued', 'running'].includes(job.status));
    if (duplicate) return this.#public(duplicate);
    const job = { id: randomUUID(), type, serial, status: 'queued', progress: 0, message: 'Queued', createdAt: Date.now(), dedupeKey, operation };
    this.jobs.unshift(job); this.pending.push(job); this.#emit(); this.#drain(); return this.#public(job);
  }

  cancel(jobId) {
    const job = this.jobs.find(candidate => candidate.id === jobId);
    if (!job || !['queued', 'running'].includes(job.status)) return;
    job.status = 'cancelled'; job.message = 'Cancelled'; job.completedAt = Date.now();
    this.controllers.get(job.id)?.abort(); this.#emit();
  }

  retry(jobId) {
    const prior = this.jobs.find(candidate => candidate.id === jobId);
    if (!prior) throw new Error(`Unknown job ${jobId}`);
    return this.enqueue({ type: prior.type, serial: prior.serial, operation: prior.operation, dedupeKey: `${prior.dedupeKey}:retry:${Date.now()}` });
  }

  shutdown() { for (const controller of this.controllers.values()) controller.abort(); }

  #drain() {
    while (this.active < this.concurrency) {
      const index = this.pending.findIndex(job => job.status === 'queued' && !this.deviceLocks.has(job.serial));
      if (index < 0) return;
      const [job] = this.pending.splice(index, 1);
      void this.#run(job);
    }
  }

  async #run(job) {
    this.active += 1; this.deviceLocks.add(job.serial);
    const controller = new AbortController(); this.controllers.set(job.id, controller);
    job.status = 'running'; job.message = 'Running'; this.#emit();
    try {
      const result = await job.operation({ signal: controller.signal, update: (progress, message) => { job.progress = progress; if (message) job.message = message; this.#emit(); } });
      if (job.status !== 'cancelled') { job.status = 'completed'; job.progress = 1; job.message = result?.message || 'Complete'; job.result = result; job.completedAt = Date.now(); }
    } catch (error) {
      if (job.status !== 'cancelled') { job.status = 'failed'; job.message = error instanceof Error ? error.message : String(error); job.completedAt = Date.now(); }
    } finally {
      this.active -= 1; this.deviceLocks.delete(job.serial); this.controllers.delete(job.id); this.#emit(); this.#drain();
    }
  }

  #public(job) { const { operation, dedupeKey, ...record } = job; return structuredClone(record); }
  #emit() { const snapshot = this.list(); for (const listener of this.listeners) listener(snapshot); }
}
