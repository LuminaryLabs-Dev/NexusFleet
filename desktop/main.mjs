import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { RuntimeController } from '../packages/services/runtime-controller.js';
import { registerHandlers } from './ipc/register-handlers.mjs';
import { startStaticServer } from './static-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
if (process.env.NEXUSFLEET_SMOKE === '1') app.setPath('userData', path.join(os.tmpdir(), `nexusfleet-smoke-${process.pid}`));
let window = null;
let runtime = null;
let staticServer = null;

function createWindow(productionUrl) {
  window = new BrowserWindow({
    width: 1320, height: 820, minWidth: 900, minHeight: 620, backgroundColor: '#f6f7f8', show: false,
    webPreferences: { preload: path.join(root, 'desktop', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.once('ready-to-show', () => window.show());
  if (process.env.NEXUSFLEET_SMOKE === '1') window.webContents.once('did-finish-load', () => void runSmoke(window));
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file:') && !url.startsWith('http://127.0.0.1:')) event.preventDefault(); });
  const developmentUrl = process.env.NEXUSFLEET_DEV_URL;
  void window.loadURL(developmentUrl || productionUrl);
}

await app.whenReady();
if (process.env.NEXUSFLEET_SMOKE === '1') console.log('SMOKE: Electron ready');
runtime = new RuntimeController({ resourcesPath: process.resourcesPath, userDataPath: app.getPath('userData') });
await runtime.initialize();
if (process.env.NEXUSFLEET_SMOKE === '1') console.log('SMOKE: Quest Device Twin ready');
staticServer = process.env.NEXUSFLEET_DEV_URL ? null : await startStaticServer({ root: path.join(root, 'out') });
if (process.env.NEXUSFLEET_SMOKE === '1') console.log(`SMOKE: static UI ${staticServer?.url}`);
registerHandlers(runtime, () => window);
runtime.subscribeDevices(value => window?.webContents.send('devices:changed', value));
runtime.subscribeJobs(value => window?.webContents.send('jobs:changed', value));
createWindow(staticServer?.url);

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(staticServer?.url); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', event => {
  if (!runtime || runtime.stopping) return;
  event.preventDefault(); runtime.stopping = true;
  void Promise.all([runtime.shutdown(), staticServer?.close()]).finally(() => { runtime = null; staticServer = null; app.quit(); });
});

async function runSmoke(targetWindow) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const result = await targetWindow.webContents.executeJavaScript(`({
      bridge: Boolean(window.nexusFleet),
      rows: document.querySelectorAll('.device-row').length,
      readyText: document.querySelector('.connection-note')?.textContent || ''
    })`);
    if (result.bridge && result.rows === 6 && /Quest Device Twin active/.test(result.readyText)) {
      console.log('PASS: Electron renderer hydrated with Quest Device Twin');
      await finishSmoke(0);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  console.error('FAIL: Electron renderer did not hydrate with Quest Device Twin');
  await finishSmoke(1);
}

async function finishSmoke(code) {
  await Promise.allSettled([runtime?.shutdown(), staticServer?.close()]);
  runtime = null;
  staticServer = null;
  app.exit(code);
}
