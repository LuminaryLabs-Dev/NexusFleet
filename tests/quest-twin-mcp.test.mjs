import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('Quest Twin MCP gateway exposes only the six bounded tools', async t => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: ['packages/mcp/quest-twin-server.mjs'],
    cwd: process.cwd(),
    stderr: 'pipe'
  });
  const client = new Client({ name: 'nexusfleet-test', version: '1.0.0' });
  t.after(async () => {
    try { await client.close(); } catch { /* already closed */ }
  });
  await client.connect(transport);
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(tool => tool.name).sort(), [
    'quest_sim_inject_fault',
    'quest_sim_inspect',
    'quest_sim_load_scenario',
    'quest_sim_start',
    'quest_sim_step',
    'quest_sim_stop'
  ]);
  await client.callTool({ name: 'quest_sim_start', arguments: { deviceCount: 2, seed: 5 } });
  await client.callTool({ name: 'quest_sim_load_scenario', arguments: { name: 'adb-offline-recovery' } });
  await client.callTool({ name: 'quest_sim_step', arguments: { milliseconds: 5_000 } });
  const inspected = await client.callTool({ name: 'quest_sim_inspect', arguments: {} });
  assert.equal(inspected.structuredContent.devices.length, 2);
  assert.equal(inspected.structuredContent.devices[0].connectionState, 'device');
  await client.callTool({ name: 'quest_sim_stop', arguments: {} });
});
