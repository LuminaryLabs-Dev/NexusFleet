import fs from 'node:fs';
import path from 'node:path';

const output = path.resolve(process.cwd(), 'out');
const relative = path.relative(process.cwd(), output);
if (relative !== 'out') throw new Error(`Refusing to clean unexpected path: ${output}`);
fs.rmSync(output, { recursive: true, force: true });
