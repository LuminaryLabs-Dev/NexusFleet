import path from 'node:path';
import { DeviceStateMachine } from './device-state-machine.js';
import { FaultInjector, throwFault } from './fault-injector.js';
import { ScenarioEngine } from './scenario-engine.js';
import { TraceRecorder } from './trace-recorder.js';
import { TraceReplayer } from './trace-replayer.js';
import { VirtualClock } from './virtual-clock.js';

const ADB_COMMANDS = new Set([
  'devices', 'get-state', 'getprop', 'pm-list-packages', 'install', 'uninstall', 'am-start',
  'am-force-stop', 'logcat', 'screencap', 'reboot', 'tcpip', 'connect', 'disconnect', 'deploy'
]);
const DEPLOYMENT_PIPELINE = ['WAITING_FOR_FASTBOOT', 'READY', 'META_ENROLLMENT', 'WAITING_FOR_BOOT', 'ADB_ONLINE', 'PROVISIONING', 'VERIFYING', 'COMPLETE'];

export class QuestTwin {
  constructor({ scenarios = [] } = {}) {
    this.catalog = new Map(scenarios.map(scenario => [scenario.name, structuredClone(scenario)]));
    this.clock = new VirtualClock();
    this.faults = new FaultInjector();
    this.trace = new TraceRecorder();
    this.devices = new Map();
    this.sequence = 0;
    this.running = false;
    this.seed = 42;
    this.random = seededRandom(this.seed);
    this.provider = { state: 'available', error: null };
    this.scenarios = new ScenarioEngine({ clock: this.clock, applyEvent: event => this.#applyScenarioEvent(event) });
  }

  start({ deviceCount = 6, seed = 42 } = {}) {
    if (!Number.isInteger(deviceCount) || deviceCount < 0 || deviceCount > 5_000) throw new Error('Device count must be between 0 and 5,000.');
    if (!Number.isInteger(seed)) throw new Error('Quest Twin seed must be an integer.');
    this.clock.reset(0); this.faults.clear(); this.trace.clear(); this.devices.clear(); this.sequence = 0;
    this.#setSeed(seed); this.running = true; this.provider = { state: 'available', error: null };
    this.addDevices(deviceCount);
    this.trace.record(this.clock.now, 'twin.started', '*', { deviceCount, seed });
    return this.inspect();
  }

  addDevices(count = 1) {
    this.#requireRunning();
    if (!Number.isInteger(count) || count < 1 || count > 5_000 || this.devices.size + count > 5_000) throw new Error('Quest Twin supports at most 5,000 devices.');
    for (let index = 0; index < count; index += 1) {
      this.sequence += 1;
      const serial = `TWIN-${String(this.sequence).padStart(4, '0')}`;
      const model = this.random() < 0.34 ? 'Quest 3' : 'Quest 3S';
      this.devices.set(serial, new DeviceStateMachine({ serial, model, authorized: true, at: this.clock.now }));
      this.trace.record(this.clock.now, 'device.added', serial, { model });
    }
    return this.inspect();
  }

  loadScenario({ name, scenario } = {}) {
    this.#requireRunning();
    const selected = scenario || this.catalog.get(name);
    if (!selected) throw new Error(`Unknown Quest Twin scenario: ${name}`);
    this.#setSeed(selected.seed);
    const result = this.scenarios.load(selected);
    this.trace.record(this.clock.now, 'scenario.loaded', '*', { name: selected.name, seed: selected.seed });
    return { ...result, state: this.inspect() };
  }

  replayTrace({ trace, name, seed } = {}) {
    return this.loadScenario({ scenario: TraceReplayer.toScenario(trace, { name, seed }) });
  }

  injectFault(fault) {
    this.#requireRunning();
    if (fault.serial !== '*' && !this.devices.has(fault.serial)) throw new Error(`Unknown simulated device: ${fault.serial}`);
    const result = this.faults.inject(fault);
    this.trace.record(this.clock.now, 'fault.injected', fault.serial || '*', result);
    return result;
  }

  step({ milliseconds = 0 } = {}) {
    this.#requireRunning();
    const result = this.scenarios.step(milliseconds);
    this.trace.record(this.clock.now, 'clock.stepped', '*', { milliseconds, executed: result.executed.length });
    return { ...result, state: this.inspect() };
  }

  adb({ command, serial, ...payload }) {
    this.#requireRunning();
    if (!ADB_COMMANDS.has(command)) throw new Error(`Unsupported virtual ADB command: ${command}`);
    if (!['devices', 'connect', 'disconnect'].includes(command)) {
      throwFault(this.faults.consume(serial, ['adb-daemon-down', 'command-timeout']));
    }
    const result = this.#runAdb(command, serial, payload);
    this.trace.record(this.clock.now, `adb.${command}`, serial || '*', payload);
    return result;
  }

  inspect() {
    return {
      running: this.running,
      seed: this.seed,
      now: this.clock.now,
      devices: [...this.devices.values()].map(machine => machine.snapshot()),
      faults: this.faults.snapshot(),
      provider: structuredClone(this.provider),
      scenario: this.scenarios.snapshot(),
      trace: this.trace.snapshot()
    };
  }

  stop() {
    if (this.running) this.trace.record(this.clock.now, 'twin.stopped', '*');
    this.running = false;
    return { stopped: true };
  }

  #runAdb(command, serial, payload) {
    if (command === 'devices') {
      return [...this.devices.values()].map(machine => machine.snapshot()).filter(device => device.present).map(device => ({
        serial: device.serial, model: device.model, connectionState: device.connectionState, connection: device.connection
      }));
    }
    if (command === 'connect') return this.#connect(payload.endpoint, payload.serial);
    if (command === 'disconnect') return this.#disconnect(payload.endpoint);
    const machine = this.#requireDevice(serial);
    const device = machine.device;
    if (command === 'get-state') return device.connectionState;
    this.#requireOnline(device);
    switch (command) {
      case 'getprop': return this.#getProp(device, payload.property);
      case 'pm-list-packages': return structuredClone(device.packages);
      case 'install': {
        throwFault(this.faults.consume(serial, ['install-timeout', 'storage-full', 'incompatible-apk', 'signature-mismatch', 'version-downgrade']));
        const packageName = validatePackage(payload.packageName || path.basename(payload.apkPath || 'simulated.apk').replace(/\.apk$/i, ''));
        if (!device.packages.includes(packageName)) device.packages.push(packageName);
        machine.log('info', `Installed ${packageName}`, this.clock.now);
        return { message: 'Success', packageName };
      }
      case 'uninstall': {
        const packageName = validatePackage(payload.packageName);
        device.packages = device.packages.filter(value => value !== packageName);
        device.runningPackages = device.runningPackages.filter(value => value !== packageName);
        machine.log('info', `Uninstalled ${packageName}`, this.clock.now);
        return 'Success';
      }
      case 'am-start': {
        throwFault(this.faults.consume(serial, ['launch-failure']));
        const packageName = validatePackage(payload.packageName);
        if (!device.runningPackages.includes(packageName)) device.runningPackages.push(packageName);
        machine.log('info', `Started ${packageName}`, this.clock.now);
        return 'Starting: Intent';
      }
      case 'am-force-stop': {
        const packageName = validatePackage(payload.packageName);
        device.runningPackages = device.runningPackages.filter(value => value !== packageName);
        machine.log('info', `Stopped ${packageName}`, this.clock.now);
        return '';
      }
      case 'logcat': {
        throwFault(this.faults.consume(serial, ['log-overflow']));
        return device.logs.slice(-Math.min(Number(payload.lines) || 200, 500)).map(record => `${record.at} ${record.level.toUpperCase()} ${record.message}`);
      }
      case 'screencap': {
        throwFault(this.faults.consume(serial, ['screenshot-failure']));
        return `simulation://${serial}/screenshot-${this.clock.now}.png`;
      }
      case 'reboot': {
        machine.apply('device.reboot', {}, this.clock.now);
        const bootMs = boundedNumber(payload.bootMs ?? 3_000, 1, 300_000, 'Boot delay');
        this.clock.schedule(this.clock.now + bootMs, () => machine.apply('device.booted', {}, this.clock.now), `${serial}:device.booted`);
        return '';
      }
      case 'tcpip': {
        device.tcpPort = boundedNumber(payload.port ?? 5555, 1, 65_535, 'TCP port');
        return `restarting in TCP mode port: ${device.tcpPort}`;
      }
      case 'deploy': {
        for (const state of DEPLOYMENT_PIPELINE) {
          this.clock.advance(75 + Math.floor(this.random() * 31));
          machine.transition(state, this.clock.now);
        }
        machine.log('info', 'Deployment complete', this.clock.now);
        return { message: 'Deployment complete' };
      }
      default: throw new Error(`Unimplemented virtual ADB command: ${command}`);
    }
  }

  #applyScenarioEvent(event) {
    if (event.type.startsWith('fault.')) {
      this.injectFault({ serial: event.target, type: event.type.slice(6), ...(event.payload || {}) });
      return;
    }
    if (event.type.startsWith('managed.')) {
      const state = event.type.slice(8);
      this.provider = { state, error: event.payload?.message || null };
      this.trace.record(this.clock.now, event.type, event.target, event.payload);
      return;
    }
    if (event.type === 'device.add') {
      if (!this.devices.has(event.target)) this.devices.set(event.target, new DeviceStateMachine({ serial: event.target, ...(event.payload || {}), at: this.clock.now }));
      return;
    }
    if (event.type === 'serial.changed') {
      const machine = this.#requireDevice(event.target);
      const nextSerial = event.payload?.serial;
      if (!/^[A-Za-z0-9._:-]+$/.test(nextSerial || '') || this.devices.has(nextSerial)) throw new Error('Scenario serial change is invalid.');
      this.devices.delete(event.target); machine.device.serial = nextSerial; this.devices.set(nextSerial, machine);
      this.trace.record(this.clock.now, event.type, event.target, { serial: nextSerial });
      return;
    }
    const targets = event.target === '*' ? [...this.devices.values()] : [this.#deviceForScenario(event.target, event.payload)];
    for (const machine of targets) machine.apply(event.type, event.payload, this.clock.now);
    this.trace.record(this.clock.now, event.type, event.target, event.payload);
  }

  #deviceForScenario(serial, payload) {
    if (!this.devices.has(serial)) this.devices.set(serial, new DeviceStateMachine({ serial, model: payload?.model, authorized: false, at: this.clock.now }));
    return this.devices.get(serial);
  }

  #connect(endpoint, serial) {
    if (typeof endpoint !== 'string' || !/^[A-Za-z0-9.-]+:\d{1,5}$/.test(endpoint)) throw new Error('Invalid simulated Wi-Fi endpoint.');
    throwFault(this.faults.consume(serial || '*', ['wifi-drop', 'command-timeout']));
    const machine = serial ? this.#requireDevice(serial) : [...this.devices.values()][0];
    if (!machine) throw new Error('No simulated device is available for Wi-Fi connection.');
    machine.apply('wifi.connected', { endpoint }, this.clock.now);
    return `connected to ${endpoint}`;
  }

  #disconnect(endpoint) {
    const machine = [...this.devices.values()].find(candidate => candidate.device.endpoint === endpoint);
    if (machine) machine.apply('wifi.disconnected', {}, this.clock.now);
    return `disconnected ${endpoint}`;
  }

  #getProp(device, property) {
    const values = {
      'ro.product.model': device.model,
      'ro.build.version.release': device.osVersion,
      'ro.serialno': device.serial
    };
    if (!(property in values)) throw new Error(`Unsupported virtual getprop key: ${property}`);
    return values[property];
  }

  #requireDevice(serial) {
    const machine = this.devices.get(serial);
    if (!machine) throw new Error(`Unknown simulated device: ${serial}`);
    return machine;
  }
  #requireOnline(device) {
    if (!device.present) throw new Error(`Device ${device.serial} not found.`);
    if (device.connectionState !== 'device') throw new Error(`Device ${device.serial} is ${device.connectionState}.`);
  }
  #requireRunning() { if (!this.running) throw new Error('Quest Twin is not running.'); }
  #setSeed(seed) { this.seed = seed; this.random = seededRandom(seed); }
}

function validatePackage(value) {
  if (!/^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(value || '')) throw new Error('Invalid simulated Android package name.');
  return value;
}
function boundedNumber(value, minimum, maximum, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < minimum || number > maximum) throw new Error(`${label} is out of range.`);
  return number;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
