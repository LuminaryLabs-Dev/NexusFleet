import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FleetEngine } from '../../src/core/fleet-engine.js';
import { ToolResolver } from '../tooling/tool-resolver.js';
import { AdbAdapter } from '../adapters/local/adb-adapter.js';
import { inspectApk } from '../adapters/local/apk-inspector.js';
import { JobQueue } from '../jobs/job-queue.js';
import { SidecarManager } from '../sidecar/sidecar-manager.js';
import { validatePackageName, validateSerial } from '../tooling/command-policy.js';
import { JsonStore } from '../storage/json-store.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export class RuntimeController {
  constructor({ resourcesPath, userDataPath }) {
    this.mode = 'simulation'; this.resourcesPath = resourcesPath; this.userDataPath = userDataPath;
    this.devices = new Map(); this.deviceListeners = new Set(); this.sequence = 0; this.adb = null; this.adbPath = null;
    this.jobs = new JobQueue({ concurrency: 4 });
    this.sidecar = new SidecarManager({ resourcesPath, repositoryRoot });
    this.store = new JsonStore(path.join(userDataPath, 'settings.json'), { mode: 'simulation' });
    this.engine = new FleetEngine({ seed: 42, failureRate: 0.03 });
    this.engine.onChange(() => this.#syncSimulation());
    for (let index = 0; index < 6; index += 1) this.#addSimulationDevice();
  }
  async initialize() {
    const settings = await this.store.load();
    if (['simulation', 'local', 'managed'].includes(settings.mode)) this.mode = settings.mode;
    if (this.mode === 'local') {
      try { await this.refreshDevices(); } catch { this.devices.clear(); }
    } else this.#syncSimulation();
  }
  subscribeDevices(listener) { this.deviceListeners.add(listener); return () => this.deviceListeners.delete(listener); }
  subscribeJobs(listener) { return this.jobs.subscribe(listener); }
  async status() {
    if (this.mode === 'simulation') return { mode: this.mode, ready: true, message: 'Simulation active', sidecarAvailable: false };
    if (this.mode === 'managed') return { mode: this.mode, ready: false, message: 'Managed fleet adapter is reserved for ArborXR/HMS integration.', sidecarAvailable: false };
    try { await this.#ensureAdb(); return { mode: this.mode, ready: true, message: `ADB ready (${this.adbPath.source})`, adbPath: this.adbPath.path, sidecarAvailable: false }; }
    catch (error) { return { mode: this.mode, ready: false, message: error.message, adbPath: null, sidecarAvailable: false }; }
  }
  async setMode(mode) {
    if (!['simulation', 'local', 'managed'].includes(mode)) throw new Error('Unsupported runtime mode.');
    this.mode = mode;
    await this.store.set('mode', mode);
    if (mode === 'simulation') this.#syncSimulation(); else this.devices.clear();
    if (mode === 'local') {
      try { await this.refreshDevices(); } catch { this.devices.clear(); this.#emitDevices(); }
    } else this.#emitDevices();
    return this.status();
  }
  async connectWifi(endpoint) { if (this.mode === 'simulation') return `Simulated Wi-Fi connection to ${endpoint}`; if (this.mode === 'managed') throw new Error('Managed fleet connection is not implemented.'); await this.#ensureAdb(); const result = await this.adb.connectWifi(endpoint); await this.refreshDevices(); return result; }
  async disconnectWifi(endpoint) { if (this.mode === 'simulation') return; if (this.mode === 'managed') throw new Error('Managed fleet connection is not implemented.'); await this.#ensureAdb(); await this.adb.disconnectWifi(endpoint); await this.refreshDevices(); }
  listDevices() { return structuredClone([...this.devices.values()]); }
  inspectDevice(serial) { validateSerial(serial); const device = this.devices.get(serial); if (!device) throw new Error(`Unknown device ${serial}`); return structuredClone(device); }
  async refreshDevices() {
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
  addSimulated(count = 1) {
    if (this.mode !== 'simulation') throw new Error('Switch to Simulation mode before adding virtual headsets.');
    for (let index = 0; index < count; index += 1) this.#addSimulationDevice();
    return this.listDevices();
  }
  deploy(serial) {
    const targets = serial ? [serial] : [...this.devices.keys()];
    if (this.mode === 'managed') throw new Error('Managed fleet deployment is not implemented.');
    return targets.map(target => this.jobs.enqueue({ type: 'deploy', serial: target, operation: async ({ update }) => {
      if (this.mode === 'simulation') { await this.engine.deploy(target, { delayMs: 90 }); return { message: 'Deployment complete' }; }
      update(0.3, 'Checking connection'); await this.adb.inspectDevice(target); update(1, 'Device verified'); return { message: 'Local deployment check complete' };
    }}));
  }
  async inspectApk(apkPath) { return inspectApk(apkPath); }
  install({ serial, apkPath, packageName }) {
    validateSerial(serial);
    if (this.mode === 'managed') throw new Error('Managed fleet installation is not implemented.');
    return this.jobs.enqueue({ type: 'install', serial, operation: async ({ signal, update }) => {
      update(0.1, 'Inspecting APK'); const metadata = await inspectApk(apkPath); update(0.25, 'Installing APK');
      if (this.mode === 'simulation') { const device = this.devices.get(serial); if (!device.packages.includes(metadata.packageName)) device.packages.push(metadata.packageName); this.#emitDevices(); }
      else { await this.#ensureAdb(); await this.adb.install(serial, apkPath, { signal }); await this.refreshDevices(); }
      return { message: `${metadata.packageName} installed`, packageName: metadata.packageName || packageName };
    }});
  }
  launch({ serial, packageName }) { return this.#packageJob('launch', serial, packageName, () => this.adb.launch(serial, packageName)); }
  stop({ serial, packageName }) { return this.#packageJob('stop', serial, packageName, () => this.adb.stop(serial, packageName)); }
  uninstall({ serial, packageName }) { return this.#packageJob('uninstall', serial, packageName, async () => { await this.adb.uninstall(serial, packageName); await this.refreshDevices(); }); }
  async readInfo(serial) {
    const device = this.inspectDevice(serial);
    if (this.mode === 'simulation') return `Serial: ${device.serial}\nModel: ${device.model}\nConnection: Simulation`;
    const details = await this.adb.inspectDevice(serial);
    return `Serial: ${details.serial}\nModel: ${details.model}\nOS: ${details.osVersion}\nBattery: ${details.battery ?? 'Unknown'}%`;
  }
  async readLogs(serial) { validateSerial(serial); return this.mode === 'simulation' ? [`${serial}: simulated log stream ready`, `${serial}: no physical headset changed`] : this.adb.readLogs(serial); }
  async screenshot(serial) { validateSerial(serial); return this.mode === 'simulation' ? `simulation://${serial}/screenshot.png` : this.adb.screenshotToTemp(serial); }
  sidecarHealth() { return this.sidecar.health(); }
  shutdown() { this.jobs.shutdown(); return this.sidecar.shutdown(); }
  async #ensureAdb() { if (this.adb) return; this.adbPath = await new ToolResolver({ resourcesPath: this.resourcesPath, allowSystemTools: true }).resolve('adb'); this.adb = new AdbAdapter({ executable: this.adbPath.path }); }
  #packageJob(type, serial, packageName, localOperation) {
    validateSerial(serial); validatePackageName(packageName);
    if (this.mode === 'managed') throw new Error('Managed fleet application operations are not implemented.');
    return this.jobs.enqueue({ type, serial, operation: async () => {
      if (this.mode !== 'simulation') { await this.#ensureAdb(); await localOperation(); }
      else if (type === 'uninstall') { const device = this.devices.get(serial); device.packages = device.packages.filter(value => value !== packageName); this.#emitDevices(); }
      return { message: `${packageName} ${type === 'uninstall' ? 'removed' : `${type}ed`}` };
    }});
  }
  #addSimulationDevice() { this.sequence += 1; this.engine.addDevice({ serial: `REBOOT-${String(this.sequence).padStart(4, '0')}`, model: this.sequence % 3 === 0 ? 'Quest 3' : 'Quest 3S' }); }
  #syncSimulation() {
    if (this.mode !== 'simulation') return;
    this.devices = new Map([...this.engine.devices.values()].map(device => [device.serial, {
      serial: device.serial, model: device.model, state: device.state, connectionState: 'simulated', connection: 'simulation', profile: 'Reboot Quest Kiosk', packages: [...device.packages], history: [...device.history], error: device.error
    }]));
    this.#emitDevices();
  }
  #emitDevices() { const snapshot = this.listDevices(); for (const listener of this.deviceListeners) listener(snapshot); }
}

function appendHistory(history = [], state) { return history.at(-1)?.state === state ? history : [...history, { state, at: Date.now() }].slice(-50); }
