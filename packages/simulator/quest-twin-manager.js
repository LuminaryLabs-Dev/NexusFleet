import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { QuestTwinClient } from './quest-twin-client.js';

const OPERATIONS = new Set(['health', 'start', 'add-devices', 'load-scenario', 'replay-trace', 'inject-fault', 'step', 'inspect', 'adb', 'stop']);

export class QuestTwinManager {
  constructor({ repositoryRoot, userDataPath, maxRestarts = 3 }) {
    this.repositoryRoot = repositoryRoot;
    this.userDataPath = userDataPath;
    this.maxRestarts = maxRestarts;
    this.restartCount = 0;
    this.child = null;
    this.client = null;
    this.stopping = false;
    this.errors = [];
    this.endpoint = null;
    this.replayLog = [];
    this.needsRestore = false;
  }

  async request(operation, payload = {}, options) {
    if (!OPERATIONS.has(operation)) throw new Error(`Unsupported Quest Twin manager operation: ${operation}`);
    await this.#start();
    if (this.needsRestore) { await this.#restore(); this.needsRestore = false; }
    try {
      const result = await this.client.request(operation, payload, options);
      this.#record(operation, payload);
      return result;
    }
    catch (error) {
      if (this.stopping || this.restartCount >= this.maxRestarts) throw error;
      this.restartCount += 1;
      await this.#resetChild();
      await this.#start();
      await this.#restore();
      this.needsRestore = false;
      const result = await this.client.request(operation, payload, options);
      this.#record(operation, payload);
      return result;
    }
  }

  health() { return this.request('health'); }

  async shutdown() {
    this.stopping = true;
    if (this.client) {
      try { await this.client.request('shutdown', {}, { timeoutMs: 1_000 }); } catch { /* force below */ }
      this.client.close();
    }
    if (this.child && !this.child.killed) this.child.kill();
    await this.#resetChild();
  }

  async #start() {
    if (this.child && !this.child.killed && this.client) return;
    if (this.stopping) throw new Error('Quest Twin manager is stopping.');
    await fs.mkdir(this.userDataPath, { recursive: true });
    const entry = path.join(this.repositoryRoot, 'packages', 'simulator', 'quest-twin-process.mjs');
    const environment = { ...process.env };
    if (process.versions.electron) environment.ELECTRON_RUN_AS_NODE = '1';
    const workingDirectory = this.repositoryRoot.endsWith('.asar') ? path.dirname(this.repositoryRoot) : this.repositoryRoot;
    const child = spawn(process.execPath, [entry, '--port', '0'], {
      cwd: workingDirectory,
      env: environment,
      shell: false,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.child = child;
    child.stderr.on('data', chunk => {
      this.errors.push(chunk.toString('utf8'));
      this.errors = this.errors.slice(-20);
    });
    child.once('exit', () => {
      if (this.child !== child) return;
      this.client?.close();
      this.client = null;
      this.child = null;
      this.endpoint = null;
      if (!this.stopping && this.replayLog.length) this.needsRestore = true;
    });
    await waitForSpawn(child);
    this.endpoint = await waitForReady(child);
    this.client = new QuestTwinClient({ endpoint: this.endpoint });
    await connectWithRetry(this.client);
  }

  async #resetChild() {
    if (!this.stopping && this.replayLog.length) this.needsRestore = true;
    this.client?.close(); this.client = null;
    if (this.child && !this.child.killed) this.child.kill();
    this.child = null;
    this.endpoint = null;
    await new Promise(resolve => setTimeout(resolve, 25));
  }

  #record(operation, payload) {
    if (['health', 'inspect'].includes(operation)) return;
    const record = { operation, payload: structuredClone(payload) };
    if (operation === 'start') this.replayLog = [record];
    else {
      this.replayLog.push(record);
      this.replayLog = this.replayLog.slice(-2_000);
    }
  }

  async #restore() {
    for (const record of this.replayLog) await this.client.request(record.operation, record.payload);
  }
}

function waitForSpawn(child) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Quest Twin process did not start.')), 3_000);
    child.once('spawn', () => { clearTimeout(timer); resolve(); });
    child.once('error', error => { clearTimeout(timer); reject(error); });
  });
}

function waitForReady(child) {
  return new Promise((resolve, reject) => {
    const lines = readline.createInterface({ input: child.stdout });
    const timer = setTimeout(() => { lines.close(); reject(new Error('Quest Twin did not publish its endpoint.')); }, 3_000);
    lines.once('line', line => {
      clearTimeout(timer); lines.close();
      try {
        const message = JSON.parse(line);
        if (!message.ready || message.host !== '127.0.0.1' || !Number.isInteger(message.port)) throw new Error('Invalid ready message.');
        resolve({ host: message.host, port: message.port });
      } catch (error) { reject(new Error(`Quest Twin ready message failed: ${error.message}`)); }
    });
  });
}

async function connectWithRetry(client) {
  let lastError;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try { await client.connect({ timeoutMs: 250 }); return; }
    catch (error) { lastError = error; await new Promise(resolve => setTimeout(resolve, 50)); }
  }
  throw new Error(`Quest Twin socket unavailable: ${lastError?.message || 'unknown error'}`);
}
