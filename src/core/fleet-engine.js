import { DeviceState, VirtualDevice } from './device.js';

const PIPELINE = [
  DeviceState.WAITING_FOR_FASTBOOT,
  DeviceState.READY,
  DeviceState.META_ENROLLMENT,
  DeviceState.WAITING_FOR_BOOT,
  DeviceState.ADB_ONLINE,
  DeviceState.PROVISIONING,
  DeviceState.VERIFYING,
  DeviceState.COMPLETE
];

export class FleetEngine {
  constructor({ failureRate = 0, seed = 1 } = {}) {
    this.devices = new Map();
    this.failureRate = failureRate;
    this.seed = seed >>> 0;
    this.listeners = new Set();
  }
  addDevice(input) {
    const d = input instanceof VirtualDevice ? input : new VirtualDevice(input);
    if (this.devices.has(d.serial)) throw new Error(`Duplicate serial ${d.serial}`);
    this.devices.set(d.serial, d);
    this.#emit(d);
    return d;
  }
  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  async deploy(serial, { delayMs = 0 } = {}) {
    const d = this.devices.get(serial);
    if (!d) throw new Error(`Unknown device ${serial}`);
    d.error = null;
    try {
      for (const state of PIPELINE) {
        if (this.#random() < this.failureRate) throw new Error(`Simulated failure during ${state}`);
        if (delayMs) await new Promise(r => setTimeout(r, delayMs));
        d.transition(state);
        this.#emit(d);
      }
      return d;
    } catch (err) {
      d.error = err.message;
      d.transition(DeviceState.FAILED);
      this.#emit(d);
      return d;
    }
  }
  async deployAll({ concurrency = 64, delayMs = 0 } = {}) {
    const queue = [...this.devices.keys()];
    const workers = Array.from({ length: Math.min(concurrency, queue.length || 1) }, async () => {
      while (queue.length) {
        const serial = queue.shift();
        await this.deploy(serial, { delayMs });
      }
    });
    await Promise.all(workers);
    return this.summary();
  }
  retry(serial, opts) {
    const d = this.devices.get(serial);
    if (!d) throw new Error(`Unknown device ${serial}`);
    d.transition(DeviceState.DETECTED);
    return this.deploy(serial, opts);
  }
  summary() {
    const out = { total: this.devices.size, complete: 0, failed: 0, active: 0 };
    for (const d of this.devices.values()) {
      if (d.state === DeviceState.COMPLETE) out.complete++;
      else if (d.state === DeviceState.FAILED) out.failed++;
      else out.active++;
    }
    return out;
  }
  #emit(d) { for (const fn of this.listeners) fn(d, this.summary()); }
  #random() { this.seed = (1664525 * this.seed + 1013904223) >>> 0; return this.seed / 4294967296; }
}
