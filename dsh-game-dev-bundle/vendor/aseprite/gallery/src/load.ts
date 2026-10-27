import { existsSync, openSync, readFileSync, readSync, closeSync, readdirSync, lstatSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import type { z } from 'zod';
import {
  craftAxes,
  generationSchema,
  packSchema,
  promptSchema,
  type CraftAxis,
  type GenerationFile,
  type GenerationFileEntry,
  type PackFile,
  type PromptFile,
  type Rating,
} from './schema.ts';

/** GitHub rejects a push containing any file over 100 MiB; stay clear of it. */
export const MAX_FILE_BYTES = 95 * 1024 * 1024;
/** GitHub warns on every push above 50 MiB — worth telling the author. */
export const WARN_FILE_BYTES = 50 * 1024 * 1024;

const GENERATION_DIR = /^(\d{4}-\d{2}-\d{2})-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PROMPT_DIR = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/**
 * Files a generation folder may hold without listing them. `.DS_Store` is
 * ignored by git anyway; anything else a reviewer would have to open blind.
 */
const UNLISTED_ALLOWED = new Set(['generation.yaml', '.DS_Store']);
/** Non-folder entries tolerated beside the prompt and generation folders. */
const STRAY_ALLOWED = new Set(['.gitkeep', '.DS_Store']);
const PACK_DIR = PROMPT_DIR;
const PACK_UNLISTED_ALLOWED = new Set(['pack.yaml', '.DS_Store']);

export interface Problem {
  level: 'error' | 'warning';
  /** Repository-relative path the problem is about. */
  where: string;
  message: string;
}

export interface PluginRelease {
  version: string;
  date: string | null;
}

export interface Prompt extends PromptFile {
  id: string;
}

export interface StoredFile extends GenerationFileEntry {
  /** Absolute path on disk. */
  absolutePath: string;
  bytes: number;
  extension: string;
}

export interface Score {
  passed: number;
  total: number;
}

/** Relative weights of the composite score; they sum to 1. */
export const scoreWeights = { compliance: 0.35, craft: 0.5, speed: 0.15 } as const;

export interface ScoreComponents {
  /** Criteria passed ÷ total, 0–1. */
  compliance: number;
  /** Mean judge craft, 0–1; 0 when unrated. */
  craft: number;
  /** Fastest measured run ÷ this run, 0–1; 0 when unmeasured. */
  speed: number;
  /** Total wall minutes, null when any step lacks a time. */
  minutes: number | null;
}

/** Judges' craft scores for one run, averaged. */
export interface Craft {
  /** Mean over judges of each judge's mean axis score, scaled to 0–1. */
  score: number;
  /** Per-axis mean over the judges, 0–4. An axis no judge scored is absent. */
  axes: Partial<Record<CraftAxis, number>>;
  judges: number;
}

/** Members stay in the order pack.yaml lists them — that is the page's display order. */
export interface Pack extends Omit<PackFile, 'generations'> {
  id: string;
  /** The newest member's date: where the pack sorts among loose generations. */
  date: string;
  generations: Generation[];
}

export interface Generation extends Omit<GenerationFile, 'files'> {
  id: string;
  files: StoredFile[];
  cover: StoredFile;
  /**
   * The benchmark's model axis: models in sorted order joined with " + ", plus
   * the reference pipeline when there was one ("… · concept by gpt-image-2").
   */
  modelLabel: string;
  /** Set when `benchmark` is present. */
  score: Score | null;
  /** True when the run used an older revision of its benchmark prompt. */
  outdated: boolean;
  /** Null until someone rates the run. */
  craft: Craft | null;
  /** Composite 0–100; null for outdated runs and runs outside a benchmark. */
  points: number | null;
  /** The parts points are made of; null exactly when `points` is. */
  components: ScoreComponents | null;
  /** Id of the pack this run belongs to; packed runs are shown under their pack's tile, not loose. */
  pack: string | null;
}

export interface BenchmarkCell {
  modelLabel: string;
  plugin: string;
  /** Best run first. */
  runs: Generation[];
  best: Score;
  /** Craft of the best run (the one the cell shows); null when it is unrated. */
  craft: Craft | null;
  /** Points (0–100) of the best run. */
  points: number;
  /** Components of the best run. */
  components: ScoreComponents;
}

export interface Benchmark {
  prompt: Prompt;
  /** Plugin versions that have at least one current-revision run, newest first. */
  versions: string[];
  /** Model labels, highest points first. */
  models: string[];
  cells: BenchmarkCell[];
  /** Runs against older revisions of this prompt; listed, never ranked. */
  outdatedRuns: Generation[];
}

export interface Gallery {
  root: string;
  releases: PluginRelease[];
  prompts: Prompt[];
  /** Newest first. */
  generations: Generation[];
  /** Newest member first. */
  packs: Pack[];
  benchmarks: Benchmark[];
  /** Overall model ranking across every benchmark, best first. */
  leaderboard: LeaderboardEntry[];
}

export interface LeaderboardEntry {
  modelLabel: string;
  /**
   * Mean points (0–100) over every benchmark of the suite, using the model's
   * best current-revision cell on each. A benchmark it never ran counts 0, so
   * one easy win cannot outrank a model that ran everything.
   */
  score: number;
  /** Mean compliance, 0–1, over the same set (unrun benchmark = 0). */
  compliance: number;
  /** Mean craft, 0–1, over the same set (unrated or unrun = 0). */
  craft: number;
  /** Mean speed, 0–1, over the same set (unmeasured or unrun = 0). */
  speed: number;
  /** Benchmarks with at least one ranked run, out of `Gallery.benchmarks.length`. */
  benchmarks: number;
  runs: number;
  /** The model's best cell per benchmark, keyed by prompt id. */
  best: Record<string, BenchmarkCell>;
  /**
   * The score this entry would have shown at the end of each day ranked runs
   * were added, oldest first, from the model's first run on. Past runs are
   * scored as they are today and the suite is today's, so the last point is
   * `score` exactly and the line only moves when the model's own runs do.
   */
  history: LeaderboardSnapshot[];
}

export interface LeaderboardSnapshot {
  /** A day on which any model added a ranked run. */
  date: string;
  /** Mean points, 0–100, from the runs dated on or before `date`. */
  score: number;
  /** Benchmarks with a ranked run by then. */
  benchmarks: number;
  /** True when this model itself added a run that day. */
  ran: boolean;
}

export interface LoadResult {
  gallery: Gallery;
  problems: Problem[];
}

export class GalleryError extends Error {
  readonly problems: Problem[];
  constructor(problems: Problem[]) {
    super(
      `gallery has ${problems.length} error(s):\n` +
        problems.map((problem) => `  ${problem.where}: ${problem.message}`).join('\n'),
    );
    this.name = 'GalleryError';
    this.problems = problems;
  }
}

export const DEFAULT_GALLERY_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Reads, validates and cross-checks the whole gallery. Never throws on bad data — see `problems`. */
export function inspectGallery(root: string = DEFAULT_GALLERY_ROOT): LoadResult {
  const galleryRoot = resolve(root);
  const repoRoot = resolve(galleryRoot, '..');
  const problems: Problem[] = [];
  const rel = (path: string) => path.slice(repoRoot.length + 1).replaceAll('\\', '/');

  const releases = readReleases(join(repoRoot, 'CHANGELOG.md'), problems);
  const releasesByVersion = new Map(releases.map((release) => [release.version, release]));
  // Benchmark results are the project's own measurements. The allowlist makes
  // that a data rule, so even a merged mistake cannot put an outsider's run on
  // the leaderboard.
  const maintainersPath = join(galleryRoot, 'MAINTAINERS');
  const maintainers = new Set(
    existsSync(maintainersPath)
      ? readFileSync(maintainersPath, 'utf8')
          .split('\n')
          .map((line) => line.trim().toLowerCase())
          .filter((line) => line !== '' && !line.startsWith('#'))
      : [],
  );

  const prompts = readPrompts(join(galleryRoot, 'prompts'), problems, rel);
  const promptsById = new Map(prompts.map((prompt) => [prompt.id, prompt]));

  const generations: Generation[] = [];
  const generationsDir = join(galleryRoot, 'generations');
  const folders = listDirs(generationsDir, problems, rel);
  for (const id of folders) {
    const dir = join(generationsDir, id);
    const where = rel(join(dir, 'generation.yaml'));
    const dirMatch = GENERATION_DIR.exec(id);
    if (!dirMatch) {
      problems.push({ level: 'error', where: rel(dir), message: 'folder must be named <yyyy-mm-dd>-<slug>, e.g. 2026-09-29-knight-slash' });
      continue;
    }
    const data = readYaml(join(dir, 'generation.yaml'), generationSchema, where, problems);
    if (!data) continue;

    if (data.date !== dirMatch[1]) {
      problems.push({ level: 'error', where, message: `date ${data.date} does not match the folder prefix ${dirMatch[1]}` });
    }
    const release = releasesByVersion.get(data.plugin);
    if (!release) {
      problems.push({
        level: 'error',
        where,
        message: `plugin ${data.plugin} is not a released version in CHANGELOG.md (known: ${releases.map((r) => r.version).join(', ')})`,
      });
    } else if (release.date !== null && data.date < release.date) {
      // A run cannot have used a build that did not exist yet; this is either
      // a typo in one of the two fields or a dev build passed off as a release.
      problems.push({ level: 'error', where, message: `dated ${data.date}, before plugin ${data.plugin} was released on ${release.date}` });
    }

    const files = checkFiles(dir, data.files, problems, rel);
    if (!files) continue;

    let score: Score | null = null;
    let outdated = false;
    if (data.benchmark) {
      if (!data.author.github || !maintainers.has(data.author.github.toLowerCase())) {
        problems.push({
          level: 'error',
          where,
          message: 'benchmark runs are submitted by maintainers only (gallery/MAINTAINERS) — remove the benchmark block to submit a gallery generation',
        });
        continue;
      }
      const prompt = promptsById.get(data.benchmark.prompt);
      if (!prompt) {
        problems.push({ level: 'error', where, message: `benchmark prompt "${data.benchmark.prompt}" does not exist in gallery/prompts` });
        continue;
      }
      const checked = checkBenchmark(data, prompt, where, problems);
      if (!checked) continue;
      score = checked.score;
      outdated = checked.outdated;
    }

    const cover = files.find((file) => file.role === 'cover')!;
    // The benchmark's model axis: the same set of models is the same row no
    // matter which order the author listed them in. A run that redrew an image
    // model's concept is a different pipeline, so it gets its own row rather
    // than lifting (or sinking) the pixel-only score of the same agent model.
    const refs = data.references;
    const pipeline =
      refs.source === 'generated'
        ? ` · concept by ${[...new Set(refs.imageModels)].sort().join(' + ')}`
        : refs.source === 'supplied'
          ? ' · supplied reference'
          : '';
    const modelLabel = [...new Set(data.models)].sort().join(' + ') + pipeline;
    // Only human ratings reach the site and the score; `model:` judges stay valid in the schema
    // so a file can carry one, but a model's craft opinion is not what the benchmark measures.
    const ratings = data.ratings.filter((rating) => rating.judge.startsWith('human:'));
    generations.push({ ...data, ratings, id, files, cover, modelLabel, score, outdated, craft: craftOf(ratings), points: null, components: null, pack: null });
  }

  generations.sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)));
  // A run can load and still carry an error (a date or plugin mismatch), and
  // loadGallery refuses to build on it — so "valid" means no error under its folder.
  const rejected = new Set(
    folders.filter((id) => {
      const folder = rel(join(generationsDir, id));
      return problems.some((p) => p.level === 'error' && (p.where === folder || p.where.startsWith(`${folder}/`)));
    }),
  );
  const packs = readPacks(join(galleryRoot, 'packs'), generations, new Set(folders), rejected, problems, rel);

  const benchmarks = prompts.map((prompt) => buildBenchmark(prompt, generations, releases));
  const leaderboard = buildLeaderboard(benchmarks);
  // Members are shown best-first by score, so the order in pack.yaml does not matter and the
  // cover (generations[0]) is the pack's best run. Scored runs by compareRuns, unscored newest first.
  for (const pack of packs) pack.generations.sort(comparePackMembers);

  return { gallery: { root: galleryRoot, releases, prompts, generations, packs, benchmarks, leaderboard }, problems };
}

/** Loads the gallery for consumers that must not render bad data (the web build). */
export function loadGallery(root?: string): Gallery {
  const { gallery, problems } = inspectGallery(root);
  const errors = problems.filter((problem) => problem.level === 'error');
  if (errors.length > 0) throw new GalleryError(errors);
  return gallery;
}

/**
 * Reads gallery/packs and links each accepted pack to its members. A pack with
 * any problem is reported and left out, and its members keep `pack: null`, so
 * one bad pack does not cascade into errors about its members. The site build
 * still refuses to run on any error (`loadGallery`).
 */
function readPacks(
  dir: string,
  generations: Generation[],
  folders: Set<string>,
  rejected: Set<string>,
  problems: Problem[],
  rel: (path: string) => string,
): Pack[] {
  const byId = new Map(generations.filter((generation) => !rejected.has(generation.id)).map((generation) => [generation.id, generation]));
  const parsed: { id: string; where: string; data: PackFile; errors: string[] }[] = [];

  for (const id of listDirs(dir, problems, rel)) {
    const packDir = join(dir, id);
    const where = rel(join(packDir, 'pack.yaml'));
    if (!PACK_DIR.test(id)) {
      problems.push({ level: 'error', where, message: 'pack folder must be a lowercase slug' });
      continue;
    }
    const errors: string[] = [];
    for (const entry of readdirSync(packDir)) {
      if (!PACK_UNLISTED_ALLOWED.has(entry)) errors.push(`unexpected "${entry}" — a pack folder holds only pack.yaml`);
    }
    const data = readYaml(join(packDir, 'pack.yaml'), packSchema, where, problems);
    if (!data) {
      for (const message of errors) problems.push({ level: 'error', where, message });
      continue;
    }

    const seen = new Set<string>();
    for (const member of data.generations) {
      if (seen.has(member)) errors.push(`generation "${member}" is listed twice`);
      seen.add(member);
      if (byId.has(member)) continue;
      errors.push(
        folders.has(member)
          ? `generation "${member}" was rejected by validation — fix it or remove it from the pack`
          : `generation "${member}" does not exist in gallery/generations`,
      );
    }
    parsed.push({ id, where, data, errors });
  }

  // Membership is exclusive: the grid shows a generation under one tile only.
  const owners = new Map<string, string[]>();
  for (const pack of parsed) {
    for (const member of new Set(pack.data.generations)) owners.set(member, [...(owners.get(member) ?? []), pack.id]);
  }
  for (const pack of parsed) {
    for (const member of new Set(pack.data.generations)) {
      const others = (owners.get(member) ?? []).filter((id) => id !== pack.id);
      if (others.length > 0) pack.errors.push(`generation "${member}" is also listed in pack ${others.map((id) => `"${id}"`).join(', ')} — a generation belongs to one pack`);
    }
  }

  const packs: Pack[] = [];
  for (const { id, where, data, errors } of parsed) {
    if (errors.length > 0) {
      for (const message of errors) problems.push({ level: 'error', where, message });
      continue;
    }
    const members = data.generations.map((member) => byId.get(member)!);
    for (const member of members) member.pack = id;
    const date = members.reduce((latest, member) => (member.date > latest ? member.date : latest), '');
    packs.push({ ...data, id, date, generations: members });
  }

  // The same order as generations: newest first, then id descending.
  return packs.sort((a, b) => (a.date === b.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date)));
}

function comparePackMembers(a: Generation, b: Generation): number {
  if (a.points !== null && b.points !== null) return compareRuns(a, b);
  if (a.points !== null) return -1;
  if (b.points !== null) return 1;
  return b.date === a.date ? b.id.localeCompare(a.id) : b.date.localeCompare(a.date);
}

function readReleases(changelogPath: string, problems: Problem[]): PluginRelease[] {
  if (!existsSync(changelogPath)) {
    problems.push({ level: 'error', where: 'CHANGELOG.md', message: 'missing — plugin versions are validated against it' });
    return [];
  }
  const releases: PluginRelease[] = [];
  const heading = /^## \[(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)\](?:\s+[—–-]\s+(\d{4}-\d{2}-\d{2}))?/gm;
  const text = readFileSync(changelogPath, 'utf8');
  for (const match of text.matchAll(heading)) {
    releases.push({ version: match[1]!, date: match[2] ?? null });
  }
  releases.sort((a, b) => compareVersions(b.version, a.version));
  return releases;
}

function readPrompts(dir: string, problems: Problem[], rel: (path: string) => string): Prompt[] {
  const prompts: Prompt[] = [];
  for (const id of listDirs(dir, problems, rel)) {
    const promptDir = join(dir, id);
    if (!PROMPT_DIR.test(id)) {
      problems.push({ level: 'error', where: rel(promptDir), message: 'prompt folder must be a lowercase slug' });
      continue;
    }
    const data = readYaml(join(promptDir, 'prompt.yaml'), promptSchema, rel(join(promptDir, 'prompt.yaml')), problems);
    if (data) prompts.push({ ...data, id });
  }
  return prompts.sort((a, b) => a.title.localeCompare(b.title));
}

function readYaml<S extends z.ZodType>(path: string, schema: S, where: string, problems: Problem[]): z.output<S> | null {
  if (!existsSync(path)) {
    problems.push({ level: 'error', where, message: 'file is missing' });
    return null;
  }
  let raw: unknown;
  try {
    raw = parseYaml(readFileSync(path, 'utf8'));
  } catch (error) {
    problems.push({ level: 'error', where, message: `not valid YAML: ${(error as Error).message}` });
    return null;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const at = issue.path.length > 0 ? `${issue.path.join('.')}: ` : '';
      problems.push({ level: 'error', where, message: `${at}${issue.message}` });
    }
    return null;
  }
  return parsed.data;
}

function checkFiles(
  dir: string,
  entries: GenerationFileEntry[],
  problems: Problem[],
  rel: (path: string) => string,
): StoredFile[] | null {
  const listed = new Set(entries.map((entry) => entry.path));
  let ok = true;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (listed.has(entry.name)) continue;
    if (UNLISTED_ALLOWED.has(entry.name) && entry.isFile()) continue;
    problems.push({ level: 'error', where: rel(join(dir, entry.name)), message: 'not listed in generation.yaml files — list it or remove it' });
    ok = false;
  }

  const files: StoredFile[] = [];
  for (const entry of entries) {
    const absolutePath = join(dir, entry.path);
    const where = rel(absolutePath);
    // lstat, not stat: a symlink would pass as whatever it points at and the
    // site build would publish that file — anything in the repository.
    const info = existsSync(absolutePath) ? lstatSync(absolutePath) : null;
    if (!info || info.isSymbolicLink() || !info.isFile()) {
      problems.push({ level: 'error', where, message: info?.isSymbolicLink() ? 'is a symlink — commit the file itself' : 'listed in generation.yaml but missing' });
      ok = false;
      continue;
    }
    const bytes = info.size;
    if (bytes > MAX_FILE_BYTES) {
      problems.push({ level: 'error', where, message: `${mib(bytes)} MiB is over the ${mib(MAX_FILE_BYTES)} MiB limit (GitHub rejects files over 100 MiB)` });
      ok = false;
    } else if (bytes > WARN_FILE_BYTES) {
      problems.push({ level: 'warning', where, message: `${mib(bytes)} MiB — GitHub warns above 50 MiB; export a smaller preview if you can` });
    }
    const extension = entry.path.slice(entry.path.lastIndexOf('.') + 1).toLowerCase();
    const mismatch = checkMagic(absolutePath, extension);
    if (mismatch) {
      problems.push({ level: 'error', where, message: mismatch });
      ok = false;
    }
    files.push({ ...entry, absolutePath, bytes, extension });
  }
  return ok ? files : null;
}

/** Catches a renamed or truncated file before it reaches the gallery. */
function checkMagic(path: string, extension: string): string | null {
  const head = Buffer.alloc(8);
  const fd = openSync(path, 'r');
  let read: number;
  try {
    read = readSync(fd, head, 0, 8, 0);
  } finally {
    closeSync(fd);
  }
  switch (extension) {
    case 'png':
      return read === 8 && head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ? null : 'not a PNG file';
    case 'gif':
      return read >= 4 && head.toString('latin1', 0, 4) === 'GIF8' ? null : 'not a GIF file';
    case 'webp':
      return read >= 4 && head.toString('latin1', 0, 4) === 'RIFF' ? null : 'not a WebP file';
    case 'aseprite':
    case 'ase':
      // Aseprite header: u32 file size, then the u16 magic 0xA5E0 (little endian).
      return read >= 6 && head.readUInt16LE(4) === 0xa5e0 ? null : 'not an Aseprite file (magic 0xA5E0 missing)';
    case 'json':
      try {
        JSON.parse(readFileSync(path, 'utf8'));
        return null;
      } catch {
        return 'not valid JSON';
      }
    default:
      return null;
  }
}

function checkBenchmark(
  data: GenerationFile,
  prompt: Prompt,
  where: string,
  problems: Problem[],
): { score: Score; outdated: boolean } | null {
  const benchmark = data.benchmark!;
  if (benchmark.revision > prompt.revision) {
    problems.push({ level: 'error', where, message: `prompt "${prompt.id}" is at revision ${prompt.revision}; revision ${benchmark.revision} does not exist yet` });
    return null;
  }
  const outdated = benchmark.revision < prompt.revision;
  let ok = true;

  if (outdated) {
    problems.push({
      level: 'warning',
      where,
      message: `ran revision ${benchmark.revision} of "${prompt.id}" (current: ${prompt.revision}) — shown, but not ranked`,
    });
  } else {
    if (data.steps.length !== prompt.steps.length) {
      problems.push({ level: 'error', where, message: `"${prompt.id}" has ${prompt.steps.length} step(s); this run lists ${data.steps.length}` });
      ok = false;
    }
    data.steps.forEach((step, index) => {
      const expected = prompt.steps[index];
      if (expected && normalise(step.text) !== normalise(expected.text)) {
        problems.push({
          level: 'error',
          where,
          message: `steps.${index}.text differs from step ${index + 1} of "${prompt.id}" — a benchmark run must send the prompt verbatim`,
        });
        ok = false;
      }
    });
  }

  const criteria = new Set(prompt.criteria.map((criterion) => criterion.id));
  const answered = new Set<string>();
  for (const result of benchmark.results) {
    if (!outdated && !criteria.has(result.criterion)) {
      problems.push({ level: 'error', where, message: `unknown criterion "${result.criterion}" for "${prompt.id}"` });
      ok = false;
    }
    if (answered.has(result.criterion)) {
      problems.push({ level: 'error', where, message: `criterion "${result.criterion}" is answered twice` });
      ok = false;
    }
    answered.add(result.criterion);
  }
  if (!outdated) {
    const missing = [...criteria].filter((id) => !answered.has(id));
    if (missing.length > 0) {
      problems.push({ level: 'error', where, message: `unanswered criteria: ${missing.join(', ')} — record a fail rather than leaving one out` });
      ok = false;
    }
  }

  if (!ok) return null;
  const passed = benchmark.results.filter((result) => result.pass).length;
  return { score: { passed, total: benchmark.results.length }, outdated };
}

function buildLeaderboard(benchmarks: Benchmark[]): LeaderboardEntry[] {
  const byModel = new Map<string, LeaderboardEntry>();
  for (const benchmark of benchmarks) {
    for (const cell of benchmark.cells) {
      let entry = byModel.get(cell.modelLabel);
      if (!entry) {
        entry = { modelLabel: cell.modelLabel, score: 0, compliance: 0, craft: 0, speed: 0, benchmarks: 0, runs: 0, best: {}, history: [] };
        byModel.set(cell.modelLabel, entry);
      }
      entry.runs += cell.runs.length;
      // A model can hold several cells on one benchmark (one per plugin version);
      // its standing there is its best one.
      const held = entry.best[benchmark.prompt.id];
      if (!held || compareRuns(cell.runs[0]!, held.runs[0]!) < 0) entry.best[benchmark.prompt.id] = cell;
    }
  }
  const entries = [...byModel.values()];
  const suite = benchmarks.length;
  for (const entry of entries) {
    const cells = Object.values(entry.best);
    entry.benchmarks = cells.length;
    const mean = (pick: (cell: BenchmarkCell) => number) => (suite === 0 ? 0 : cells.reduce((sum, cell) => sum + pick(cell), 0) / suite);
    entry.score = mean((cell) => cell.points);
    entry.compliance = mean((cell) => cell.components.compliance);
    entry.craft = mean((cell) => cell.components.craft);
    entry.speed = mean((cell) => cell.components.speed);
  }
  const days = [...new Set(benchmarks.flatMap((benchmark) => benchmark.cells.flatMap((cell) => cell.runs.map((run) => run.date))))].sort();
  for (const entry of entries) entry.history = leaderboardHistory(entry.modelLabel, benchmarks, days);
  return entries.sort((a, b) => b.score - a.score || b.benchmarks - a.benchmarks || a.modelLabel.localeCompare(b.modelLabel));
}

/**
 * Replays one model's leaderboard score day by day. Its standing on a benchmark
 * is its highest-points run so far — the same run `buildLeaderboard` ranks by,
 * since `compareRuns` orders by points first.
 */
function leaderboardHistory(modelLabel: string, benchmarks: Benchmark[], days: string[]): LeaderboardSnapshot[] {
  const runsByBenchmark = benchmarks.map((benchmark) =>
    benchmark.cells.filter((cell) => cell.modelLabel === modelLabel).flatMap((cell) => cell.runs),
  );
  const own = new Set(runsByBenchmark.flat().map((run) => run.date));
  const first = [...own].sort()[0];
  const suite = benchmarks.length;
  return days
    .filter((day) => first !== undefined && day >= first)
    .map((day) => {
      let total = 0;
      let covered = 0;
      for (const runs of runsByBenchmark) {
        const held = runs.filter((run) => run.date <= day);
        if (held.length === 0) continue;
        covered += 1;
        total += Math.max(...held.map((run) => run.points!));
      }
      return { date: day, score: suite === 0 ? 0 : total / suite, benchmarks: covered, ran: own.has(day) };
    });
}

function craftOf(ratings: Rating[]): Craft | null {
  if (ratings.length === 0) return null;
  const axes: Partial<Record<CraftAxis, number>> = {};
  for (const axis of craftAxes) {
    const given = ratings.flatMap((rating) => (rating.scores[axis] === undefined ? [] : [rating.scores[axis]]));
    if (given.length > 0) axes[axis] = given.reduce((sum, value) => sum + value, 0) / given.length;
  }
  const perJudge = ratings.map((rating) => {
    if (rating.overall !== undefined) return rating.overall / 10;
    const values = Object.values(rating.scores);
    return values.reduce((sum, value) => sum + value, 0) / values.length / 4;
  });
  return { score: perJudge.reduce((sum, value) => sum + value, 0) / perJudge.length, axes, judges: ratings.length };
}

function buildBenchmark(prompt: Prompt, generations: Generation[], releases: PluginRelease[]): Benchmark {
  const runs = generations.filter((generation) => generation.benchmark?.prompt === prompt.id);
  const current = runs.filter((run) => !run.outdated);
  const outdatedRuns = runs.filter((run) => run.outdated);

  const minutes = new Map<Generation, number | null>(current.map((run) => [run, runMinutes(run)]));
  const measured = [...minutes.values()].filter((value): value is number => value !== null);
  const fastest = measured.length === 0 ? null : Math.min(...measured);
  for (const run of current) {
    const own = minutes.get(run)!;
    run.components = scoreComponents(run, own, fastest);
    run.points = pointsOf(run.components);
  }

  const cellsByKey = new Map<string, BenchmarkCell>();
  for (const run of current) {
    const key = `${run.modelLabel}\u0000${run.plugin}`;
    let cell = cellsByKey.get(key);
    if (!cell) {
      cell = { modelLabel: run.modelLabel, plugin: run.plugin, runs: [], best: { passed: 0, total: 0 }, craft: null, points: 0, components: ZERO_COMPONENTS };
      cellsByKey.set(key, cell);
    }
    cell.runs.push(run);
  }
  const cells = [...cellsByKey.values()];
  for (const cell of cells) {
    cell.runs.sort(compareRuns);
    const best = cell.runs[0]!;
    cell.best = best.score!;
    cell.craft = best.craft;
    cell.points = best.points!;
    cell.components = best.components!;
  }

  const releaseOrder = new Map(releases.map((release, index) => [release.version, index]));
  const versions = [...new Set(cells.map((cell) => cell.plugin))].sort(
    (a, b) => (releaseOrder.get(a) ?? Infinity) - (releaseOrder.get(b) ?? Infinity),
  );

  const bestByModel = new Map<string, number>();
  for (const cell of cells) {
    bestByModel.set(cell.modelLabel, Math.max(bestByModel.get(cell.modelLabel) ?? 0, cell.points));
  }
  const models = [...bestByModel.keys()].sort((a, b) => bestByModel.get(b)! - bestByModel.get(a)! || a.localeCompare(b));

  return { prompt, versions, models, cells, outdatedRuns };
}

const ZERO_COMPONENTS: ScoreComponents = { compliance: 0, craft: 0, speed: 0, minutes: null };

/** Sum of step minutes, or null unless every step of the run has a measured time. */
function runMinutes(run: Generation): number | null {
  let total = 0;
  for (let step = 1; step <= run.steps.length; step++) {
    const value = run.metrics.find((metrics) => metrics.step === step)?.minutes;
    if (value === undefined) return null;
    total += value;
  }
  return total;
}

/** Speed is the fastest measured run's minutes over this run's; unmeasured is 0 here and left out of `pointsOf`. */
export function scoreComponents(run: Pick<Generation, 'score' | 'craft'>, minutes: number | null, fastest: number | null): ScoreComponents {
  return {
    compliance: run.score ? ratio(run.score) : 0,
    craft: run.craft?.score ?? 0,
    speed: minutes === null || fastest === null ? 0 : fastest / minutes,
    minutes,
  };
}

export function pointsOf(components: ScoreComponents): number {
  // A run with no recorded time is not penalised for speed: speed drops out and the other
  // parts are rescaled to 0–100, so a missing measurement neither helps nor hurts.
  const speed = components.minutes === null ? 0 : scoreWeights.speed;
  const weighted =
    (100 * (scoreWeights.compliance * components.compliance + scoreWeights.craft * components.craft + speed * components.speed)) /
    (scoreWeights.compliance + scoreWeights.craft + speed);
  // toFixed drops binary float noise so an exact .5 (32.499999… or 32.500000…1) rounds the same way every time.
  return Math.round(Number(weighted.toFixed(6)));
}

/** Best run first: points, then compliance, then craft, then newer date. */
function compareRuns(a: Generation, b: Generation): number {
  return (
    b.points! - a.points! ||
    b.components!.compliance - a.components!.compliance ||
    b.components!.craft - a.components!.craft ||
    b.date.localeCompare(a.date)
  );
}

function listDirs(dir: string, problems: Problem[], rel: (path: string) => string): string[] {
  if (!existsSync(dir)) return [];
  const dirs: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) dirs.push(entry.name);
    else if (!STRAY_ALLOWED.has(entry.name)) {
      problems.push({ level: 'error', where: rel(join(dir, entry.name)), message: 'only folders belong here — put files inside a generation, prompt or pack folder' });
    }
  }
  return dirs.sort();
}

/** YAML block scalars add a trailing newline and Windows checkouts add CRs; neither is a different prompt. */
function normalise(text: string): string {
  return text.replaceAll('\r\n', '\n').trim();
}

function ratio(score: Score): number {
  return score.total === 0 ? 0 : score.passed / score.total;
}

function mib(bytes: number): string {
  return (bytes / 1024 / 1024).toFixed(1);
}

/** Semver precedence (§11); used to order the benchmark's version axis. */
export function compareVersions(a: string, b: string): number {
  const split = (version: string) => {
    const dash = version.indexOf('-');
    return dash === -1 ? ([version, undefined] as const) : ([version.slice(0, dash), version.slice(dash + 1)] as const);
  };
  const [coreA, preA] = split(a);
  const [coreB, preB] = split(b);
  const partsA = coreA.split('.').map(Number);
  const partsB = coreB.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  if (preA === preB) return 0;
  if (preA === undefined) return 1;
  if (preB === undefined) return -1;
  const idsA = preA.split('.');
  const idsB = preB.split('.');
  for (let i = 0; i < Math.max(idsA.length, idsB.length); i++) {
    const x = idsA[i];
    const y = idsB[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const numericX = /^\d+$/.test(x);
    const numericY = /^\d+$/.test(y);
    if (numericX && numericY) {
      const diff = Number(x) - Number(y);
      if (diff !== 0) return diff;
    } else if (numericX !== numericY) {
      return numericX ? -1 : 1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}
