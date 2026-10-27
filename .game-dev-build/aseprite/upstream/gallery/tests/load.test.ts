import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stringify } from 'yaml';
import { compareVersions, inspectGallery, pointsOf, scoreComponents, type LoadResult } from '../src/load.ts';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
// u32 size, then the 0xA5E0 magic little-endian.
const ASEPRITE = Buffer.from([0x80, 0, 0, 0, 0xe0, 0xa5, 0, 0]);

const PROMPT = {
  title: 'Knight',
  summary: 'test',
  revision: 2,
  setup: { canvas: { width: 32, height: 32, colorMode: 'rgb' } },
  steps: [
    { title: 'Still', text: 'Draw a knight.' },
    { title: 'Slash', text: 'Animate a slash.\n4 frames.' },
  ],
  criteria: [
    { id: 'a', step: 1, text: 'a' },
    { id: 'b', step: 2, text: 'b' },
  ],
};

function generation(overrides: Record<string, unknown> = {}) {
  return {
    title: 'Run',
    date: '2026-09-29',
    author: { name: 'Test', github: 'tester' },
    plugin: '0.3.2',
    harness: 'omp',
    models: ['model-x'],
    steps: [{ text: 'Draw a knight.' }, { text: 'Animate a slash.\n4 frames.\n' }],
    references: { source: 'none' },
    files: [
      { path: 'cover.png', role: 'cover' },
      { path: 'knight.aseprite', role: 'source' },
    ],
    benchmark: {
      prompt: 'knight',
      revision: 2,
      results: [
        { criterion: 'a', pass: true },
        { criterion: 'b', pass: false },
      ],
    },
    ...overrides,
  };
}

function makeRepo(generations: Record<string, Record<string, unknown>>, extraFiles: Record<string, Record<string, Buffer>> = {}) {
  const repo = mkdtempSync(join(tmpdir(), 'gallery-'));
  writeFileSync(join(repo, 'CHANGELOG.md'), '## [Unreleased]\n\n## [0.3.2] — 2026-09-29\n\n## [0.3.1] — 2026-09-28\n');
  mkdirSync(join(repo, 'gallery'), { recursive: true });
  writeFileSync(join(repo, 'gallery', 'MAINTAINERS'), '# maintainers\nTester\n');
  const root = join(repo, 'gallery');
  mkdirSync(join(root, 'prompts', 'knight'), { recursive: true });
  writeFileSync(join(root, 'prompts', 'knight', 'prompt.yaml'), stringify(PROMPT));
  for (const [id, data] of Object.entries(generations)) {
    const dir = join(root, 'generations', id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'generation.yaml'), stringify(data));
    writeFileSync(join(dir, 'cover.png'), PNG);
    writeFileSync(join(dir, 'knight.aseprite'), ASEPRITE);
    for (const [name, bytes] of Object.entries(extraFiles[id] ?? {})) writeFileSync(join(dir, name), bytes);
  }
  return { root, cleanup: () => rmSync(repo, { recursive: true, force: true }) };
}

function errorsOf(result: LoadResult) {
  return result.problems.filter((problem) => problem.level === 'error').map((problem) => problem.message);
}

test('a valid run is scored and lands in its model × version cell', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation(),
    '2026-09-29-b': generation({ benchmark: { prompt: 'knight', revision: 2, results: [{ criterion: 'a', pass: true }, { criterion: 'b', pass: true }] } }),
    '2026-09-29-c': generation({ plugin: '0.3.1', models: ['model-y'] }),
  });
  try {
    const result = inspectGallery(root);
    assert.deepEqual(errorsOf(result), []);
    const [benchmark] = result.gallery.benchmarks;
    assert.deepEqual(benchmark!.versions, ['0.3.2', '0.3.1']);
    const cell = benchmark!.cells.find((c) => c.modelLabel === 'model-x' && c.plugin === '0.3.2')!;
    assert.equal(cell.runs.length, 2);
    assert.deepEqual(cell.best, { passed: 2, total: 2 }, 'the best run leads the cell');
    assert.equal(cell.runs[0]!.id, '2026-09-29-b');
    assert.deepEqual(benchmark!.models, ['model-x', 'model-y'], 'models rank by best score');
  } finally {
    cleanup();
  }
});

test('a benchmark run must send the prompt verbatim', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ steps: [{ text: 'Draw a cool knight.' }, { text: 'Animate a slash.\n4 frames.' }] }),
  });
  try {
    const errors = errorsOf(inspectGallery(root));
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /steps\.0\.text differs/);
  } finally {
    cleanup();
  }
});

test('every criterion needs an answer, and only known ones', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ benchmark: { prompt: 'knight', revision: 2, results: [{ criterion: 'a', pass: true }, { criterion: 'zzz', pass: true }] } }),
  });
  try {
    const errors = errorsOf(inspectGallery(root));
    assert.ok(errors.some((e) => /unknown criterion "zzz"/.test(e)));
    assert.ok(errors.some((e) => /unanswered criteria: b/.test(e)));
  } finally {
    cleanup();
  }
});

test('an older prompt revision is kept but not ranked', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ steps: [{ text: 'old text' }], benchmark: { prompt: 'knight', revision: 1, results: [{ criterion: 'old', pass: true }] } }),
  });
  try {
    const result = inspectGallery(root);
    assert.deepEqual(errorsOf(result), []);
    assert.equal(result.gallery.generations.length, 1);
    assert.equal(result.gallery.benchmarks[0]!.cells.length, 0);
    assert.equal(result.gallery.benchmarks[0]!.outdatedRuns.length, 1);
  } finally {
    cleanup();
  }
});

test('unreleased plugin versions, date/folder drift and a future revision are rejected', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-28-a': generation({ plugin: '9.9.9' }),
    '2026-09-29-b': generation({ benchmark: { prompt: 'knight', revision: 3, results: [{ criterion: 'a', pass: true }] } }),
  });
  try {
    const errors = errorsOf(inspectGallery(root));
    assert.ok(errors.some((e) => /9\.9\.9 is not a released version/.test(e)));
    assert.ok(errors.some((e) => /does not match the folder prefix/.test(e)));
    assert.ok(errors.some((e) => /revision 3 does not exist/.test(e)));
  } finally {
    cleanup();
  }
});

test('stray files, renamed files and a missing .aseprite source are rejected', () => {
  const { root, cleanup } = makeRepo(
    {
      '2026-09-29-a': generation(),
      '2026-09-29-b': generation({ files: [{ path: 'cover.png', role: 'cover' }, { path: 'fake.gif', role: 'animation' }], benchmark: undefined }),
    },
    { '2026-09-29-a': { 'notes.txt': Buffer.from('x') }, '2026-09-29-b': { 'fake.gif': PNG } },
  );
  try {
    const errors = errorsOf(inspectGallery(root));
    assert.ok(errors.some((e) => /not listed in generation\.yaml/.test(e)));
    assert.ok(errors.some((e) => /at least one \.aseprite file/.test(e)));
  } finally {
    cleanup();
  }
});

test('a GIF that is really a PNG is caught by its magic bytes', () => {
  const { root, cleanup } = makeRepo(
    { '2026-09-29-a': generation({ files: [{ path: 'cover.png', role: 'cover' }, { path: 'knight.aseprite', role: 'source' }, { path: 'anim.gif', role: 'animation' }] }) },
    { '2026-09-29-a': { 'anim.gif': PNG } },
  );
  try {
    assert.deepEqual(errorsOf(inspectGallery(root)), ['not a GIF file']);
  } finally {
    cleanup();
  }
});

test('several models require each step to name its model', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ models: ['model-x', 'model-y'] }),
    '2026-09-29-b': generation({ models: ['model-x', 'model-y'], steps: [{ text: 'Draw a knight.', model: 'model-x' }, { text: 'Animate a slash.\n4 frames.', model: 'model-y' }] }),
  });
  try {
    const result = inspectGallery(root);
    const errors = errorsOf(result);
    assert.equal(errors.length, 2, errors.join('\n'));
    assert.ok(errors.every((e) => /must name the one that ran it/.test(e)));
    assert.equal(result.gallery.generations[0]!.modelLabel, 'model-x + model-y');
  } finally {
    cleanup();
  }
});

test('the same models in any order share one benchmark row', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ models: ['model-y', 'model-x'], steps: [{ text: 'Draw a knight.', model: 'model-y' }, { text: 'Animate a slash.\n4 frames.', model: 'model-x' }] }),
    '2026-09-29-b': generation({ models: ['model-x', ' model-y '], steps: [{ text: 'Draw a knight.', model: 'model-x' }, { text: 'Animate a slash.\n4 frames.', model: 'model-y' }] }),
  });
  try {
    const result = inspectGallery(root);
    assert.deepEqual(errorsOf(result), []);
    const cells = result.gallery.benchmarks[0]!.cells;
    assert.equal(cells.length, 1);
    assert.equal(cells[0]!.modelLabel, 'model-x + model-y');
    assert.equal(cells[0]!.runs.length, 2);
  } finally {
    cleanup();
  }
});

test('a run redrawn from an image model concept is ranked on its own row', () => {
  const concept = { source: 'generated', imageModels: ['gpt-image-2'], kinds: ['concept-sheet'] };
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation(),
    '2026-09-29-b': generation({
      references: concept,
      benchmark: { prompt: 'knight', revision: 2, results: [{ criterion: 'a', pass: true }, { criterion: 'b', pass: true }] },
    }),
  });
  try {
    const result = inspectGallery(root);
    assert.deepEqual(errorsOf(result), []);
    const labels = result.gallery.benchmarks[0]!.cells.map((c) => c.modelLabel).sort();
    // The concept-assisted perfect score must not become model-x's own score.
    assert.deepEqual(labels, ['model-x', 'model-x · concept by gpt-image-2']);
    const plain = result.gallery.benchmarks[0]!.cells.find((c) => c.modelLabel === 'model-x')!;
    assert.deepEqual(plain.best, { passed: 1, total: 2 });
  } finally {
    cleanup();
  }
});

test('references must say what was used, and only what was used', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ references: undefined }),
    '2026-09-29-b': generation({ references: { source: 'generated', kinds: ['storyboard'] } }),
    '2026-09-29-c': generation({ references: { source: 'none', imageModels: ['gpt-image-2'] } }),
    '2026-09-29-d': generation({ references: { source: 'supplied' } }),
    '2026-09-29-e': generation({
      references: { source: 'none' },
      files: [
        { path: 'cover.png', role: 'cover' },
        { path: 'knight.aseprite', role: 'source' },
        { path: 'cover.png', role: 'reference' },
      ],
    }),
  });
  try {
    const errors = errorsOf(inspectGallery(root)).join('\n');
    assert.match(errors, /references: Invalid input: expected object/);
    assert.match(errors, /name the image model/);
    assert.match(errors, /only listed when source is "generated"/);
    assert.match(errors, /say what the reference was/);
    assert.match(errors, /source is "none" but reference kinds or files/);
  } finally {
    cleanup();
  }
});

test('a run dated before its plugin version was released is rejected', () => {
  const { root, cleanup } = makeRepo({ '2026-09-27-a': generation({ date: '2026-09-27', plugin: '0.3.2' }) });
  try {
    assert.deepEqual(errorsOf(inspectGallery(root)), ['dated 2026-09-27, before plugin 0.3.2 was released on 2026-09-29']);
  } finally {
    cleanup();
  }
});

test('a symlinked file is rejected instead of published', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ files: [{ path: 'cover.png', role: 'cover' }, { path: 'knight.aseprite', role: 'source' }, { path: 'leak.json', role: 'other' }] }),
  });
  try {
    symlinkSync(join(root, '..', 'CHANGELOG.md'), join(root, 'generations', '2026-09-29-a', 'leak.json'));
    assert.deepEqual(errorsOf(inspectGallery(root)), ['is a symlink — commit the file itself']);
  } finally {
    cleanup();
  }
});

test('plugin versions order by semver precedence, prereleases included', () => {
  const versions = ['1.0.0-beta.2', '1.0.0', '1.0.0-beta.10', '0.9.0', '1.0.0-alpha', '1.0.0-beta'];
  assert.deepEqual([...versions].sort(compareVersions), ['0.9.0', '1.0.0-alpha', '1.0.0-beta', '1.0.0-beta.2', '1.0.0-beta.10', '1.0.0']);
});

test('the leaderboard takes each model at its best cell and ranks by it', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation(),
    '2026-09-29-b': generation({ plugin: '0.3.1', benchmark: { prompt: 'knight', revision: 2, results: [{ criterion: 'a', pass: true }, { criterion: 'b', pass: true }] } }),
    '2026-09-29-c': generation({ models: ['model-y'], benchmark: { prompt: 'knight', revision: 2, results: [{ criterion: 'a', pass: false }, { criterion: 'b', pass: false }] } }),
  });
  try {
    const { leaderboard } = inspectGallery(root).gallery;
    assert.deepEqual(
      leaderboard.map((entry) => [entry.modelLabel, entry.score, entry.benchmarks, entry.runs]),
      [['model-x', 41, 1, 2], ['model-y', 0, 1, 1]],
    );
    assert.equal(leaderboard[0]!.best.knight!.plugin, '0.3.1', 'the older version held the better run');
  } finally {
    cleanup();
  }
});

test('a benchmark a model never ran counts against it in the leaderboard', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ models: ['one-trick'], benchmark: { prompt: 'knight', revision: 2, results: [{ criterion: 'a', pass: true }, { criterion: 'b', pass: true }] } }),
    '2026-09-29-b': generation({ models: ['all-rounder'], benchmark: { prompt: 'knight', revision: 2, results: [{ criterion: 'a', pass: true }, { criterion: 'b', pass: false }] } }),
    '2026-09-29-c': generation({ models: ['all-rounder'], steps: [{ text: 'Draw a slime.' }], benchmark: { prompt: 'slime', revision: 1, results: [{ criterion: 's1', pass: true }, { criterion: 's2', pass: true }] } }),
  });
  try {
    mkdirSync(join(root, 'prompts', 'slime'), { recursive: true });
    writeFileSync(
      join(root, 'prompts', 'slime', 'prompt.yaml'),
      stringify({ ...PROMPT, title: 'Slime', revision: 1, steps: [{ title: 'Slime', text: 'Draw a slime.' }], criteria: [{ id: 's1', step: 1, text: 's1' }, { id: 's2', step: 1, text: 's2' }] }),
    );
    const result = inspectGallery(root);
    assert.deepEqual(result.problems.filter((p) => p.level === 'error'), []);
    assert.deepEqual(
      result.gallery.leaderboard.map((e) => [e.modelLabel, e.score, e.benchmarks]),
      [['all-rounder', 31, 2], ['one-trick', 20.5, 1]],
    );
  } finally {
    cleanup();
  }
});

test('leaderboard history replays each day from the model\'s first run, keeping its best so far', () => {
  const pass = { prompt: 'knight', revision: 2, results: [{ criterion: 'a', pass: true }, { criterion: 'b', pass: true }] };
  const fail = { prompt: 'knight', revision: 2, results: [{ criterion: 'a', pass: false }, { criterion: 'b', pass: false }] };
  const { root, cleanup } = makeRepo({
    '2026-09-28-a': generation({ date: '2026-09-28', plugin: '0.3.1', benchmark: pass }),
    '2026-09-29-b': generation({ date: '2026-09-29' }),
    '2026-09-29-c': generation({ date: '2026-09-29', models: ['model-y'], benchmark: fail }),
    '2026-09-30-d': generation({ date: '2026-09-30', models: ['model-y'] }),
  });
  try {
    const result = inspectGallery(root);
    assert.deepEqual(errorsOf(result), []);
    const history = Object.fromEntries(result.gallery.leaderboard.map((entry) => [entry.modelLabel, entry.history]));
    assert.deepEqual(history['model-x'], [
      { date: '2026-09-28', score: 41, benchmarks: 1, ran: true },
      { date: '2026-09-29', score: 41, benchmarks: 1, ran: true },
      { date: '2026-09-30', score: 41, benchmarks: 1, ran: false },
    ], 'a worse later run does not lower the line, and a day without runs carries it');
    assert.deepEqual(history['model-y'], [
      { date: '2026-09-29', score: 0, benchmarks: 1, ran: true },
      { date: '2026-09-30', score: 21, benchmarks: 1, ran: true },
    ], 'the line starts on the model\'s first run, not the suite\'s');
    for (const entry of result.gallery.leaderboard) assert.equal(entry.history.at(-1)!.score, entry.score);
  } finally {
    cleanup();
  }
});

test('points weigh criteria 35%, craft 50% and speed 15%, rounded to an integer 0–100', () => {
  const full = { compliance: 1, craft: 1, speed: 1, minutes: 10 };
  assert.equal(pointsOf(full), 100);
  assert.equal(pointsOf({ compliance: 0, craft: 0, speed: 0, minutes: 10 }), 0);
  assert.equal(pointsOf({ compliance: 1, craft: 0, speed: 0, minutes: 10 }), 35);
  assert.equal(pointsOf({ compliance: 0, craft: 1, speed: 0, minutes: 10 }), 50);
  assert.equal(pointsOf({ compliance: 0, craft: 0, speed: 1, minutes: 5 }), 15);
  assert.equal(pointsOf({ compliance: 0.5, craft: 0, speed: 0.5, minutes: 20 }), 25);
  assert.equal(pointsOf({ compliance: 0.5, craft: 0.5, speed: 0.1, minutes: 20 }), 44, '43.5 rounds up');
  assert.equal(scoreComponents({ score: { passed: 1, total: 2 }, craft: null }, 20, 10).speed, 0.5, 'fastest ÷ own minutes');
  assert.equal(scoreComponents({ score: { passed: 1, total: 2 }, craft: null }, 10, 10).speed, 1, 'the fastest run gets 1');
});

test('a run with no recorded time is scored on criteria and craft alone, rescaled to 0–100', () => {
  assert.equal(pointsOf({ compliance: 1, craft: 1, speed: 0, minutes: null }), 100);
  assert.equal(pointsOf({ compliance: 1, craft: 0, speed: 0, minutes: null }), 41, '35 / 85');
  assert.equal(pointsOf({ compliance: 0, craft: 1, speed: 0, minutes: null }), 59, '50 / 85');
  // Unmeasured beats a slow measured run with the same criteria and craft, and loses to a fast one.
  const unmeasured = pointsOf({ compliance: 0.8, craft: 0.5, speed: 0, minutes: null });
  assert.ok(pointsOf({ compliance: 0.8, craft: 0.5, speed: 0.2, minutes: 50 }) < unmeasured);
  assert.ok(pointsOf({ compliance: 0.8, craft: 0.5, speed: 1, minutes: 10 }) > unmeasured);
});

test('speed is relative to the fastest fully measured current run', () => {
  const metrics = (...minutes: (number | undefined)[]) => minutes.map((m, i) => ({ step: i + 1, ...(m === undefined ? {} : { minutes: m }) }));
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ models: ['fast'], metrics: metrics(2, 3) }),
    '2026-09-29-b': generation({ models: ['slow'], metrics: metrics(5, 5) }),
    '2026-09-29-c': generation({ models: ['partial'], metrics: metrics(1, undefined) }),
    '2026-09-29-d': generation({ models: ['none'] }),
  });
  try {
    const result = inspectGallery(root);
    assert.deepEqual(result.problems.filter((p) => p.level === 'error'), []);
    const byModel = Object.fromEntries(result.gallery.generations.map((g) => [g.models[0], g]));
    assert.deepEqual(byModel.fast!.components, { compliance: 0.5, craft: 0, speed: 1, minutes: 5 });
    assert.equal(byModel.slow!.components!.speed, 0.5);
    assert.equal(byModel.partial!.components!.speed, 0);
    assert.equal(byModel.partial!.components!.minutes, null);
    assert.deepEqual(
      [byModel.fast!.points, byModel.slow!.points, byModel.partial!.points, byModel.none!.points],
      [33, 25, 21, 21],
      'untimed runs are scored on criteria and craft alone',
    );
  } finally {
    cleanup();
  }
});

test('a benchmark run from someone outside MAINTAINERS is refused; a free generation from them is fine', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ author: { name: 'Stranger', github: 'stranger' } }),
    '2026-09-29-b': generation({ author: { name: 'Stranger', github: 'stranger' }, benchmark: undefined }),
    '2026-09-29-c': generation({ author: { name: 'No handle' } }),
  });
  try {
    const result = inspectGallery(root);
    const errors = errorsOf(result);
    assert.equal(errors.length, 2);
    assert.ok(errors.every((e) => /maintainers only/.test(e)));
    assert.deepEqual(result.gallery.generations.map((g) => g.id), ['2026-09-29-b']);
  } finally {
    cleanup();
  }
});

const STILL = { read: 3, form: 2, cohesion: 4, appeal: 3 };

test('a rating with overall counts that, not the axis mean; axes still feed the per-axis display', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ models: ['model-x'], ratings: [{ judge: 'human:tester', scores: { read: 4, form: 4, cohesion: 4, appeal: 4 }, overall: 5 }] }),
    '2026-09-29-b': generation({
      models: ['model-y'],
      ratings: [
        { judge: 'human:tester', scores: { read: 4, form: 4, cohesion: 4, appeal: 4 }, overall: 7 },
        { judge: 'human:second', scores: { read: 4, form: 4, cohesion: 4, appeal: 4 } },
      ],
    }),
  });
  try {
    const result = inspectGallery(root);
    assert.deepEqual(errorsOf(result), []);
    const a = result.gallery.generations.find((g) => g.id === '2026-09-29-a')!;
    assert.equal(a.craft!.score, 0.5, 'overall 5/10, not the axis mean 1');
    assert.equal(a.craft!.axes.read, 4);
    const b = result.gallery.generations.find((g) => g.id === '2026-09-29-b')!;
    assert.equal(b.craft!.score, (0.7 + 1) / 2, 'a judge without overall still counts their axis mean');
  } finally {
    cleanup();
  }
});

test('overall must be an integer from 0 to 10', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation({ ratings: [{ judge: 'human:tester', scores: { read: 1, form: 1, cohesion: 1, appeal: 1 }, overall: 11 }] }),
    '2026-09-29-b': generation({ ratings: [{ judge: 'human:tester', scores: { read: 1, form: 1, cohesion: 1, appeal: 1 }, overall: 6.5 }] }),
  });
  try {
    assert.equal(errorsOf(inspectGallery(root)).length >= 2, true);
  } finally {
    cleanup();
  }
});

test('craft averages human judges over their axes and ignores model judges', () => {
  const { root, cleanup } = makeRepo({
    // Same compliance (1/2) for every model; only craft separates them.
    '2026-09-29-a': generation({ models: ['model-x'], ratings: [{ judge: 'human:tester', scores: { read: 1, form: 1, cohesion: 1, appeal: 1 } }] }),
    '2026-09-29-b': generation({
      models: ['model-y'],
      ratings: [
        { judge: 'human:tester', scores: STILL },
        { judge: 'human:second', scores: { read: 4, form: 4, cohesion: 4, appeal: 4 } },
        // Model judges are paused: a perfect model rating must not lift the score.
        { judge: 'model:model-z', scores: { read: 4, form: 4, cohesion: 4, appeal: 4 } },
      ],
    }),
    '2026-09-29-c': generation({ models: ['model-w'], ratings: [{ judge: 'model:model-z', scores: STILL }] }),
  });
  try {
    const result = inspectGallery(root);
    assert.deepEqual(errorsOf(result), []);
    const y = result.gallery.generations.find((g) => g.id === '2026-09-29-b')!;
    assert.equal(y.craft!.judges, 2);
    assert.equal(y.craft!.score, (12 / 16 + 1) / 2);
    assert.equal(y.craft!.axes.read, 3.5);
    assert.equal(y.craft!.axes.motion, undefined, 'no judge scored motion on a still');
    assert.deepEqual(y.ratings.map((rating) => rating.judge), ['human:tester', 'human:second']);
    assert.equal(result.gallery.generations.find((g) => g.id === '2026-09-29-c')!.craft, null, 'only a model rated it');
    assert.deepEqual(
      result.gallery.leaderboard.map((entry) => [entry.modelLabel, entry.craft]),
      [['model-y', (12 / 16 + 1) / 2], ['model-x', 0.25], ['model-w', 0]],
      'craft breaks a compliance tie through points; unrated counts 0',
    );
  } finally {
    cleanup();
  }
});

test('a model cannot rate its own run, and an animation needs a motion score', () => {
  const { root, cleanup } = makeRepo(
    {
      '2026-09-29-a': generation({ ratings: [{ judge: 'model:model-x', scores: STILL }] }),
      '2026-09-29-b': generation({
        files: [
          { path: 'cover.png', role: 'cover' },
          { path: 'knight.aseprite', role: 'source' },
          { path: 'anim.gif', role: 'animation' },
        ],
        ratings: [{ judge: 'human:tester', scores: STILL }],
      }),
    },
    { '2026-09-29-b': { 'anim.gif': Buffer.from('GIF89a\0\0') } },
  );
  try {
    const errors = errorsOf(inspectGallery(root));
    assert.ok(errors.some((message) => message.includes('cannot rate a run it took part in')));
    assert.ok(errors.some((message) => message.includes('score its motion')));
  } finally {
    cleanup();
  }
});

function writePack(root: string, id: string, data: Record<string, unknown> | null, extraFiles: Record<string, string> = {}) {
  const dir = join(root, 'packs', id);
  mkdirSync(dir, { recursive: true });
  if (data) writeFileSync(join(dir, 'pack.yaml'), stringify(data));
  for (const [name, text] of Object.entries(extraFiles)) writeFileSync(join(dir, name), text);
}

const pack = (...generations: string[]) => ({ title: 'A pack', generations });

test('without a packs folder there are no packs and no error', () => {
  const { root, cleanup } = makeRepo({ '2026-09-29-a': generation() });
  try {
    const result = inspectGallery(root);
    assert.deepEqual(errorsOf(result), []);
    assert.deepEqual(result.gallery.packs, []);
    assert.equal(result.gallery.generations[0]!.pack, null);
  } finally {
    cleanup();
  }
});

test('a pack back-references its members and sorts by newest member', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation(),
    '2026-09-30-b': generation({ date: '2026-09-30' }),
    '2026-09-30-c': generation({ date: '2026-09-30' }),
    '2026-09-29-d': generation(),
    '2026-10-01-e': generation({ date: '2026-10-01' }),
    '2026-09-29-f': generation(),
    '2026-09-29-loose': generation(),
  });
  try {
    writePack(root, 'zz', { title: 'Zed', description: 'Oldest listed first.', generations: ['2026-09-29-a', '2026-09-30-b'] }, { '.DS_Store': '' });
    writePack(root, 'aa', pack('2026-09-30-c', '2026-09-29-d'));
    writePack(root, 'mid', pack('2026-10-01-e', '2026-09-29-f'));
    const result = inspectGallery(root);
    assert.deepEqual(errorsOf(result), []);
    const { packs, generations } = result.gallery;
    assert.deepEqual(packs.map((p) => p.id), ['mid', 'zz', 'aa'], 'newest member first, ties by id descending like generations');
    assert.deepEqual(packs.map((p) => p.date), ['2026-10-01', '2026-09-30', '2026-09-30'], "a pack's date is its newest member's");
    const zz = packs.find((p) => p.id === 'zz')!;
    assert.deepEqual(zz.generations.map((g) => g.id), ['2026-09-30-b', '2026-09-29-a'], 'equal scores: newer first, not pack.yaml order');
    assert.equal(zz.title, 'Zed');
    assert.equal(zz.description, 'Oldest listed first.');
    const packOf = Object.fromEntries(generations.map((g) => [g.id, g.pack]));
    assert.equal(packOf['2026-09-29-a'], 'zz');
    assert.equal(packOf['2026-09-30-b'], 'zz');
    assert.equal(packOf['2026-09-30-c'], 'aa');
    assert.equal(packOf['2026-10-01-e'], 'mid');
    assert.equal(packOf['2026-09-29-loose'], null);
    assert.equal(zz.generations[1], generations.find((g) => g.id === '2026-09-29-a'), 'members are the loaded generations');
  } finally {
    cleanup();
  }
});

test('a pack needs two members, a title and no unknown fields', () => {
  const { root, cleanup } = makeRepo({ '2026-09-29-a': generation(), '2026-09-29-b': generation() });
  try {
    writePack(root, 'one', pack('2026-09-29-a'));
    writePack(root, 'untitled', { generations: ['2026-09-29-a', '2026-09-29-b'] });
    writePack(root, 'typo', { ...pack('2026-09-29-a', '2026-09-29-b'), descripton: 'x' });
    writePack(root, 'badid', pack('2026-09-29-a', 'not-a-generation-folder'));
    const result = inspectGallery(root);
    const where = (id: string) => result.problems.filter((p) => p.where === `gallery/packs/${id}/pack.yaml`).map((p) => p.message);
    assert.ok(where('one').some((m) => /generations/.test(m)));
    assert.ok(where('untitled').some((m) => /title/.test(m)));
    assert.ok(where('typo').some((m) => /descripton/.test(m)));
    assert.ok(where('badid').some((m) => /generation folder name/.test(m)));
    assert.deepEqual(result.gallery.packs, []);
    assert.ok(result.gallery.generations.every((g) => g.pack === null));
  } finally {
    cleanup();
  }
});

test('a pack shows its members best-first by points; unscored runs come last, newest first', () => {
  const rate = (overall: number) => [{ judge: 'human:tester', scores: { read: 1, form: 1, cohesion: 1, appeal: 1 }, overall }];
  const { root, cleanup } = makeRepo({
    '2026-09-29-low': generation({ models: ['m1'], ratings: rate(2) }),
    '2026-09-29-high': generation({ models: ['m2'], ratings: rate(9) }),
    '2026-09-29-mid': generation({ models: ['m3'], ratings: rate(5) }),
    '2026-09-30-free': generation({ date: '2026-09-30', benchmark: undefined }),
    '2026-10-01-free': generation({ date: '2026-10-01', benchmark: undefined }),
  });
  try {
    writePack(root, 'p', { title: 'P', generations: ['2026-09-30-free', '2026-09-29-low', '2026-10-01-free', '2026-09-29-mid', '2026-09-29-high'] });
    const result = inspectGallery(root);
    assert.deepEqual(errorsOf(result), []);
    assert.deepEqual(
      result.gallery.packs[0]!.generations.map((g) => g.id),
      ['2026-09-29-high', '2026-09-29-mid', '2026-09-29-low', '2026-10-01-free', '2026-09-30-free'],
    );
  } finally {
    cleanup();
  }
});

test('a pack folder must be a slug and hold pack.yaml', () => {
  const { root, cleanup } = makeRepo({ '2026-09-29-a': generation(), '2026-09-29-b': generation() });
  try {
    writePack(root, 'Bad_Name', pack('2026-09-29-a', '2026-09-29-b'));
    writePack(root, 'empty', null);
    const result = inspectGallery(root);
    const problems = result.problems.map((p) => `${p.where}: ${p.message}`);
    assert.ok(problems.some((p) => /gallery\/packs\/Bad_Name\/pack\.yaml: pack folder must be a lowercase slug/.test(p)));
    assert.ok(problems.some((p) => /gallery\/packs\/empty\/pack\.yaml: file is missing/.test(p)));
    assert.deepEqual(result.gallery.packs, []);
  } finally {
    cleanup();
  }
});

test('a pack member must be a valid generation — unknown and rejected are told apart', () => {
  const { root, cleanup } = makeRepo({
    '2026-09-29-a': generation(),
    '2026-09-29-bad': generation({ plugin: '9.9.9' }),
  });
  try {
    writePack(root, 'ghost', pack('2026-09-29-a', '2026-09-29-nope'));
    writePack(root, 'broken', pack('2026-09-29-a', '2026-09-29-bad'));
    const result = inspectGallery(root);
    const messages = (id: string) => result.problems.filter((p) => p.where === `gallery/packs/${id}/pack.yaml`).map((p) => p.message);
    assert.ok(messages('ghost').some((m) => /"2026-09-29-nope" does not exist/.test(m)));
    assert.ok(messages('broken').some((m) => /"2026-09-29-bad" was rejected by validation/.test(m)));
    assert.deepEqual(result.gallery.packs, [], 'a pack with a bad member is skipped whole');
    assert.equal(result.gallery.generations.find((g) => g.id === '2026-09-29-a')!.pack, null);
  } finally {
    cleanup();
  }
});

test('a generation cannot be listed twice in a pack or in two packs', () => {
  const { root, cleanup } = makeRepo({ '2026-09-29-a': generation(), '2026-09-29-b': generation(), '2026-09-29-c': generation() });
  try {
    writePack(root, 'twice', pack('2026-09-29-a', '2026-09-29-a', '2026-09-29-b'));
    writePack(root, 'first', pack('2026-09-29-c', '2026-09-29-b'));
    const result = inspectGallery(root);
    const messages = (id: string) => result.problems.filter((p) => p.where === `gallery/packs/${id}/pack.yaml`).map((p) => p.message);
    assert.ok(messages('twice').some((m) => /"2026-09-29-a" is listed twice/.test(m)));
    assert.ok(messages('twice').some((m) => /"2026-09-29-b" is also listed in pack "first"/.test(m)));
    assert.ok(messages('first').some((m) => /"2026-09-29-b" is also listed in pack "twice"/.test(m)));
    assert.deepEqual(result.gallery.packs, []);
    assert.ok(result.gallery.generations.every((g) => g.pack === null));
  } finally {
    cleanup();
  }
});

test('a pack folder holds only pack.yaml', () => {
  const { root, cleanup } = makeRepo({ '2026-09-29-a': generation(), '2026-09-29-b': generation() });
  try {
    writePack(root, 'cluttered', pack('2026-09-29-a', '2026-09-29-b'), { 'cover.png': 'x' });
    const result = inspectGallery(root);
    assert.ok(result.problems.some((p) => p.where === 'gallery/packs/cluttered/pack.yaml' && /unexpected "cover\.png"/.test(p.message)));
    assert.deepEqual(result.gallery.packs, []);
  } finally {
    cleanup();
  }
});
