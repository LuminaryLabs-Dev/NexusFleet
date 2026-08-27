import fs from 'node:fs/promises';
import path from 'node:path';

export class JsonStore {
  constructor(filePath, defaults = {}) { this.filePath = filePath; this.defaults = defaults; this.data = structuredClone(defaults); }
  async load() {
    try { this.data = { ...structuredClone(this.defaults), ...JSON.parse(await fs.readFile(this.filePath, 'utf8')) }; }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    return this.data;
  }
  get(key) { return this.data[key]; }
  async set(key, value) { this.data[key] = value; await this.save(); return value; }
  async save() {
    await fs.mkdir(path.dirname(this.filePath), { recursive: true });
    const temporary = `${this.filePath}.tmp`;
    await fs.writeFile(temporary, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    await fs.rename(temporary, this.filePath);
  }
}
