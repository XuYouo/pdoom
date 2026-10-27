#!/usr/bin/env node
/** Stdio-only, preset-owned MCP process. Never runs the upstream installer/CLI. */
import { createServer } from '@pebbly/aseprite-ai-artist/dist/server.js';
import { Bridge } from '@pebbly/aseprite-ai-artist/dist/bridge/bridge.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const log = (message) => process.stderr.write(`[dsh-game-dev] ${message}\n`);
function port(name, fallback) {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isSafeInteger(value) || value < 1024 || value > 65535) {
    throw new Error(`${name} must be a TCP port from 1024 to 65535`);
  }
  return value;
}
const pluginPort = port('DSH_GAME_DEV_PLUGIN_PORT', 9931);
const controlPort = port('DSH_GAME_DEV_CONTROL_PORT', 9932);
if (pluginPort === controlPort) throw new Error('Bridge ports must differ');
const bridge = new Bridge({ version: '0.8.2', pluginPort, controlPort, log });
let ownsBridge = false;
let bridgeStart;
let stopping = false;
const { server, live } = createServer({
  pluginPort,
  controlPort,
  autoSpawnBridge: false,
  allowLua: false,
  headless: false,
  prompts: false,
});
const transport = new StdioServerTransport();
const autoStartBridge = process.env.DSH_GAME_DEV_BRIDGE_AUTOSTART === '1';
let recoveryTimer;

async function ensureBridge() {
  if (stopping || ownsBridge || live.bridgeConnected) return;
  if (!bridgeStart) {
    bridgeStart = bridge.start().then(owned => {
      ownsBridge = owned;
      if (!owned) log('Reusing occupied bridge ports; external processes remain untouched.');
    }).finally(() => { bridgeStart = undefined; });
  }
  return bridgeStart;
}

async function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  clearInterval(recoveryTimer);
  const deadline = setTimeout(() => process.exit(code), 2000);
  deadline.unref();
  try {
    if (bridgeStart) await bridgeStart.catch(error => log(`bridge shutdown: ${error.message}`));
    live.close();
    if (ownsBridge) await bridge.stop();
    await server.close();
  } catch (error) {
    log(`shutdown: ${error.message}`);
  } finally {
    clearTimeout(deadline);
    process.exit(code);
  }
}

process.once('SIGINT', () => void stop());
process.once('SIGTERM', () => void stop());
process.stdin.once('end', () => void stop());
process.stdin.once('error', () => void stop(1));

if (autoStartBridge) {
  await ensureBridge();
  // Recover ownership after an older preset revision or external bridge exits.
  recoveryTimer = setInterval(() => {
    void ensureBridge().catch(error => log(`bridge recovery: ${error.message}`));
  }, 2000);
  recoveryTimer.unref();
}
await server.connect(transport);
const onmessage = transport.onmessage;
transport.onmessage = async (message, extra) => {
  try {
    // Without preset opt-in, the first explicit live tool call owns startup.
    // Both modes keep the bridge inside this managed process, never detached.
    if (message.method === 'tools/call' && !stopping) {
      const selectedMode = message.params?.name === 'preflight'
        ? (message.params?.arguments?.mode ?? live.mode) : live.mode;
      if (selectedMode === 'live') await ensureBridge();
    }
  } catch (error) {
    log(`bridge: ${error.message}`);
  }
  // Dispatch exactly once, even if bridge startup fails; preflight explains readiness.
  return onmessage?.(message, extra);
};
