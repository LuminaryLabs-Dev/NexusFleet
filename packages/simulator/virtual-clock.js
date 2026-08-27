export class VirtualClock {
  constructor(startAt = 0) { this.reset(startAt); }

  reset(startAt = 0) {
    if (!Number.isFinite(startAt) || startAt < 0) throw new Error('Virtual clock start must be a non-negative number.');
    this.now = startAt;
    this.sequence = 0;
    this.queue = [];
  }

  schedule(at, handler, label = 'event') {
    if (!Number.isFinite(at) || at < this.now) throw new Error('Scheduled time cannot precede the virtual clock.');
    if (typeof handler !== 'function') throw new Error('Scheduled event requires a handler.');
    const record = { at, handler, label, sequence: this.sequence++ };
    this.queue.push(record);
    this.queue.sort((left, right) => left.at - right.at || left.sequence - right.sequence);
    return record.sequence;
  }

  advance(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) throw new Error('Virtual clock advance must be non-negative.');
    const target = this.now + milliseconds;
    const executed = [];
    while (this.queue.length && this.queue[0].at <= target) {
      const record = this.queue.shift();
      this.now = record.at;
      record.handler();
      executed.push({ at: record.at, label: record.label });
    }
    this.now = target;
    return executed;
  }

  snapshot() {
    return {
      now: this.now,
      pending: this.queue.map(({ at, label, sequence }) => ({ at, label, sequence }))
    };
  }
}
