import { app, BrowserWindow, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RuntimeController } from '../packages/services/runtime-controller.js';
import { registerHandlers } from './ipc/register-handlers.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let window = null;
let runtime = null;

function createWindow() {
  window = new BrowserWindow({
    width: 1320, height: 820, minWidth: 900, minHeight: 620, backgroundColor: '#f6f7f8', show: false,
    webPreferences: { preload: path.join(root, 'desktop', 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  window.once('ready-to-show', () => window.show());
  if (process.env.NEXUSFLEET_SMOKE === '1') window.webContents.once('did-finish-load', () => { console.log('PASS: packaged Electron renderer loaded'); app.exit(0); });
  window.webContents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
  window.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('file:') && !url.startsWith('http://127.0.0.1:')) event.preventDefault(); });
  const developmentUrl = process.env.NEXUSFLEET_DEV_URL;
  if (developmentUrl) void window.loadURL(developmentUrl);
  else void window.loadFile(path.join(root, 'out', 'index.html'));
}

await app.whenReady();
runtime = new RuntimeController({ resourcesPath: process.resourcesPath, userDataPath: app.getPath('userData') });
await runtime.initialize();
registerHandlers(runtime, () => window);
runtime.subscribeDevices(value => window?.webContents.send('devices:changed', value));
runtime.subscribeJobs(value => window?.webContents.send('jobs:changed', value));
createWindow();

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', event => {
  if (!runtime || runtime.stopping) return;
  event.preventDefault(); runtime.stopping = true;
  void runtime.shutdown().finally(() => { runtime = null; app.quit(); });
});
