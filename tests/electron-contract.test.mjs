import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Electron renderer boundary stays isolated and exposes no raw command channel', () => {
  const main = fs.readFileSync(new URL('../desktop/main.mjs', import.meta.url), 'utf8');
  const preload = fs.readFileSync(new URL('../desktop/preload.cjs', import.meta.url), 'utf8');
  assert.match(main, /contextIsolation:\s*true/);
  assert.match(main, /nodeIntegration:\s*false/);
  assert.match(main, /sandbox:\s*true/);
  assert.doesNotMatch(preload, /child_process|exec\(|spawn\(/);
  assert.doesNotMatch(preload, /runCommand|rawCommand|shellCommand/);
});
