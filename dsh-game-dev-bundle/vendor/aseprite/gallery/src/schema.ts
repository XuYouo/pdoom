import { z } from 'zod';

/**
 * The on-disk contract for the gallery. `check` validates against it, the web
 * app builds from it, and the `aseprite:submit` skill writes files that must
 * pass it. Change a field here and all three move together.
 */

const slug = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'lowercase letters, digits and single hyphens');

/** A released plugin version as it appears in CHANGELOG.md, e.g. `0.3.2`. */
const semver = z
  .string()
  .regex(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, 'a released plugin version such as 0.3.2');

const isoDate = z.iso.date();

/** Free text that is trimmed on read — a padded model id would otherwise open its own benchmark row. */
const line = z.string().trim().min(1);

/**
 * Prompt text kept byte-for-byte, so "copy the prompt" hands back exactly what
 * was sent. Blank text is still rejected.
 */
const prose = z.string().refine((text) => text.trim().length > 0, 'must not be blank');

// ---------------------------------------------------------------------------
// Prompts — the benchmark's fixed tasks. gallery/prompts/<id>/prompt.yaml
// ---------------------------------------------------------------------------

export const promptStepSchema = z.strictObject({
  title: line,
  /**
   * Exactly what the model is handed. Compared verbatim apart from surrounding
   * whitespace and CRLF line endings, which YAML and Windows checkouts add.
   */
  text: prose,
});

export const criterionSchema = z.strictObject({
  id: slug,
  /** 1-based step this criterion judges. */
  step: z.int().positive(),
  text: line,
});

export const promptSchema = z
  .strictObject({
    title: line,
    summary: line,
    /**
     * Bump whenever a step's text, the setup or a criterion changes. Results
     * from different revisions measured different tasks and are never ranked
     * against each other.
     */
    revision: z.int().positive(),
    tags: z.array(line).default([]),
    setup: z.strictObject({
      canvas: z.strictObject({
        width: z.int().positive(),
        height: z.int().positive(),
        colorMode: z.enum(['rgb', 'indexed', 'grayscale']),
      }),
      palette: line.optional(),
      /** Setup rules beyond canvas and palette (session boundaries, what the model may see). */
      rules: z.array(line).default([]),
    }),
    steps: z.array(promptStepSchema).min(1),
    criteria: z.array(criterionSchema).min(1),
  })
  .superRefine((prompt, ctx) => {
    const seen = new Set<string>();
    prompt.criteria.forEach((criterion, index) => {
      if (seen.has(criterion.id)) {
        ctx.addIssue({ code: 'custom', path: ['criteria', index, 'id'], message: `duplicate criterion id "${criterion.id}"` });
      }
      seen.add(criterion.id);
      if (criterion.step > prompt.steps.length) {
        ctx.addIssue({
          code: 'custom',
          path: ['criteria', index, 'step'],
          message: `step ${criterion.step} does not exist — the prompt has ${prompt.steps.length}`,
        });
      }
    });
  });

// ---------------------------------------------------------------------------
// Generations — one run, its files and how it was made.
// gallery/generations/<yyyy-mm-dd>-<slug>/generation.yaml
// ---------------------------------------------------------------------------

export const fileRoles = ['cover', 'source', 'animation', 'filmstrip', 'sheet', 'frame', 'reference', 'other'] as const;

/**
 * Where the design came from. A sprite redrawn from an image model's concept
 * sheet and one invented pixel by pixel are different runs of a different
 * pipeline (docs/adr/0009-concept-first.md), and the benchmark ranks them apart.
 *  - `none`      — the agent worked from words alone;
 *  - `generated` — an image model produced concept art or a storyboard first;
 *  - `supplied`  — the author handed over existing art (a sketch, a screenshot).
 */
export const referenceSources = ['none', 'generated', 'supplied'] as const;
export const referenceKinds = ['concept-sheet', 'storyboard', 'sketch', 'screenshot', 'photo', 'other'] as const;

export const referencesSchema = z.strictObject({
  source: z.enum(referenceSources),
  /** Image models exactly as their product names them, e.g. gpt-image-2. Required for `generated`. */
  imageModels: z.array(line).default([]),
  kinds: z.array(z.enum(referenceKinds)).default([]),
  /** The image-model prompt verbatim, when the author has it — it is part of how the run was made. */
  prompt: prose.optional(),
});

export const generationFileSchema = z.strictObject({
  /** Relative to the generation's folder. No directories — keep a generation flat. */
  path: z
    .string()
    .regex(/^[\w.-]+\.(aseprite|ase|png|gif|json|webp)$/i, 'a flat file name ending in .aseprite, .ase, .png, .gif, .webp or .json')
    // SvelteKit reserves `__data.json` (and the `__` prefix) for its own data
    // requests, so such a file validates and then breaks the site build.
    .refine((path) => !path.startsWith('__'), 'must not start with "__" — the site reserves that prefix')
    // Windows cannot check out these names at all, whatever the extension.
    .refine((path) => !/^(con|prn|aux|nul|com\d|lpt\d)\./i.test(path), 'is a reserved file name on Windows'),
  role: z.enum(fileRoles),
  label: line.optional(),
  /** 1-based step that produced this file, when it belongs to one. */
  step: z.int().positive().optional(),
});

export const generationStepSchema = z.strictObject({
  /** The prompt exactly as sent — or, when `original` is set, its English rendering. */
  text: prose,
  /**
   * The prompt exactly as sent, when `text` is a translation. The gallery reads
   * in English, but the original stays: it is what the model actually saw.
   */
  original: prose.optional(),
  /** Which of `models` ran this step. Required when the generation lists more than one model. */
  model: line.optional(),
  /** Anything the author said mid-run (answers to clarifying questions). Honesty over tidiness. */
  interventions: z.array(line).default([]),
});

export const criterionResultSchema = z.strictObject({
  criterion: slug,
  pass: z.boolean(),
  note: line.optional(),
});

export const validateReportSchema = z.strictObject({
  step: z.int().positive(),
  passed: z.boolean(),
  score: z.number().min(0).max(100).optional(),
  /** Error/warning counts from `validate`, so a reviewer sees the shape without the raw dump. */
  errors: z.int().nonnegative().default(0),
  warnings: z.int().nonnegative().default(0),
});

/**
 * Craft axes, scored 0–4 against the anchors in gallery/RUBRIC.md. Criteria
 * answer "did it do what the brief said"; these answer "is it good".
 */
export const craftAxes = ['read', 'form', 'motion', 'cohesion', 'appeal'] as const;
export type CraftAxis = (typeof craftAxes)[number];

const axisScore = z.int().min(0).max(4);

export const ratingSchema = z.strictObject({
  /**
   * Who scored it: `human:<github login>` or `model:<model id>`. A model never
   * rates a run it took part in — that is grading its own homework.
   */
  judge: z
    .string()
    .regex(/^(?:human:[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})|model:[A-Za-z0-9][\w.:/-]*)$/, 'human:<github login> or model:<model id>'),
  scores: z.strictObject({
    read: axisScore,
    form: axisScore,
    /** Required when the run has an animation; absent for a still. */
    motion: axisScore.optional(),
    cohesion: axisScore,
    appeal: axisScore,
  }),
  /**
   * The judge's own 0–10 overall score. The axes above are 0–4 integers, which
   * cannot hold a 0–10 score without collapsing neighbours (4 and 5 both
   * round to 2/4), so when present it is the judge's craft score and the axes
   * only feed the per-axis display.
   */
  overall: z.number().int().min(0).max(10).optional(),
  note: line.optional(),
});

/** What a step cost to run, read from the harness's session log. `minutes` feeds the speed part of the score. */
export const stepMetricsSchema = z.strictObject({
  step: z.int().positive(),
  /** Wall time from the prompt to the model's final message. */
  minutes: z.number().positive().optional(),
  toolCalls: z.int().nonnegative().optional(),
  outputTokens: z.int().nonnegative().optional(),
  /** Model cost in US dollars as the harness reports it. */
  costUsd: z.number().nonnegative().optional(),
});

export const generationSchema = z
  .strictObject({
    title: line,
    description: line.optional(),
    date: isoDate,
    author: z.strictObject({
      name: line,
      github: z
        .string()
        .regex(/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/, 'a GitHub username without @')
        .optional(),
    }),
    /** Plugin version the run used — must be a released version in CHANGELOG.md. */
    plugin: semver,
    /** The agent harness: claude-code, omp, codex, gemini-cli, cursor, … */
    harness: line,
    /** Model ids exactly as the harness names them, e.g. claude-opus-4-1, gpt-5. */
    models: z.array(line).min(1),
    steps: z.array(generationStepSchema).min(1),
    /** Required, with no default: "no image model was used" has to be a statement, not an omission. */
    references: referencesSchema,
    tags: z.array(line).default([]),
    files: z.array(generationFileSchema).min(1),
    validate: z.array(validateReportSchema).default([]),
    /** Blind craft scores from judges who did not take part in the run. */
    ratings: z.array(ratingSchema).default([]),
    metrics: z.array(stepMetricsSchema).default([]),
    /** Present only when the run followed a benchmark prompt's fixed setup exactly. */
    benchmark: z
      .strictObject({
        prompt: slug,
        revision: z.int().positive(),
        results: z.array(criterionResultSchema).min(1),
      })
      .optional(),
  })
  .superRefine((generation, ctx) => {
    const models = new Set(generation.models);
    if (models.size !== generation.models.length) {
      ctx.addIssue({ code: 'custom', path: ['models'], message: 'a model is listed twice' });
    }
    generation.steps.forEach((step, index) => {
      if (step.model !== undefined && !models.has(step.model)) {
        ctx.addIssue({ code: 'custom', path: ['steps', index, 'model'], message: `"${step.model}" is not in models` });
      }
      if (step.model === undefined && generation.models.length > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'model'],
          message: 'several models are listed, so every step must name the one that ran it',
        });
      }
      if (generation.benchmark && step.original !== undefined) {
        ctx.addIssue({
          code: 'custom',
          path: ['steps', index, 'original'],
          message: 'a benchmark run sends the prompt verbatim, so there is no original to translate from',
        });
      }
    });

    const refs = generation.references;
    const referenceFiles = generation.files.filter((file) => file.role === 'reference');
    if (refs.source === 'generated' && refs.imageModels.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['references', 'imageModels'], message: 'name the image model that generated the reference' });
    }
    if (refs.source !== 'generated' && refs.imageModels.length > 0) {
      ctx.addIssue({ code: 'custom', path: ['references', 'imageModels'], message: `image models are only listed when source is "generated", not "${refs.source}"` });
    }
    if (refs.source !== 'generated' && refs.prompt !== undefined) {
      ctx.addIssue({ code: 'custom', path: ['references', 'prompt'], message: 'an image-model prompt only exists when source is "generated"' });
    }
    if (refs.source === 'none' && (refs.kinds.length > 0 || referenceFiles.length > 0)) {
      ctx.addIssue({
        code: 'custom',
        path: ['references', 'source'],
        message: 'source is "none" but reference kinds or files with role "reference" are listed',
      });
    }
    if (refs.source !== 'none' && refs.kinds.length === 0) {
      ctx.addIssue({ code: 'custom', path: ['references', 'kinds'], message: 'say what the reference was (concept-sheet, storyboard, sketch, …)' });
    }

    const paths = new Set<string>();
    generation.files.forEach((file, index) => {
      // Compared case-insensitively: macOS and Windows checkouts fold `A.png`
      // and `a.png` into one file, so only Linux would see both.
      const folded = file.path.toLowerCase();
      if (paths.has(folded)) {
        ctx.addIssue({ code: 'custom', path: ['files', index, 'path'], message: `"${file.path}" is listed twice (names are compared case-insensitively)` });
      }
      paths.add(folded);
      if (file.step !== undefined && file.step > generation.steps.length) {
        ctx.addIssue({ code: 'custom', path: ['files', index, 'step'], message: `step ${file.step} does not exist` });
      }
    });

    const covers = generation.files.filter((file) => file.role === 'cover');
    if (covers.length !== 1) {
      ctx.addIssue({ code: 'custom', path: ['files'], message: `exactly one file must have role "cover" (found ${covers.length})` });
    } else if (!/\.(png|gif|webp)$/i.test(covers[0]!.path)) {
      ctx.addIssue({ code: 'custom', path: ['files'], message: 'the cover must be a .png, .gif or .webp' });
    }
    if (!generation.files.some((file) => file.role === 'source' && /\.(aseprite|ase)$/i.test(file.path))) {
      ctx.addIssue({
        code: 'custom',
        path: ['files'],
        message: 'at least one .aseprite file with role "source" is required — the gallery keeps the editable original',
      });
    }

    const reportedSteps = new Set<number>();
    generation.validate.forEach((report, index) => {
      if (reportedSteps.has(report.step)) {
        ctx.addIssue({ code: 'custom', path: ['validate', index, 'step'], message: `step ${report.step} already has a validate report — keep the final one` });
      }
      reportedSteps.add(report.step);
      if (report.step > generation.steps.length) {
        ctx.addIssue({ code: 'custom', path: ['validate', index, 'step'], message: `step ${report.step} does not exist` });
      }
    });

    const judges = new Set<string>();
    // A run is animated when it ships an animation, a filmstrip or any GIF —
    // the cover is often the animation itself rather than a separate file.
    const animated = generation.files.some(
      (file) => file.role === 'animation' || file.role === 'filmstrip' || /\.gif$/i.test(file.path),
    );
    generation.ratings.forEach((rating, index) => {
      if (judges.has(rating.judge)) {
        ctx.addIssue({ code: 'custom', path: ['ratings', index, 'judge'], message: `${rating.judge} already rated this run` });
      }
      judges.add(rating.judge);
      if (rating.judge.startsWith('model:') && models.has(rating.judge.slice('model:'.length))) {
        ctx.addIssue({ code: 'custom', path: ['ratings', index, 'judge'], message: 'a model cannot rate a run it took part in' });
      }
      if (animated && rating.scores.motion === undefined) {
        ctx.addIssue({ code: 'custom', path: ['ratings', index, 'scores', 'motion'], message: 'the run has an animation, so score its motion' });
      }
      if (!animated && rating.scores.motion !== undefined) {
        ctx.addIssue({ code: 'custom', path: ['ratings', index, 'scores', 'motion'], message: 'the run ships no animation, filmstrip or GIF, so there is no motion to score' });
      }
    });

    const meteredSteps = new Set<number>();
    generation.metrics.forEach((metrics, index) => {
      if (meteredSteps.has(metrics.step)) {
        ctx.addIssue({ code: 'custom', path: ['metrics', index, 'step'], message: `step ${metrics.step} already has metrics` });
      }
      meteredSteps.add(metrics.step);
      if (metrics.step > generation.steps.length) {
        ctx.addIssue({ code: 'custom', path: ['metrics', index, 'step'], message: `step ${metrics.step} does not exist` });
      }
    });
  });

// ---------------------------------------------------------------------------
// Packs — several generations shown as one tile and opened on their own page.
// gallery/packs/<id>/pack.yaml
// ---------------------------------------------------------------------------

/** The folder name of a generation: `<yyyy-mm-dd>-<slug>`. */
const generationId = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*$/, 'a generation folder name such as 2026-09-29-knight-slash');

export const packSchema = z.strictObject({
  title: line,
  description: line.optional(),
  /** Display order of the pack's page; a single member would be a tile with nothing to group. */
  generations: z.array(generationId).min(2),
});

export type PackInput = z.input<typeof packSchema>;
export type PackFile = z.output<typeof packSchema>;

export type PromptInput = z.input<typeof promptSchema>;
export type PromptFile = z.output<typeof promptSchema>;
export type GenerationInput = z.input<typeof generationSchema>;
export type GenerationFile = z.output<typeof generationSchema>;
export type GenerationFileEntry = z.output<typeof generationFileSchema>;
export type FileRole = (typeof fileRoles)[number];
export type Rating = z.output<typeof ratingSchema>;
export type StepMetrics = z.output<typeof stepMetricsSchema>;
