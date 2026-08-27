import { spawn } from 'node:child_process';

export function runProcess(executable, args, { timeoutMs = 30_000, signal, maxBytes = 8 * 1024 * 1024 } = {}) {
  if (!Array.isArray(args) || args.some(value => typeof value !== 'string')) throw new Error('Process arguments must be strings.');
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = [];
    const stderr = [];
    let bytes = 0;
    let settled = false;

    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      error ? reject(error) : resolve(value);
    };
    const abort = () => { child.kill(); finish(new Error('Operation cancelled.')); };
    const collect = target => chunk => {
      bytes += chunk.length;
      if (bytes > maxBytes) { child.kill(); finish(new Error('Tool output exceeded the safety limit.')); return; }
      target.push(chunk);
    };
    const timer = setTimeout(() => { child.kill(); finish(new Error(`Tool timed out after ${timeoutMs}ms.`)); }, timeoutMs);
    timer.unref?.();
    signal?.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', collect(stdout));
    child.stderr.on('data', collect(stderr));
    child.once('error', error => finish(new Error(`Could not start ${executable}: ${error.message}`)));
    child.once('close', code => {
      const result = { code: code ?? -1, stdout: Buffer.concat(stdout), stderr: Buffer.concat(stderr) };
      if (code === 0) finish(null, result);
      else finish(new ToolExecutionError(executable, args, result));
    });
  });
}

export class ToolExecutionError extends Error {
  constructor(executable, args, result) {
    const detail = result.stderr.toString('utf8').trim() || result.stdout.toString('utf8').trim() || `exit ${result.code}`;
    super(`${executable} ${args[0] || ''} failed: ${detail}`);
    this.name = 'ToolExecutionError';
    this.code = result.code;
    this.stdout = result.stdout;
    this.stderr = result.stderr;
  }
}
