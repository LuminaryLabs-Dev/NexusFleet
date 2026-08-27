import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const out = path.resolve('out');
assert.ok(fs.existsSync(path.join(out, 'index.html')), 'Next export must contain index.html');
assert.ok(fs.existsSync(path.resolve('desktop/preload.cjs')), 'Desktop preload must exist');
assert.ok(fs.existsSync(path.resolve('desktop/main.mjs')), 'Desktop main process must exist');
assert.ok(fs.existsSync(path.resolve('desktop/static-server.mjs')), 'Desktop static server must exist');
assert.ok(fs.existsSync(path.resolve('packages/simulator/quest-twin-process.mjs')), 'Quest Twin process must exist');
assert.ok(fs.existsSync(path.resolve('packages/mcp/quest-twin-server.mjs')), 'Quest Twin MCP gateway must exist');
const scenarios = JSON.parse(fs.readFileSync(path.resolve('scenarios/quest/scenarios.json'), 'utf8'));
assert.equal(scenarios.scenarios.length, 30, 'Quest Twin must ship 30 initial scenarios');
assert.equal(new Set(scenarios.scenarios.map(scenario => scenario.name)).size, 30, 'Quest Twin scenario names must be unique');
console.log('PASS: Next export, Electron runtime, Quest Twin, MCP gateway, and 30 scenarios are staged');
