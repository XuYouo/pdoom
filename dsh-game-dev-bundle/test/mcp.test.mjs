import test from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { Bridge } from '@pebbly/aseprite-ai-artist/dist/bridge/bridge.js';

async function reservePort() {
  const server = net.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { port: server.address().port, release: () => new Promise(resolve => server.close(resolve)) };
}
async function freePorts() {
  const a = await reservePort(), b = await reservePort();
  await Promise.all([a.release(), b.release()]);
  return { pluginPort: a.port, controlPort: b.port };
}
async function open(port) {
  return new Promise(resolve => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const end = result => { socket.destroy(); resolve(result); };
    socket.once('connect', () => end(true));
    socket.once('error', () => end(false));
    socket.setTimeout(1000, () => end(false));
  });
}
async function connect(ports, extraEnv = {}) {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL('../bin/aseprite-server.mjs', import.meta.url))],
    stderr: 'pipe',
    env: { ...process.env, DSH_GAME_DEV_PLUGIN_PORT: String(ports.pluginPort), DSH_GAME_DEV_CONTROL_PORT: String(ports.controlPort), ASEPRITE_AI_ALLOW_LUA: '0', ASEPRITE_AI_HEADLESS: '0', DSH_GAME_DEV_BRIDGE_AUTOSTART: '0', ...extraEnv },
  });
  let stderr = '';
  transport.stderr?.on('data', chunk => { stderr += chunk; });
  const client = new Client({ name: 'game-dev-integration-test', version: '1.0.0' });
  await client.connect(transport);
  return { client, transport, stderr: () => stderr };
}

test('MCP catalogs are available offline; listeners are lazy and owned bridge stops', {timeout:15000}, async () => {
  const ports = await freePorts();
  const { client } = await connect(ports);
  try {
    const tools = (await client.listTools()).tools;
    assert.equal(tools.length, 18);
    assert.ok(tools.some(t => t.name === 'preflight'));
    assert.ok(!tools.some(t => t.name === 'run_lua'));
    const resources = (await client.listResources()).resources;
    assert.equal(resources.filter(x => x.uri.startsWith('skill://')).length, 14);
    assert.ok(resources.some(x => x.uri === 'rules://index'));
    assert.ok((await client.readResource({uri:'rules://index'})).contents.length > 0);
    assert.ok((await client.readResource({uri:'skill://studio'})).contents.length > 0);
    assert.equal(await open(ports.pluginPort), false);
    assert.equal(await open(ports.controlPort), false);
    const result = await client.callTool({name:'preflight',arguments:{}});
    assert.equal(result.structuredContent.ready, false);
    assert.equal(result.structuredContent.mode, 'live');
    assert.equal(result.structuredContent.bridgeConnected, true);
    assert.equal(await open(ports.pluginPort), true);
  } finally {
    await client.close();
  }
  assert.equal(await open(ports.pluginPort), false);
  assert.equal(await open(ports.controlPort), false);
});

test('closing a client never stops a bridge it did not create', {timeout:15000}, async () => {
  const ports = await freePorts();
  const external = new Bridge({...ports, version:'0.8.2'});
  assert.equal(await external.start(), true);
  try {
    const {client} = await connect(ports);
    try {
      const result = await client.callTool({name:'preflight',arguments:{}});
      assert.equal(result.structuredContent.ready, false);
      assert.equal(result.structuredContent.bridgeConnected, true);
    } finally { await client.close(); }
    assert.equal(await open(ports.controlPort), true);
    assert.equal(await open(ports.pluginPort), true);
  } finally {
    for (const socket of external.controlServer?.clients ?? []) socket.terminate();
    for (const socket of external.pluginServer?.clients ?? []) socket.terminate();
    await external.stop();
  }
});

test('preset opt-in starts a managed bridge before any tool call', {timeout:15000}, async () => {
  const ports = await freePorts();
  const {client} = await connect(ports, { DSH_GAME_DEV_BRIDGE_AUTOSTART: '1' });
  try {
    assert.equal(await open(ports.pluginPort), true);
    assert.equal(await open(ports.controlPort), true);
    assert.equal((await client.listTools()).tools.length, 18);
  } finally { await client.close(); }
  assert.equal(await open(ports.pluginPort), false);
  assert.equal(await open(ports.controlPort), false);
});
