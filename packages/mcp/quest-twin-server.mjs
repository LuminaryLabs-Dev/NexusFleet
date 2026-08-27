#!/usr/bin/env node
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { QuestTwinClient } from '../simulator/quest-twin-client.js';
import { QuestTwinManager } from '../simulator/quest-twin-manager.js';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const configuredEndpoint = parseEndpoint(process.env.NEXUSFLEET_TWIN_ENDPOINT);
const manager = configuredEndpoint ? null : new QuestTwinManager({
  repositoryRoot,
  userDataPath: path.join(os.tmpdir(), `nexusfleet-mcp-${process.pid}`)
});
const client = configuredEndpoint ? new QuestTwinClient({ endpoint: configuredEndpoint }) : manager;

const server = new McpServer({ name: 'nexusfleet-quest-twin', version: '0.2.0' });

server.registerTool('quest_sim_start', {
  description: 'Start or reset a deterministic Quest Device Twin session.',
  inputSchema: {
    deviceCount: z.number().int().min(0).max(5000).default(6),
    seed: z.number().int().default(42)
  }
}, async input => result(await client.request('start', input)));

server.registerTool('quest_sim_load_scenario', {
  description: 'Load one of the bounded Quest connection or failure scenarios.',
  inputSchema: { name: z.string().regex(/^[a-z0-9][a-z0-9-]{1,79}$/) }
}, async input => result(await client.request('load-scenario', input)));

server.registerTool('quest_sim_inject_fault', {
  description: 'Inject one allowlisted fault into a simulated headset or the whole fleet.',
  inputSchema: {
    serial: z.string().default('*'),
    type: z.enum([
      'adb-daemon-down', 'command-timeout', 'install-timeout', 'storage-full', 'incompatible-apk',
      'signature-mismatch', 'version-downgrade', 'launch-failure', 'screenshot-failure', 'log-overflow',
      'wifi-drop', 'provider-rate-limit', 'provider-auth-expired'
    ]),
    persistent: z.boolean().default(false),
    message: z.string().max(500).optional()
  }
}, async input => result(await client.request('inject-fault', input)));

server.registerTool('quest_sim_step', {
  description: 'Advance deterministic virtual time and execute due scenario events.',
  inputSchema: { milliseconds: z.number().min(0).max(86_400_000) }
}, async input => result(await client.request('step', input)));

server.registerTool('quest_sim_inspect', {
  description: 'Inspect current simulated devices, connection states, faults and virtual time.',
  inputSchema: {}
}, async () => result(await client.request('inspect')));

server.registerTool('quest_sim_stop', {
  description: 'Stop the current Quest Device Twin session without touching real hardware.',
  inputSchema: {}
}, async () => result(await client.request('stop')));

const transport = new StdioServerTransport();
await server.connect(transport);

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());

async function shutdown() {
  try { await server.close(); } catch { /* close best effort */ }
  if (manager) await manager.shutdown();
  else client.close();
  process.exit(0);
}

function result(value) {
  const safe = summarize(value);
  return {
    content: [{ type: 'text', text: JSON.stringify(safe, null, 2) }],
    structuredContent: safe
  };
}

function summarize(value) {
  if (!value || typeof value !== 'object') return value;
  const copy = structuredClone(value);
  if (Array.isArray(copy.trace) && copy.trace.length > 100) copy.trace = copy.trace.slice(-100);
  if (copy.state && Array.isArray(copy.state.trace) && copy.state.trace.length > 100) copy.state.trace = copy.state.trace.slice(-100);
  return copy;
}

function parseEndpoint(value) {
  if (!value) return null;
  const match = value.match(/^127\.0\.0\.1:(\d{1,5})$/);
  const port = Number(match?.[1]);
  if (!match || port < 1 || port > 65_535) throw new Error('NEXUSFLEET_TWIN_ENDPOINT must be 127.0.0.1:<port>.');
  return { host: '127.0.0.1', port };
}
