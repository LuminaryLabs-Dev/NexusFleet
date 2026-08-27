export class TraceRecorder {
  constructor({ limit = 5_000 } = {}) { this.limit = limit; this.records = []; }
  record(at, type, target, payload = {}) {
    this.records.push({ at, type, target, payload: sanitize(payload) });
    this.records = this.records.slice(-this.limit);
  }
  clear() { this.records = []; }
  export(name = 'quest-twin-trace') { return { name, seed: 0, events: structuredClone(this.records) }; }
  snapshot() { return structuredClone(this.records); }
}

function sanitize(value, key = '') {
  if (/token|secret|password|authorization/i.test(key) || /^(?:path|file|apkPath|filePath|sourcePath|destinationPath)$/i.test(key)) return '[redacted]';
  if (Array.isArray(value)) return value.map(item => sanitize(item));
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([childKey, child]) => [childKey, sanitize(child, childKey)]));
  if (typeof value === 'string') return value.slice(0, 4_000);
  return value;
}
