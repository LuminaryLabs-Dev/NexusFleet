import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ToolResolver } from '../tooling/tool-resolver.js';
import { AdbAdapter } from '../adapters/local/adb-adapter.js';
import { QuestTwinAdapter } from '../adapters/simulated/quest-twin-adapter.js';
import { inspectApk } from '../adapters/local/apk-inspector.js';
import { JobQueue } from '../jobs/job-queue.js';
import { SidecarManager } from '../sidecar/sidecar-manager.js';
import { validatePackageName, validateSerial } from '../tooling/command-policy.js';
import { JsonStore } from '../storage/json-store.js';
import { QuestTwinManager } from '../simulator/quest-twin-manager.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export class RuntimeController {
  constructor({ resourcesPath, userDataPath }) {
    this.mode = 'simulation'; this.resourcesPath = resourcesPath; this.userDataPath = userDataPath;
    this.devices = new Map(); this.deviceListeners = new Set(); this.adb = null; this.adbPath = null;
    this.jobs = new JobQueue({ concurrency: 4 });
    this.sidecar = new SidecarManager({ resourcesPath, repositoryRoot });
    this.store = new JsonStore(path.join(userDataPath, 'settings.json'), { mode: 'simulation' });
    this.twinManager = new QuestTwinManager({ repositoryRoot, userDataPath: path.join(userDataPath, 'quest-twin') });
    this.simulationAdb = new QuestTwinAdapter({ client: this.twinManager });
  }
  async initialize() {
    const settings = await this.store.load();
    if (['simulation', 'local', 'managed'].includes(settings.mode)) this.mode = settings.mode;
    if (this.mode === 'simulation') await this.#initializeSimulation();
    else if (this.mode === 'local') {
      try { await this.refreshDevices(); } catch { this.devices.clear(); }
    } else this.devices.clear();
  }
  subscribeDevices(listener) { this.deviceListeners.add(listener); return () => this.deviceListeners.delete(listener); }
  subscribeJobs(listener) { return this.jobs.subscribe(listener); }
  async status() {
    if (this.mode === 'simulation') {
      try {
        const health = await this.twinManager.health();
        const endpoint = this.twinManager.endpoint ? `${this.twinManager.endpoint.host}:${this.twinManager.endpoint.port}` : null;
        return { mode: this.mode, ready: true, message: 'Quest Device Twin active', twinEndpoint: endpoint, twinPid: health.pid, sidecarAvailable: false };
      } catch (error) {
        return { mode: this.mode, ready: false, message: error.message, twinEndpoint: null, sidecarAvailable: false };
      }
    }
    if (this.mode === 'managed') return { mode: this.mode, ready: false, message: 'Managed fleet adapter is reserved for ArborXR/HMS integration.', sidecarAvailable: false };
    try { await this.#ensureAdb(); return { mode: this.mode, ready: true, message: `ADB ready (${this.adbPath.source})`, adbPath: this.adbPath.path, sidecarAvailable: false }; }
    catch (error) { return { mode: this.mode, ready: false, message: error.message, adbPath: null, sidecarAvailable: false }; }
  }
  async setMode(mode) {
    if (!['simulation', 'local', 'managed'].includes(mode)) throw new Error('Unsupported runtime mode.');
    this.mode = mode;
    await this.store.set('mode', mode);
    if (mode === 'simulation') await this.#initializeSimulation();
    else this.devices.clear();
    if (mode === 'local') {
      try { await this.refreshDevices(); } catch { this.devices.clear(); this.#emitDevices(); }
    } else this.#emitDevices();
    return this.status();
  }
  async connectWifi(endpoint) {
    if (this.mode === 'managed') throw new Error('Managed fleet connection is not implemented.');
    if (this.mode === 'simulation') {
      const serial = this.devices.keys().next().value;
      const result = await this.simulationAdb.connectWifi(endpoint, serial);
      await this.#refreshSimulation();
      return result;
    }
    await this.#ensureAdb(); const result = await this.adb.connectWifi(endpoint); await this.refreshDevices(); return result;
  }
  async disconnectWifi(endpoint) {
    if (this.mode === 'managed') throw new Error('Managed fleet connection is not implemented.');
    if (this.mode === 'simulation') { await this.simulationAdb.disconnectWifi(endpoint); await this.#refreshSimulation(); return; }
    await this.#ensureAdb(); await this.adb.disconnectWifi(endpoint); await this.refreshDevices();
  }
  listDevices() { return structuredClone([...this.devices.values()]); }
  inspectDevice(serial) { validateSerial(serial); const device = this.devices.get(serial); if (!device) throw new Error(`Unknown device ${serial}`); return structuredClone(device); }
  async refreshDevices() {
    if (this.mode === 'simulation') return this.#refreshSimulation();
    if (this.mode !== 'local') return this.listDevices();
    await this.#ensureAdb();
    const found = await this.adb.listDevices();
    const next = new Map();
    for (const item of found) {
      const previous = this.devices.get(item.serial);
      let details = null; let packages = previous?.packages || [];
      if (item.connectionState === 'device') {
        try { [details, packages] = await Promise.all([this.adb.inspectDevice(item.serial), this.adb.listPackages(item.serial)]); } catch { /* connection state remains visible */ }
      }
      next.set(item.serial, {
        serial: item.serial, model: details?.model || item.model, state: item.connectionState === 'device' ? 'ADB_ONLINE' : item.connectionState.toUpperCase(),
        connectionState: item.connectionState, connection: item.connection, profile: previous?.profile || 'Local Quest', packages,
        history: appendHistory(previous?.history, item.connectionState === 'device' ? 'ADB_ONLINE' : item.connectionState.toUpperCase()), error: null
      });
    }
    this.devices = next; this.#emitDevices(); return this.listDevices();
  }
  async addSimulated(count = 1) {
    if (this.mode !== 'simulation') throw new Error('Switch to Simulation mode before adding virtual headsets.');
    await this.simulationAdb.addDevices(count);
    return this.#refreshSimulation();
  }
  deploy(serial) {
    const targets = serial ? [serial] : [...this.devices.keys()];
    if (this.mode === 'managed') throw new Error('Managed fleet deployment is not implemented.');
    return targets.map(target => this.jobs.enqueue({ type: 'deploy', serial: target, operation: async ({ update }) => {
      if (this.mode === 'simulation') {
        update(0.2, 'Running Quest Twin deployment');
        const result = await this.simulationAdb.deploy(target);
        await this.#refreshSimulation();
        update(1, result.message);
        return result;
      }
      update(0.3, 'Checking connection'); await this.adb.inspectDevice(target); update(1, 'Device verified'); return { message: 'Local deployment check complete' };
    }}));
  }
  async inspectApk(apkPath) { return inspectApk(apkPath); }
  install({ serial, apkPath, packageName }) {
    validateSerial(serial);
    if (this.mode === 'managed') throw new Error('Managed fleet installation is not implemented.');
    return this.jobs.enqueue({ type: 'install', serial, operation: async ({ signal, update }) => {
      update(0.1, 'Inspecting APK'); const metadata = await inspectApk(apkPath); update(0.25, 'Installing APK');
      if (this.mode === 'simulation') { await this.simulationAdb.install(serial, apkPath, { packageName: metadata.packageName }); await this.#refreshSimulation(); }
      else { await this.#ensureAdb(); await this.adb.install(serial, apkPath, { signal }); await this.refreshDevices(); }
      return { message: `${metadata.packageName} installed`, packageName: metadata.packageName || packageName };
    }});
  }
  launch({ serial, packageName }) { return this.#packageJob('launch', serial, packageName); }
  stop({ serial, packageName }) { return this.#packageJob('stop', serial, packageName); }
  uninstall({ serial, packageName }) { return this.#packageJob('uninstall', serial, packageName); }
  async readInfo(serial) {
    const device = this.inspectDevice(serial);
    if (this.mode === 'simulation') {
      const details = await this.simulationAdb.inspectDevice(serial);
      return `Serial: ${details.serial}\nModel: ${details.model}\nOS: ${details.osVersion}\nBattery: ${details.battery}%\nConnection: Quest Twin`;
    }
    const details = await this.adb.inspectDevice(serial);
    return `Serial: ${details.serial}\nModel: ${details.model}\nOS: ${details.osVersion}\nBattery: ${details.battery ?? 'Unknown'}%`;
  }
  async readLogs(serial) { validateSerial(serial); return this.mode === 'simulation' ? this.simulationAdb.readLogs(serial) : this.adb.readLogs(serial); }
  async screenshot(serial) { validateSerial(serial); return this.mode === 'simulation' ? this.simulationAdb.screenshotToTemp(serial) : this.adb.screenshotToTemp(serial); }
  sidecarHealth() { return this.sidecar.health(); }
  async shutdown() { this.jobs.shutdown(); await Promise.all([this.sidecar.shutdown(), this.twinManager.shutdown()]); }
  async #ensureAdb() { if (this.adb) return; this.adbPath = await new ToolResolver({ resourcesPath: this.resourcesPath, allowSystemTools: true }).resolve('adb'); this.adb = new AdbAdapter({ executable: this.adbPath.path }); }
  #packageJob(type, serial, packageName) {
    validateSerial(serial); validatePackageName(packageName);
    if (this.mode === 'managed') throw new Error('Managed fleet application operations are not implemented.');
    return this.jobs.enqueue({ type, serial, operation: async () => {
      if (this.mode === 'simulation') {
        const method = type === 'stop' ? 'stopPackage' : type;
        await this.simulationAdb[method](serial, packageName);
        await this.#refreshSimulation();
      } else {
        await this.#ensureAdb();
        await this.adb[type](serial, packageName);
        if (type === 'uninstall') await this.refreshDevices();
      }
      return { message: `${packageName} ${type === 'uninstall' ? 'removed' : `${type}ed`}` };
    }});
  }
  async #initializeSimulation() { await this.simulationAdb.start({ deviceCount: 6, seed: 42 }); await this.#refreshSimulation(); }
  async #refreshSimulation() {
    const snapshot = await this.simulationAdb.inspect();
    this.devices = new Map(snapshot.devices.map(device => [device.serial, {
      serial: device.serial,
      model: device.model,
      state: device.state,
      connectionState: device.connectionState,
      connection: device.connection,
      profile: device.profile,
      packages: [...device.packages],
      history: [...device.history],
      battery: device.battery,
      error: device.error
    }]));
    this.#emitDevices();
    return this.listDevices();
  }
  #emitDevices() { const snapshot = this.listDevices(); for (const listener of this.deviceListeners) listener(snapshot); }
}

function appendHistory(history = [], state) { return history.at(-1)?.state === state ? history : [...history, { state, at: Date.now() }].slice(-50); }
