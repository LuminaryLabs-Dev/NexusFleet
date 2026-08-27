import path from 'node:path';
import { validateEndpoint, validatePackageName, validateSerial } from '../../tooling/command-policy.js';

export class QuestTwinAdapter {
  constructor({ client }) { this.client = client; }
  start(options) { return this.client.request('start', options); }
  addDevices(count) { return this.client.request('add-devices', { count }); }
  loadScenario(name) { return this.client.request('load-scenario', { name }); }
  replayTrace(trace, options = {}) { return this.client.request('replay-trace', { trace, ...options }); }
  injectFault(fault) { return this.client.request('inject-fault', fault); }
  step(milliseconds) { return this.client.request('step', { milliseconds }); }
  inspect() { return this.client.request('inspect'); }
  stop() { return this.client.request('stop'); }

  listDevices() { return this.#adb('devices'); }
  async inspectDevice(serial) {
    validateSerial(serial);
    const state = await this.inspect();
    const device = state.devices.find(candidate => candidate.serial === serial);
    if (!device) throw new Error(`Unknown simulated device: ${serial}`);
    return { serial, model: device.model, osVersion: device.osVersion, battery: device.battery };
  }
  install(serial, apkPath, { packageName } = {}) {
    validateSerial(serial);
    return this.#adb('install', serial, { apkPath, packageName: packageName || packageFromPath(apkPath) });
  }
  uninstall(serial, packageName) { validateSerial(serial); validatePackageName(packageName); return this.#adb('uninstall', serial, { packageName }); }
  launch(serial, packageName) { validateSerial(serial); validatePackageName(packageName); return this.#adb('am-start', serial, { packageName }); }
  stopPackage(serial, packageName) { validateSerial(serial); validatePackageName(packageName); return this.#adb('am-force-stop', serial, { packageName }); }
  listPackages(serial) { validateSerial(serial); return this.#adb('pm-list-packages', serial); }
  reboot(serial, bootMs) { validateSerial(serial); return this.#adb('reboot', serial, { bootMs }); }
  readLogs(serial) { validateSerial(serial); return this.#adb('logcat', serial, { lines: 200 }); }
  screenshotToTemp(serial) { validateSerial(serial); return this.#adb('screencap', serial); }
  connectWifi(endpoint, serial) { validateEndpoint(endpoint); return this.#adb('connect', undefined, { endpoint, serial }); }
  disconnectWifi(endpoint) { validateEndpoint(endpoint); return this.#adb('disconnect', undefined, { endpoint }); }
  deploy(serial) { validateSerial(serial); return this.#adb('deploy', serial); }

  #adb(command, serial, payload = {}) { return this.client.request('adb', { command, serial, ...payload }); }
}

function packageFromPath(apkPath) {
  const base = path.basename(apkPath || 'simulated.app.apk').replace(/\.apk$/i, '').replace(/[^A-Za-z0-9_]/g, '_');
  return `dev.nexusfleet.${base || 'simulated'}`;
}
