import { validateScenario } from './scenario-engine.js';

export class TraceReplayer {
  static toScenario(trace, { name = `${trace?.name || 'quest-trace'}-replay`, seed = trace?.seed ?? 0 } = {}) {
    const firstAt = trace?.events?.[0]?.at || 0;
    const scenario = {
      name: normalizeName(name),
      seed,
      events: (trace?.events || []).map(event => ({
        at: Math.max(0, Number(event.at) - firstAt),
        type: event.type,
        target: event.target,
        payload: structuredClone(event.payload || {})
      }))
    };
    return validateScenario(scenario);
  }
}

function normalizeName(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'quest-trace-replay';
}
