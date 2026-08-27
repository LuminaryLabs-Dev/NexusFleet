import net from 'node:net';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';

export class QuestTwinClient {
  constructor({ socketPath, endpoint }) {
    this.socketPath = socketPath;
    this.endpoint = endpoint;
    this.socket = null;
    this.pending = new Map();
  }

  async connect({ timeoutMs = 3_000 } = {}) {
    if (this.socket && !this.socket.destroyed) return;
    const socket = this.endpoint ? net.createConnection(this.endpoint) : net.createConnection(this.socketPath);
    this.socket = socket;
    const lines = readline.createInterface({ input: socket });
    lines.on('line', line => this.#handleLine(line));
    lines.on('error', () => {});
    socket.once('close', () => this.#failPending(new Error('Quest Twin connection closed.')));
    socket.once('error', error => this.#failPending(error));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => { socket.destroy(); reject(new Error('Quest Twin connection timed out.')); }, timeoutMs);
      socket.once('connect', () => { clearTimeout(timer); resolve(); });
      socket.once('error', error => { clearTimeout(timer); reject(error); });
    });
  }

  async request(operation, payload = {}, { timeoutMs = 10_000 } = {}) {
    await this.connect();
    const id = randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Quest Twin ${operation} timed out.`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.write(`${JSON.stringify({ protocol: 1, id, operation, payload })}\n`);
    });
  }

  close() {
    this.socket?.destroy();
    this.socket = null;
  }

  #handleLine(line) {
    if (Buffer.byteLength(line) > 1024 * 1024) return;
    let message;
    try { message = JSON.parse(line); } catch { return; }
    const pending = this.pending.get(message.id);
    if (!pending) return;
    clearTimeout(pending.timer); this.pending.delete(message.id);
    if (message.ok) pending.resolve(message.result);
    else {
      const error = new Error(message.error || 'Quest Twin request failed.');
      error.code = message.code;
      pending.reject(error);
    }
  }

  #failPending(error) {
    for (const pending of this.pending.values()) { clearTimeout(pending.timer); pending.reject(error); }
    this.pending.clear();
    this.socket = null;
  }
}
