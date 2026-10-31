import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join, dirname } from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const json = async path => JSON.parse(await readFile(join(root, path), 'utf8'));
const roots = ['skills', 'vendor/phaser/skills', 'vendor/gamedev',
  ...['disciplines','ebitengine','genres','godot','other-engines','unity','unreal','web-engines','workflows'].map(x => `vendor/gamedev/skills/${x}`),
  'vendor/aseprite/skills'];

test('all 120 skills are shallow-discoverable and names are unique', async () => {
  const names = [];
  const counts = { phaser: 0, gamedev: 0, aseprite: 0, adapter: 0 };
  for (const dir of roots) {
    for (const item of await readdir(join(root, dir), { withFileTypes: true })) {
      if (!item.isDirectory()) continue;
      let text;
      try { text = await readFile(join(root, dir, item.name, 'SKILL.md'), 'utf8'); }
      catch (e) { if (e.code === 'ENOENT') continue; throw e; }
      const name = text.match(/^name:\s*['"]?([a-z0-9]+(?:-[a-z0-9]+)*)['"]?\s*$/m)?.[1];
      assert.ok(name, `${dir}/${item.name} must have a valid frontmatter name`);
      names.push(name);
      counts[dir.includes('/phaser') ? 'phaser' : dir.includes('/gamedev') ? 'gamedev' : dir.includes('/aseprite') ? 'aseprite' : 'adapter']++;
    }
  }
  assert.equal(names.length, 120);
  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(counts, { phaser: 28, gamedev: 77, aseprite: 14, adapter: 1 });
});

test('DSH compatibility requires only a minimum version, without an upper bound', async () => {
  const manifest = await json('package.json');
  assert.equal(manifest.engines.dsh, '>=0.2.1-rc.3');
});

test('bundle inserts only game-dev, and no dependency install scripts are declared', async () => {
  const manifest = await json('package.json');
  for (const hook of ['preinstall', 'install', 'postinstall', 'prepare']) assert.equal(manifest.scripts[hook], undefined);
  const patch = await readFile(join(root, 'cordis.patch.yml'), 'utf8');
  assert.equal((patch.match(/^- insert:/gm) ?? []).length, 1);
  assert.deepEqual(patch.match(/^    - id: .+$/gm), ['    - id: preset-game-dev']);
  assert.match(patch, /includeDefaultRoots: false/);
  assert.match(patch, /workflowEngine: true/);
  assert.ok(!/preset-(?:standard|ptc|minimal|cordis)\b/.test(patch));
  for (const lang of ['en','zh']) assert.ok((await json(`locale/${lang}.json`)).meta.title);
});

test('published runtime resolves the fixed SDK and websocket versions locally', async () => {
  const require = createRequire(import.meta.url);
  const artistRequire = createRequire(require.resolve('@pebbly/aseprite-ai-artist/package.json'));
  const sdkEntry = artistRequire.resolve('@modelcontextprotocol/sdk/server/index.js');
  const sdkPackage = JSON.parse(await readFile(join(dirname(sdkEntry), '../../../package.json'), 'utf8'));
  assert.equal(sdkPackage.version, '1.32.2');
  assert.equal(artistRequire('ws/package.json').version, '8.22.0');
  assert.equal(artistRequire('zod/package.json').version, '3.25.76');
});

test('workflow templates handle failed branches and preserve cold-read separation', async () => {
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const review = new AsyncFunction('args','phase','pipeline','agent', await readFile(join(root, 'workflows/game-review.js'), 'utf8'));
  const results = await review({targets:['src'],engineVersion:'4.0.0'}, () => {},
    async (items, fn) => Promise.all(items.map(fn)), async () => null);
  assert.equal(results.incomplete, true);
  assert.equal(results.completed, 0);
  const critique = new AsyncFunction('args','phase','agent', await readFile(join(root, 'workflows/pixel-art-critique.js'), 'utf8'));
  const prompts = [];
  const result = await critique({preview:'anonymous.png',brief:'SECRET_INTENDED_SUBJECT'}, () => {}, async prompt => {
    prompts.push(prompt);
    return prompts.length === 1 ? {imageSeen:true,subject:'a shape',focalPoints:['a','b','c']} : 'critique';
  });
  assert.ok(!prompts[0].includes('SECRET_INTENDED_SUBJECT'));
  assert.ok(prompts[1].includes('SECRET_INTENDED_SUBJECT'));
  assert.equal(result.incomplete, false);
});
