import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('out');
assert.ok(fs.existsSync(path.join(out, 'index.html')), 'Next export must contain index.html');
assert.ok(fs.existsSync(path.resolve('desktop/preload.cjs')), 'Desktop preload must exist');
assert.ok(fs.existsSync(path.resolve('desktop/main.mjs')), 'Desktop main process must exist');
console.log('PASS: Next export and Electron entry points are staged');
