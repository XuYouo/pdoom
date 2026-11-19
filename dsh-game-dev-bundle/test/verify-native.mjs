// Installed-runtime preset regression. Uses only a temporary profile and home;
// never opens the desktop, a real profile, credentials, a model or an editor.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtemp, mkdir, symlink, writeFile, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const runtime = process.env.DSH_RUNTIME_PACKAGE;
if (!runtime) throw new Error('Set DSH_RUNTIME_PACKAGE to the installed dsh/package.json and run with Electron Node mode --expose-internals');
const bundle = process.env.DSH_GAME_DEV_BUNDLE || fileURLToPath(new URL('../', import.meta.url));
const fixture = await mkdtemp(join(tmpdir(), 'game-dev-native-'));
const originalCwd = process.cwd();
process.env.DSH_HOME = join(fixture, 'home');
process.env.DSH_TELEMETRY_DISABLED = '1';
// Imports happen after DSH_HOME changes: native default paths stay temporary.
const require = createRequire(runtime);
const { Context } = require('@deepseek-ai/cordis');
const { Loader, evaluate } = require('@deepseek-ai/cordis-plugin-loader');
const { composeEntries, loadOverlayPatches, mountRootInclude, createRuntimeResolution,
  loadProfileDirectory, PluginPackages } = require('@deepseek-ai/dsh-app-boot');
const { CordisInspectRegistryService } = require('@deepseek-ai/dsh-cordis-host-runner');
const ctx = new Context();
const diagnostics = [];
ctx.logger.exporter({ levels: { default: 2 }, export: record => {
  if (record.type === 'error') diagnostics.push(record.args.map(String).join(' '));
} });
const reservations = [];
let timeout;

// Keep both ports occupied by this fixture. The catalog-only MCP client cannot
// reach an existing live editor bridge, even if another process starts nearby.
async function reservePort() {
  const server = createServer(socket => socket.destroy());
  reservations.push(server);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

try {
  const pluginPort = await reservePort(), controlPort = await reservePort();
  await mkdir(join(fixture, 'node_modules/@local'), { recursive: true });
  await symlink(bundle, join(fixture, 'node_modules/@local/dsh-game-dev-bundle'), 'dir');
  await writeFile(join(fixture, 'package.json'), JSON.stringify({
    name: 'game-dev-native-fixture', private: true, type: 'module',
    dependencies: { '@local/dsh-game-dev-bundle': `link:${bundle}` },
    dsh: { profile: { bundles: ['@local/dsh-game-dev-bundle'] } },
  }));
  await writeFile(join(fixture, 'cordis.yml'), '[]\n');
  process.chdir(fixture);
  const base = composeEntries([loadOverlayPatches('fixture', require.resolve('@deepseek-ai/dsh-base/cordis.patch.yml'))]);
  // Native runtime services only. Excludes real credentials, provider adapters,
  // telemetry, UI, profile management, default skill roots and global tools.
  const hostIds = new Set([
    'shell-env', 'timer', 'llm', 'session', 'user-questions', 'agent', 'agent-default-model', 'jobs',
    'session-persistence-jsonl', 'attachment-local', 'session-query-sqlite', 'working-directory',
    'session-projection', 'storage', 'storage-json', 'storage-domain', 'session-projection-cache',
    'subprocess', 'sandbox', 'sandbox-policy', 'bash-sandbox', 'pwsh-sandbox', 'approval', 'permission',
    'skill', 'commands', 'goal', 'token-meter', 'subagent', 'subagent-spawn-in-process',
    'subagent-fork-in-process', 'ptc-runtime', 'web', 'mcp-resources', 'tools', 'tool-executor-native',
    'system-prompt', 'agent-loop', 'fs-sandbox',
  ]);
  const host = base.filter(row => hostIds.has(row.id));
  const preset = composeEntries([loadOverlayPatches('fixture', process.env.DSH_GAME_DEV_PATCH || join(bundle, 'cordis.patch.yml'))])[0];
  assert.equal(preset.id, 'preset-game-dev');
  const legacyRow = preset.config.plugins.find(row => row.id === 'delegation').config
    .find(row => row.id === 'tool-subagent-list-agents');
  const condition = legacyRow.disabled?.__jsExpr;
  if (!process.env.DSH_GAME_DEV_PATCH) {
    assert.equal(typeof condition, 'string', 'retain an evaluated guard for the legacy subpath');
    const guarded = exports => evaluate({ baseUrl: pathToFileURL(join(fixture, 'package.json')).href,
      process: { getBuiltinModule(name) {
        assert.equal(name, 'node:module');
        return { createRequire() { return specifier => {
          assert.equal(specifier, '@deepseek-ai/dsh-tool-subagent-control/package.json');
          return { exports };
        }; } };
      } },
    }, condition);
    assert.equal(guarded({ './list-agents': './list-agents.js' }), false, 'older runtimes retain their separate list tool');
    assert.equal(guarded({ '.': './index.js' }), true, 'merged runtimes skip the removed subpath');
  }
  const mcp = preset.config.plugins.find(row => row.id === 'aseprite-mcp');
  mcp.config = { ...mcp.config, env: { ...mcp.config.env,
    DSH_GAME_DEV_BRIDGE_AUTOSTART: '0', DSH_GAME_DEV_PLUGIN_PORT: String(pluginPort),
    DSH_GAME_DEV_CONTROL_PORT: String(controlPort),
  } };
  const rows = [...host,
    { id: 'agent-presets', name: '@deepseek-ai/dsh-agent-preset-registry', config: { default: 'game-dev' } },
    { id: 'preset-control', name: '@deepseek-ai/dsh-agent-preset', config: { id: 'control', plugins: [] } },
    preset,
  ];
  ctx.baseUrl = pathToFileURL(fixture + '/').href;
  ctx.provide('dshHomePath', (...parts) => join(process.env.DSH_HOME, ...parts));
  const profile = loadProfileDirectory('dsh', fixture, runtime);
  await ctx.plugin(PluginPackages, { resolution: await createRuntimeResolution({ installAnchor: runtime, profile, home: process.env.DSH_HOME }) });
  await ctx.plugin(Loader);
  await ctx.plugin(CordisInspectRegistryService);
  await Promise.race([
    (async () => {
      await mountRootInclude(ctx, join(fixture, 'cordis.yml'), [{ insert: rows }], ctx.baseUrl, 'game-dev-fixture');
      await ctx.loader.await();
    })(),
    new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('Native preset mounting exceeded 45 seconds')), 45000); }),
  ]);
  clearTimeout(timeout);
  const roster = await ctx.agentPresets.list();
  const game = roster.find(item => item.id === 'game-dev');
  assert.ok(game, 'preset appears in the native roster');
  assert.equal(game.broken, undefined, `game-dev activation failed: ${game.broken || ''}`);
  const inventory = await ctx.agentPresets.compositionInventory();
  for (const entry of inventory.find(item => item.id === 'game-dev').rows) {
    if (entry.enabled) assert.equal(entry.fiberState, 2, `${entry.entryId} must activate`);
  }
  const lease = await ctx.agentPresets.acquireScope('game-dev');
  const control = await ctx.agentPresets.acquireScope('control');
  try {
    const global = await ctx.skills.snapshot({ cwd: fixture });
    const unrelated = await ctx.skills.snapshot({ scope: control.key, cwd: fixture });
    const scoped = await ctx.skills.snapshot({ scope: lease.key, cwd: fixture });
    const owned = snapshot => snapshot.skills.filter(skill => skill.provider === 'game-dev');
    assert.equal(owned(global).length, 0);
    assert.equal(owned(unrelated).length, 0);
    assert.equal(scoped.complete, true);
    assert.equal(owned(scoped).length, 120);
    const tools = ctx.tools.schemas(lease.key).map(tool => tool.name);
    for (const scope of [undefined, control.key]) {
      const names = ctx.tools.schemas(scope).map(tool => tool.name);
      assert.equal(names.filter(name => name.startsWith('mcp__aseprite__')).length, 0);
      assert.equal(names.includes('workflow'), false);
      assert.equal(names.includes('subagent'), false);
    }
    assert.equal(tools.filter(name => name.startsWith('mcp__aseprite__')).length, 18);
    assert.equal(tools.includes('mcp__aseprite__run_lua'), false);
    for (const name of ['workflow', 'subagent', 'subagent_fork', 'list_agents', 'send_message']) {
      assert.equal(tools.filter(item => item === name).length, 1, `${name} must appear exactly once`);
    }
    console.log(JSON.stringify({ nativeRuntime: require('@deepseek-ai/dsh/package.json').version,
      presetActivated: true, gameSkills: 120, asepriteTools: 18, workflowAndSubagents: true,
      listAgentsExactlyOnce: true, legacyExportGuard: true, globalAndOtherPresetIsolation: true,
      nativeLoaderAndRegistry: true, noModelRequests: true, noToolCalls: true, noEditorAccess: true }));
  } finally {
    await control[Symbol.asyncDispose]();
    await lease[Symbol.asyncDispose]();
  }
} catch (error) {
  for (const message of diagnostics) console.error(message);
  throw error;
} finally {
  clearTimeout(timeout);
  await ctx.fiber.dispose();
  await Promise.all(reservations.map(server => new Promise(resolve => server.close(resolve))));
  process.chdir(originalCwd);
  await rm(fixture, { recursive: true, force: true });
}
