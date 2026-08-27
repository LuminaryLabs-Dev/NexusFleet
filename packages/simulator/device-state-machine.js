const CONNECTION_STATES = new Set(['absent', 'unauthorized', 'offline', 'device', 'recovery', 'fastboot']);

export class DeviceStateMachine {
  constructor({ serial, model = 'Quest 3S', authorized = true, connection = 'usb', at = 0 }) {
    if (!/^[A-Za-z0-9._:-]+$/.test(serial)) throw new Error('Invalid simulated serial.');
    this.device = {
      serial,
      model,
      osVersion: '12',
      battery: 100,
      present: true,
      authorized,
      booted: true,
      connection,
      connectionState: authorized ? 'device' : 'unauthorized',
      state: 'DETECTED',
      profile: 'Quest Twin',
      packages: [],
      runningPackages: [],
      history: [{ state: 'DETECTED', at }],
      logs: [{ at, level: 'info', message: 'Quest Twin initialized' }],
      tcpPort: null,
      endpoint: null,
      error: null
    };
  }

  apply(type, payload = {}, at = 0) {
    const device = this.device;
    switch (type) {
      case 'usb.connected':
        device.present = true; device.connection = 'usb'; device.authorized = payload.authorized ?? device.authorized;
        this.#connection(device.authorized ? 'device' : 'unauthorized', at); break;
      case 'usb.disconnected':
        device.present = false; this.#connection('absent', at); break;
      case 'adb.authorized':
        device.present = true; device.authorized = true; this.#connection('device', at); break;
      case 'adb.unauthorized':
      case 'adb.authorization.rejected':
        device.present = true; device.authorized = false; this.#connection('unauthorized', at); break;
      case 'adb.offline':
      case 'adb.daemon.restart':
        device.present = true; this.#connection('offline', at); break;
      case 'adb.daemon.ready':
        device.present = true; this.#connection(device.authorized ? 'device' : 'unauthorized', at); break;
      case 'recovery.entered':
        device.present = true; device.booted = false; this.#connection('recovery', at); break;
      case 'fastboot.entered':
        device.present = true; device.booted = false; this.#connection('fastboot', at); break;
      case 'device.reboot':
        device.present = true; device.booted = false; this.#connection('offline', at); break;
      case 'device.booted':
        device.present = true; device.booted = true; this.#connection(device.authorized ? 'device' : 'unauthorized', at); break;
      case 'wifi.connected':
        device.present = true; device.connection = 'wifi'; device.endpoint = payload.endpoint || device.endpoint;
        this.#connection(device.authorized ? 'device' : 'unauthorized', at); break;
      case 'wifi.disconnected':
        device.present = false; device.endpoint = null; this.#connection('absent', at); break;
      case 'battery.set':
        device.battery = clamp(Number(payload.level), 0, 100); this.#log('info', `Battery set to ${device.battery}%`, at); break;
      case 'app.crashed':
        if (payload.packageName) device.runningPackages = device.runningPackages.filter(value => value !== payload.packageName);
        device.error = payload.message || 'Application crashed'; this.#log('error', device.error, at); break;
      case 'device.error':
        device.error = payload.message || 'Simulated device error'; this.#log('error', device.error, at); break;
      default:
        throw new Error(`Unsupported simulated device event: ${type}`);
    }
    return this.snapshot();
  }

  transition(state, at) {
    if (this.device.state === state) return;
    this.device.state = state;
    this.device.history.push({ state, at });
    this.device.history = this.device.history.slice(-100);
  }

  log(level, message, at) { this.#log(level, message, at); }
  snapshot() { return structuredClone(this.device); }

  #connection(state, at) {
    if (!CONNECTION_STATES.has(state)) throw new Error(`Unsupported connection state: ${state}`);
    this.device.connectionState = state;
    this.transition(connectionToStage(state), at);
    this.#log('info', `Connection state: ${state}`, at);
  }

  #log(level, message, at) {
    this.device.logs.push({ at, level, message: String(message).slice(0, 2_000) });
    this.device.logs = this.device.logs.slice(-500);
  }
}

function connectionToStage(state) {
  if (state === 'device') return 'ADB_ONLINE';
  if (state === 'fastboot') return 'WAITING_FOR_FASTBOOT';
  if (state === 'recovery') return 'RECOVERY';
  return state.toUpperCase();
}

function clamp(value, minimum, maximum) {
  if (!Number.isFinite(value)) throw new Error('Battery level must be numeric.');
  return Math.max(minimum, Math.min(maximum, value));
}
