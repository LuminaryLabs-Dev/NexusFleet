import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { QuestTwin } from './quest-twin.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const catalogPath = path.join(root, 'scenarios', 'quest', 'scenarios.json');
const catalog = JSON.parse(await fs.readFile(catalogPath, 'utf8'));
const twin = new QuestTwin({ scenarios: catalog.scenarios });
const socketPath = readArgument('--socket');
const portArgument = readArgument('--port');
let server = null;
let shuttingDown = false;

if (socketPath) {
  if (process.platform !== 'win32') await fs.unlink(socketPath).catch(error => { if (error.code !== 'ENOENT') throw error; });
  await fs.mkdir(path.dirname(socketPath), { recursive: true });
  server = net.createServer(socket => attach(socket, socket));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(socketPath, resolve);
  });
} else if (portArgument !== null) {
  const port = Number(portArgument);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('Quest Twin port is invalid.');
  server = net.createServer(socket => attach(socket, socket));
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', resolve);
  });
  process.stdout.write(`${JSON.stringify({ ready: true, host: '127.0.0.1', port: server.address().port })}\n`);
}

if (!socketPath && portArgument === null) attach(process.stdin, process.stdout);
process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

function attach(input, output) {
  const lines = readline.createInterface({ input });
  lines.on('line', line => void handleLine(line, output));
}

async function handleLine(line, output) {
  if (Buffer.byteLength(line) > 1024 * 1024) return;
  let request;
  try { request = JSON.parse(line); } catch { return; }
  if (request?.protocol !== 1 || typeof request.id !== 'string') return;
  try {
    const result = await execute(request.operation, request.payload || {});
    output.write(`${JSON.stringify({ protocol: 1, id: request.id, ok: true, result })}\n`);
    if (request.operation === 'shutdown') setImmediate(() => void shutdown());
  } catch (error) {
    output.write(`${JSON.stringify({ protocol: 1, id: request.id, ok: false, error: error.message, code: error.code || 'QUEST_TWIN_ERROR' })}\n`);
  }
}

function execute(operation, payload) {
  switch (operation) {
    case 'health': return { message: 'Quest Twin ready', running: twin.running, pid: process.pid };
    case 'start': return twin.start(payload);
    case 'add-devices': return twin.addDevices(payload.count);
    case 'load-scenario': return twin.loadScenario(payload);
    case 'replay-trace': return twin.replayTrace(payload);
    case 'inject-fault': return twin.injectFault(payload);
    case 'step': return twin.step(payload);
    case 'inspect': return twin.inspect();
    case 'adb': return twin.adb(payload);
    case 'stop': return twin.stop();
    case 'shutdown': return { shuttingDown: true };
    default: throw new Error(`Unsupported Quest Twin operation: ${operation}`);
  }
}

async function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  twin.stop();
  await new Promise(resolve => server ? server.close(resolve) : resolve());
  if (socketPath && process.platform !== 'win32') await fs.unlink(socketPath).catch(() => {});
  process.exit(0);
}

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}
