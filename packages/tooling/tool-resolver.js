import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runProcess } from './process-runner.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

export class ToolResolver {
  constructor({ resourcesPath, allowSystemTools = true } = {}) {
    this.resourcesPath = resourcesPath;
    this.allowSystemTools = allowSystemTools;
  }

  async resolve(name) {
    if (!['adb', 'fastboot'].includes(name)) throw new Error(`Unsupported platform tool: ${name}`);
    const executable = process.platform === 'win32' ? `${name}.exe` : name;
    const platformDirectory = `${process.platform}-${process.arch}`;
    const candidates = [
      this.resourcesPath && path.join(this.resourcesPath, 'platform-tools', platformDirectory, executable),
      path.join(repositoryRoot, 'resources', 'platform-tools', platformDirectory, executable)
    ].filter(Boolean);
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) return { path: candidate, source: 'bundled' };
    }
    if (this.allowSystemTools) {
      try {
        const result = await runProcess(executable, ['version'], { timeoutMs: 5_000, maxBytes: 128 * 1024 });
        if (result.stdout.length || result.stderr.length) return { path: executable, source: 'system' };
      } catch { /* reported below */ }
    }
    throw new Error(`${name} is not available. Add the platform tools bundle or enable a verified system installation.`);
  }
}
