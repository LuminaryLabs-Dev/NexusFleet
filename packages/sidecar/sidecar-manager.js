import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

export class SidecarManager {
  constructor({ resourcesPath, repositoryRoot }) {
    this.resourcesPath = resourcesPath; this.repositoryRoot = repositoryRoot; this.child = null; this.pending = new Map(); this.bufferedErrors = [];
  }
  async health() {
    try { const result = await this.request('health', {}); return { available: true, message: result.message }; }
    catch (error) { return { available: false, message: error.message }; }
  }
  async request(operation, payload, { timeoutMs = 10_000 } = {}) {
    await this.#start();
    if (!['health', 'analyze-log', 'shutdown'].includes(operation)) throw new Error(`Unsupported sidecar operation: ${operation}`);
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error('Python sidecar timed out.')); }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.child.stdin.write(`${JSON.stringify({ protocol: 1, id, operation, payload })}\n`);
    });
  }
  async shutdown() {
    if (!this.child) return;
    try { await this.request('shutdown', {}, { timeoutMs: 2_000 }); } catch { /* force below */ }
    this.child?.kill(); this.child = null;
  }
  async #start() {
    if (this.child && !this.child.killed) return;
    const packaged = this.resourcesPath && path.join(this.resourcesPath, 'sidecars', process.platform === 'win32' ? 'nexusfleet-sidecar.exe' : 'nexusfleet-sidecar');
    const developmentModule = path.join(this.repositoryRoot, 'sidecars', 'python');
    const command = packaged && fs.existsSync(packaged) ? packaged : process.env.NEXUSFLEET_PYTHON || 'python3';
    const args = command === packaged ? [] : ['-m', 'nexusfleet_sidecar'];
    this.child = spawn(command, args, { cwd: developmentModule, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child.stderr.on('data', chunk => { this.bufferedErrors.push(chunk.toString('utf8')); this.bufferedErrors = this.bufferedErrors.slice(-20); });
    this.child.once('exit', () => {
      const message = this.bufferedErrors.join('').trim() || 'Python sidecar stopped.';
      for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(new Error(message)); }
      this.pending.clear(); this.child = null;
    });
    const lines = readline.createInterface({ input: this.child.stdout });
    lines.on('line', line => this.#handleLine(line));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Python sidecar did not start.')), 3_000);
      this.child.once('spawn', () => { clearTimeout(timer); resolve(); });
      this.child.once('error', error => { clearTimeout(timer); reject(new Error(`Python sidecar unavailable: ${error.message}`)); });
    });
  }
  #handleLine(line) {
    if (Buffer.byteLength(line) > 1024 * 1024) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    if (!message.id) return;
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(message.id);
    message.ok ? pending.resolve(message.result) : pending.reject(new Error(message.error || 'Sidecar operation failed.'));
  }
}
