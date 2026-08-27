import { dialog, ipcMain } from 'electron';
import { inspectApk } from '../../packages/adapters/local/apk-inspector.js';
import { validateApkPath, validateEndpoint, validatePackageName, validateSerial } from '../../packages/tooling/command-policy.js';

export function registerHandlers(runtime, windowProvider) {
  const handle = (channel, listener) => ipcMain.handle(channel, async (_event, ...args) => listener(...args));
  handle('runtime:status', () => runtime.status());
  handle('runtime:set-mode', mode => runtime.setMode(mode));
  handle('devices:list', () => runtime.listDevices());
  handle('devices:refresh', () => runtime.refreshDevices());
  handle('devices:inspect', serial => runtime.inspectDevice(validateSerial(serial)));
  handle('devices:add-simulated', count => runtime.addSimulated(validateCount(count)));
  handle('devices:deploy', serial => runtime.deploy(serial === undefined ? undefined : validateSerial(serial)));
  handle('devices:connect-wifi', endpoint => runtime.connectWifi(validateEndpoint(endpoint)));
  handle('devices:disconnect-wifi', endpoint => runtime.disconnectWifi(validateEndpoint(endpoint)));
  handle('apps:choose-apk', async () => {
    const result = await dialog.showOpenDialog(windowProvider(), { title: 'Choose a Quest APK', properties: ['openFile'], filters: [{ name: 'Android application', extensions: ['apk'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    return inspectApk(validateApkPath(result.filePaths[0]));
  });
  handle('apps:install', request => runtime.install(validateInstallRequest(request)));
  handle('apps:launch', request => runtime.launch(validatePackageRequest(request)));
  handle('apps:stop', request => runtime.stop(validatePackageRequest(request)));
  handle('apps:uninstall', request => runtime.uninstall(validatePackageRequest(request)));
  handle('diagnostics:info', serial => runtime.readInfo(validateSerial(serial)));
  handle('diagnostics:screenshot', async serial => ({ path: await runtime.screenshot(validateSerial(serial)) }));
  handle('diagnostics:logs', serial => runtime.readLogs(validateSerial(serial)));
  handle('diagnostics:sidecar', () => runtime.sidecarHealth());
  handle('jobs:list', () => runtime.jobs.list().map(publicJob));
  handle('jobs:cancel', id => runtime.jobs.cancel(validateId(id)));
  handle('jobs:retry', id => runtime.jobs.retry(validateId(id)));
}

function validateCount(value) { const count = Number(value ?? 1); if (!Number.isInteger(count) || count < 1 || count > 100) throw new Error('Simulation batch must contain 1–100 devices.'); return count; }
function validateId(value) { if (typeof value !== 'string' || !/^[a-f0-9-]{36}$/i.test(value)) throw new Error('Invalid job ID.'); return value; }
function validateInstallRequest(value) { if (!value || typeof value !== 'object') throw new Error('Invalid install request.'); return { serial: validateSerial(value.serial), apkPath: validateApkPath(value.apkPath), packageName: value.packageName }; }
function validatePackageRequest(value) { if (!value || typeof value !== 'object') throw new Error('Invalid package request.'); return { serial: validateSerial(value.serial), packageName: validatePackageName(value.packageName) }; }
function publicJob(job) { const { operation, dedupeKey, ...record } = job; return record; }
