// Explicit, one-shot integration verification. Not an Inspect provider or global tool.
import { randomUUID } from 'node:crypto';
import { mkdir, open, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export const name = 'game-dev-aseprite-verification';
export const inject = ['agents', 'agentPresets', 'tools'];

export function apply(ctx, config = {}) {
  if (config.enabled !== true) return;
  const outputDir = resolve(config.outputDir ?? '');
  if (!outputDir.startsWith('/Users/ocean/Library/Caches/dsh-aseprite-native-1.3.18.6/live-validation-')) {
    throw new Error('Verification output must be a task-owned native installation cache directory');
  }
  ctx.effect(() => {
    const cancellation = new AbortController();
    let work;
    const timer = ctx.agents.withoutInitiator(() => setTimeout(() => {
      work = verify(ctx, outputDir, config.cwd, cancellation.signal).catch(async error => {
        await writeFile(join(outputDir, 'validator-error.json'), JSON.stringify({ error: String(error), stack: error.stack }, null, 2));
      });
    }, 0));
    return async () => {
      clearTimeout(timer);
      cancellation.abort();
      await work;
    };
  }, 'one-shot authorized Aseprite verification');
}

async function verify(ctx, outputDir, cwd, signal) {
  await mkdir(outputDir, { recursive: true });
  let claim;
  try { claim = await open(join(outputDir, 'started.lock'), 'wx'); }
  catch (error) { if (error.code === 'EEXIST') return; throw error; }
  await claim.close();
  const report = { startedAt: new Date().toISOString(), stage: 'create-agent', calls: [], outputDir };
  const saveReport = () => writeFile(join(outputDir, 'report.json'), JSON.stringify(report, null, 2));
  await saveReport();
  let handle, fixture, saved = false, closed = false;
  let originalActive;
  try {
    handle = await ctx.agents.create({
      sessionId: `game-dev-validation-${randomUUID()}`,
      meta: { cwd, agentPreset: 'game-dev' },
      signal,
      setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, 'game-dev'); },
    });
    const agent = handle.agent;
    report.sessionId = agent.id;
    report.preset = ctx.agentPresets.composedPreset(agent.ctx);
    if (report.preset !== 'game-dev') throw new Error('Fresh Agent is not mounted to game-dev');
    const schemas = ctx.tools.schemas(agent);
    report.visibleAsepriteTools = schemas.filter(x => x.name.startsWith('mcp__aseprite__')).map(x => x.name);
    await writeFile(join(outputDir, 'tool-schemas.json'), JSON.stringify(schemas.filter(x => x.name.startsWith('mcp__aseprite__')), null, 2));
    let number = 0;
    async function call(shortName, args) {
      const name = `mcp__aseprite__${shortName}`;
      const schema = schemas.find(x => x.name === name);
      if (!schema) throw new Error(`Tool not visible in real game-dev Agent: ${name}`);
      const result = await ctx.agents.withInitiator(agent, () => ctx.tools.execute({
        callId: randomUUID(), name, schema, arguments: args, agent,
        signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
      }));
      const filename = `${String(++number).padStart(2, '0')}-${shortName}.json`;
      await writeFile(join(outputDir, filename), JSON.stringify(result, null, 2));
      report.calls.push({ name, arguments: args, isError: result.isError, resultFile: filename });
      await saveReport();
      if (result.isError) throw new Error(`${name}: ${JSON.stringify(result.error)}`);
      const data = result.value?.structuredContent;
      if (!data) throw new Error(`${name}: expected canonical value.structuredContent`);
      return { data, raw: result.value, content: result.content };
    }
    let preflight;
    for (let attempt = 0; attempt < 3; attempt++) {
      preflight = await call('preflight', {});
      if (preflight.data.ready) break;
      if (attempt < 2) await delay(2500, undefined, { signal });
    }
    report.preflight = preflight.data;
    if (!preflight.data.ready || preflight.data.mode !== 'live') throw new Error('Live editor is not ready; no headless fallback');
    report.stage = 'capture-open-documents';
    const before = await call('sprite_manage', { op: 'list' });
    report.documentsBefore = before.data.sprites ?? [];
    originalActive = report.documentsBefore.find(x => x.active)?.id;
    report.stage = 'create-isolated-fixture';
    const created = await call('sprite_manage', { op: 'new', width: 16, height: 16, colorMode: 'rgb' });
    if (!Number.isInteger(created.data.id)) throw new Error('New document did not return an unambiguous id');
    fixture = `#${created.data.id}`;
    report.fixture = fixture;
    const info = await call('sprite_info', { sprite: fixture });
    const layer = info.data.layers.find(x => !x.isGroup && x.editable)?.name;
    if (!layer) throw new Error('Fixture has no editable image layer');
    await call('draw', {
      sprite: fixture, layer, frame: 1, paletteLock: false, label: 'DSH game-dev integration test',
      ops: [
        { kind: 'rect', color: '#172739', fill: '#172739', rect: { x: 0, y: 0, width: 16, height: 16 } },
        { kind: 'rect', color: '#6ce0bb', fill: '#6ce0bb', rect: { x: 3, y: 3, width: 10, height: 10 } },
        { kind: 'pixels', points: [{ x: 7, y: 7, color: '#f1bf65' }, { x: 8, y: 8, color: '#ffffff' }] },
      ],
    });
    await call('look', { op: 'ascii', sprite: fixture, frame: 1, rulers: false });
    const preview = await call('look', { op: 'preview', sprite: fixture, frame: 1, scale: 16 });
    const image = preview.raw.content.find(x => x.type === 'image' && x.mimeType === 'image/png');
    if (!image) throw new Error('MCP preview returned no PNG image block');
    await writeFile(join(outputDir, 'preview.png'), Buffer.from(image.data, 'base64'));
    report.stage = 'save-and-export';
    await call('sprite_manage', { op: 'save_as', sprite: fixture, path: join(outputDir, 'fixture.aseprite') });
    saved = true;
    await call('export', { op: 'png', sprite: fixture, frame: 1, path: join(outputDir, 'fixture.png'), scale: 1 });
    await call('sprite_manage', { op: 'close', sprite: fixture, force: false });
    closed = true;
    if (originalActive !== undefined) await call('sprite_manage', { op: 'activate', sprite: `#${originalActive}` });
    const after = await call('sprite_manage', { op: 'list' });
    report.documentsAfter = after.data.sprites ?? [];
    const state = docs => docs.map(({id,filename,width,height,modified}) => ({id,filename,width,height,modified})).sort((a,b) => a.id-b.id);
    if (JSON.stringify(state(report.documentsBefore)) !== JSON.stringify(state(report.documentsAfter))) {
      throw new Error('Open document set/state differs after fixture cleanup');
    }
    report.stage = 'complete';
    report.success = true;
  } catch (error) {
    report.success = false;
    report.error = String(error);
    report.stack = error.stack;
    report.fixtureLeftOpen = Boolean(fixture && !closed);
    report.fixtureSaved = saved;
  } finally {
    if (handle) await handle.dispose();
    report.finishedAt = new Date().toISOString();
    await saveReport();
  }
}
