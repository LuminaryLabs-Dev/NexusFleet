export class ScenarioEngine {
  constructor({ clock, applyEvent }) {
    this.clock = clock;
    this.applyEvent = applyEvent;
    this.current = null;
  }

  load(scenario) {
    validateScenario(scenario);
    this.clock.reset(0);
    this.current = structuredClone(scenario);
    for (const event of scenario.events) {
      this.clock.schedule(event.at, () => this.applyEvent(event), `${scenario.name}:${event.type}`);
    }
    this.clock.advance(0);
    return this.snapshot();
  }

  step(milliseconds) {
    const executed = this.clock.advance(milliseconds);
    return { ...this.snapshot(), executed };
  }

  snapshot() {
    return {
      name: this.current?.name || null,
      seed: this.current?.seed ?? null,
      clock: this.clock.snapshot()
    };
  }
}

export function validateScenario(scenario) {
  if (!scenario || typeof scenario !== 'object') throw new Error('Scenario must be an object.');
  if (!/^[a-z0-9][a-z0-9-]{1,79}$/.test(scenario.name || '')) throw new Error('Scenario name must use lowercase kebab-case.');
  if (!Number.isInteger(scenario.seed)) throw new Error('Scenario seed must be an integer.');
  if (!Array.isArray(scenario.events) || scenario.events.length > 10_000) throw new Error('Scenario events must be a bounded array.');
  let prior = -1;
  for (const event of scenario.events) {
    if (!Number.isFinite(event.at) || event.at < prior) throw new Error('Scenario events must be ordered by non-negative time.');
    if (!/^[a-z][a-z0-9.-]+$/.test(event.type || '')) throw new Error('Scenario event type is invalid.');
    if (typeof event.target !== 'string' || !event.target) throw new Error('Scenario event requires a target.');
    prior = event.at;
  }
  return scenario;
}
