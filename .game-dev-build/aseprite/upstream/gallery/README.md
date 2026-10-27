# The gallery

Everything anyone has made with the plugin, and a benchmark computed from it.
This file is the rulebook for adding to it. The contract lives in
[`src/schema.ts`](src/schema.ts) and is enforced by `pnpm gallery:check` — if
this README and the schema ever disagree, the schema wins; please open an issue.

## What a generation is

One **run**: one agent, one harness, one plugin version, working through one
list of prompts and leaving files behind. A generation is a folder holding the
files it produced and a `generation.yaml` that says exactly how it was made.

There are two kinds, and they live in the same place:

- **Free gallery runs** — anything you are proud of. Any prompt, any setup.
- **Benchmark runs** — runs that followed a benchmark prompt's fixed setup
  exactly (see [Benchmark runs](#benchmark-runs)). They add a `benchmark:` block
  and count towards the leaderboard.

## Layout

```
gallery/
  prompts/<slug>/prompt.yaml            benchmark prompts (maintainers + separate PRs)
  packs/<slug>/pack.yaml                groups of generations shown as one tile (maintainers + separate PRs)
  generations/<yyyy-mm-dd>-<slug>/      one folder per run
    generation.yaml
    cover.png  mage.aseprite  attack.gif  …
```

- Folder name: the date of the run (`yyyy-mm-dd`), a hyphen, then a slug of
  lowercase letters, digits and single hyphens — `2026-09-29-boombox-mage-opus`.
- **Flat**: no sub-folders. Every file sits next to `generation.yaml`.
- Every file in the folder must be listed in `generation.yaml`; unlisted files
  are rejected (only `.DS_Store` is ignored). Symlinks are rejected too — commit
  the file itself.
- **One run per folder.** Two attempts are two folders, and you submit the ones
  you want shown — but never present a retry as the first try.

## `generation.yaml`

```yaml
title: Boombox mage and his sound blast  # required
description: >-                          # optional, plain text
  Opus 4.1 drove the whole session; nothing was edited by hand.
date: 2026-09-29                         # required, ISO date of the run
author:
  name: Ada Lovelace                     # required
  github: ada                            # optional, username without @
plugin: 0.3.2                            # required, a RELEASED version: must have
                                         # a `## [0.3.2]` heading in CHANGELOG.md
harness: claude-code                     # required: claude-code, omp, codex, gemini-cli, cursor, …
models:                                  # required, ≥1, ids exactly as the harness names them
  - claude-opus-4-1
steps:                                   # required, ≥1, in the order they ran
  # A benchmark run carries each step's text verbatim from prompt.yaml;
  # the two below are cut short for this example.
  - text: |-
      The document is already open: 128×64 pixels, RGB, with the PICO-8 palette loaded (16 colours). …
    # model: claude-opus-4-1             # required on EVERY step when models has >1 entry,
    #                                    # and must be one of `models`
    interventions: []                    # what you said mid-run; see Honesty
    # original: …                        # only when `text` is an English translation:
    #                                    # the prompt exactly as sent (not in benchmark runs)
  - text: |-
      The open document holds the street-mage with his magic boombox (canvas 128×64, …
    interventions:
      - 'Offered a concept image — answered "No reference, continue from the text."'
references:                              # required — where the design came from
  source: none                           # none | generated | supplied
  # imageModels: [gpt-image-2]           # required when generated; only then
  # kinds: [concept-sheet, storyboard]   # required unless none: concept-sheet, storyboard,
  #                                      # sketch, screenshot, photo, other
  # prompt: |-                           # optional, generated only: the image-model prompt verbatim
  #   Pixel art character concept sheet of …
tags: [character, animation]             # optional
files:                                   # required, ≥1
  - path: mage-cover.png
    role: cover                          # exactly one cover, and it must be png/gif/webp
    label: The mage                      # optional caption
    step: 1                              # optional: 1-based step that produced it
  - path: mage.aseprite
    role: source                         # at least one .aseprite/.ase with role source
    step: 1
  - path: attack.aseprite
    role: source
    step: 2
  - path: attack.gif
    role: animation
    step: 2
  - path: attack-filmstrip.png
    role: filmstrip
    step: 2
validate:                                # optional: the `validate` tool's reports
  - step: 1
    passed: true
    score: 96                            # optional, 0–100
    errors: 0                            # default 0
    warnings: 1                          # default 0
metrics:                                 # optional: what each step cost, from the session log
  - step: 1
    minutes: 8.8                         # wall time, prompt to final message
    toolCalls: 42
    outputTokens: 46596
    costUsd: 2.79
ratings:                                 # optional: blind craft scores, see RUBRIC.md
  - judge: human:ada                     # human:<github login> or model:<model id>
    scores: { read: 3, form: 2, motion: 3, cohesion: 4, appeal: 2 }   # 0–4 each
    overall: 6                           # optional 0–10: your own overall score; counts as craft instead of the axis mean
    note: Arcs read well; the coat loses its shading on the recoil frames.
benchmark:                               # only for benchmark runs
  prompt: boombox-mage                   # a folder name under gallery/prompts/
  revision: 1                            # the prompt's `revision` when you ran it
  results:                               # every criterion of that prompt, answered
    - criterion: mage-validate
      pass: true
    - criterion: attack-wave
      pass: false
      note: One arc copied and translated right; no new arcs born at the speakers.
    # … one entry per criterion in prompt.yaml
```

### Rules the checker enforces

- **Strict**: unknown fields are errors — a typo does not silently vanish.
- **Roles**: `cover`, `source`, `animation`, `filmstrip`, `sheet`, `frame`,
  `reference` (the concept sheet or storyboard the run drew from), `other`.
  Allowed extensions: `.aseprite`, `.ase`, `.png`, `.gif`, `.webp`,
  `.json`, with a flat file name (letters, digits, `_`, `-`, `.`).
- **References are stated, not implied**: `references` has no default.
  `generated` needs `imageModels`; anything but `none` needs `kinds`; `none`
  cannot list kinds or `reference` files.
- **Exactly one `cover`**, a `.png`, `.gif` or `.webp`.
- **At least one `.aseprite`/`.ase` with role `source`** — the gallery keeps the
  editable original, not just a picture of it.
- **Ratings**: one per judge; scores are integers 0–4; `motion` is required
  when a file has role `animation` and forbidden otherwise; a `model:` judge
  cannot be one of the run's `models`. How to score: [RUBRIC.md](RUBRIC.md).
- **Metrics**: at most one entry per step, and the step must exist. Step
  `minutes` feed the speed part of the score (15%): a run's time is the sum over
  all steps, and a run missing `minutes` on any step counts 0 for speed. A run's
  speed is the fastest run's time on that benchmark divided by its own.
- **No duplicates**: a model, a file path (compared case-insensitively) or a
  `validate` step listed twice is an error; `step` numbers must exist.
- **File names**: no `__` prefix (the site reserves it) and no Windows-reserved
  names such as `con.png`.
- **Magic bytes** are checked: a file must actually be what its extension says.
- **Plugin version** must be a released version listed in `CHANGELOG.md`, and
  the run's `date` cannot be earlier than that release.
- **Benchmark axes** are prompt × models × plugin version. The same models in a
  different order are the same row; `harness` is recorded and shown but is not
  an axis. A run drawn from references is its own row — `claude-opus-5-5 ·
  concept by gpt-image-2`, or `… · supplied reference` — so a concept-assisted
  score never counts as the agent's pixel-only score.
- **Benchmark block**: the prompt must exist, `revision` cannot be newer than
  the prompt's, and on the current revision **every criterion** of the prompt
  needs exactly one result — no skipping the ones that went badly.

## Honesty rules

These are what make the gallery and benchmark worth reading.

1. **Prompts are verbatim.** `steps[].text` is the text sent, word for word —
   no tidying, no "the gist". The one exception is language: a prompt sent in
   another language may be rendered in English in `text` if the original goes,
   verbatim, in `original`. (The checker ignores only surrounding whitespace
   and line endings when comparing against a benchmark prompt, and benchmark
   runs cannot use `original`.)
2. **Name the image model.** If an image model designed the character or the
   storyboard, say so in `references`, and keep its output as a `reference`
   file where you can. A redraw of a concept is a fine run; passing it off as
   drawn from words is not.
3. **Do not steer silently.** Anything you typed to the model beyond the step
   text — answers to clarifying questions, nudges, corrections — is recorded
   under that step's `interventions`. A run with many interventions is still
   welcome; a run that hides them is not.
4. **No hand retouching under the model's name.** If you edited the sprite
   yourself, either do not submit it, or do not call it the model's work
   (say so in `description` and leave it out of benchmarks).
5. **The cover is real output.** Pick it from what the run produced; do not
   crop, recolour or repaint it into something better than the file it
   represents.
6. **Record what ran.** `plugin`, `harness` and `models` are exactly what was
   used, including when a step switched models.
7. **Honest fails.** Benchmark criteria you judge failed stay failed, with a
   short `note`. A leaderboard full of ticks helps nobody.
8. **One run per folder**, and the `.aseprite` source is the file that run
   ended with.

## Benchmark runs

**Benchmark runs and benchmark prompts come from the maintainers only** — the
GitHub logins in [`gallery/MAINTAINERS`](MAINTAINERS). Three layers enforce it:
`pnpm gallery:check` refuses a `benchmark:` block whose `author.github` is not
listed; CI compares the pull request's author (from GitHub, not the YAML)
against the list on the base branch and fails on a `benchmark:` block or a
change under `gallery/prompts/` or `gallery/packs/`; and CODEOWNERS makes changes to `gallery/src`,
`gallery/prompts`, `gallery/packs`, `MAINTAINERS` and `.github` need a maintainer's review
(requires branch protection "Require review from Code Owners" on `main`).
Everyone else submits gallery generations. What follows is how maintainers
record a run.

A benchmark run is comparable only if the task was identical, so it must follow
the prompt's fixed setup to the letter. The current prompts are
[`boombox-mage`](prompts/boombox-mage/prompt.yaml),
[`tree-growth`](prompts/tree-growth/prompt.yaml) and
[`winding-road`](prompts/winding-road/prompt.yaml); in each, the `setup` block
(canvas, colour mode, palette, `rules`) and the `steps` text are the
contract. In practice:

- Use each step's text verbatim, and no other steering or hand-made setup
  beyond what the prompt's `rules` allow. Reference images are the one
  declared exception: a run that drew from an image model's concept or
  storyboard is allowed, must say so in `references`, and is ranked on its own
  row (`… · concept by <model>`), never mixed into the agent's pixel-only row.
- Respect the session boundaries the prompt defines (every current prompt runs
  step 2 in a fresh session against a copy of step 1's result).
- Set `benchmark.prompt` and `benchmark.revision`, and answer every criterion.
- Only runs on a prompt's **current revision** are ranked; runs on an older
  revision are kept and shown as outdated, never mixed in.

If your run deviated from the setup in any way, submit it as a free gallery run
(omit the `benchmark:` block). That is a perfectly good gallery entry.

## Packs

A **pack** groups several generations so the site shows them as one tile in the
gallery grid and opens them on their own page. Today there is one pack per
benchmark prompt, so the many model runs of one prompt do not crowd the grid.
A generation never changes for being packed: its folder stays where it is and
it is still scored; the pack only says how it is displayed.

```yaml
# gallery/packs/boombox-mage-benchmark/pack.yaml
title: Boombox mage — character and anime sound-blast attack   # required
description: Benchmark runs of the boombox-mage prompt.        # optional, one line
generations:                                                   # required, ≥2, in display order
  - 2026-10-06-boombox-mage-opus
  - 2026-10-05-boombox-mage-sonnet
```

`generations` holds generation folder names; the pack's page shows them in
exactly this order. The folder name of the pack is a lowercase slug
(`<prompt>-benchmark` for the benchmark packs).

Rules the checker enforces — each break is an error that fails the check and
the site build:

- The pack folder holds only `pack.yaml`; unknown fields are errors.
- Every listed id is a generation that exists **and** passes validation; the
  error says which of the two it was.
- An id is listed once per pack, and a generation belongs to at most one pack.

Packs are **maintainers only**, like prompts: a pack hides its members from the
main grid, so CI and CODEOWNERS refuse changes under `gallery/packs/` from
anyone else. A new benchmark run is not in any pack until a maintainer adds it
to its prompt's pack — in a separate PR from the run — so until then the run
shows loose in the grid.

## Files: size and format

- **Hard limit 95 MiB per file** (GitHub rejects pushes with a file over
  100 MiB); the checker errors above it. **Warning above 50 MiB** — GitHub warns
  on every push; export a smaller preview if you can.
- Binaries live directly in git, so keep folders lean: the cover and previews as
  `.png` (or `.webp`), animations as `.gif`/`.webp`, plus the `.aseprite`
  source. Skip intermediate saves and large scaled-up exports the site can scale
  itself.

## Licensing

The repository is [MIT-licensed](../LICENSE). By opening a generation PR you
confirm that you made these files (with the plugin and your model), that you
have the right to publish them, and that they are contributed under the same
MIT license. Do not submit work that is derived from someone else's art unless
its license permits that; state the source in `description`.

## Checking locally

```sh
pnpm install
pnpm gallery:check
```

It prints every problem with the file it belongs to. Errors block the PR;
warnings (an oversized file, for example) do not. CI runs the same command,
plus the gallery tests and a build of the site.

## Opening the pull request

The `aseprite:submit` skill in the plugin automates everything below — it
collects the files, writes `generation.yaml` from the actual session, runs the
check and opens the PR. To do it by hand:

1. Fork the repository and clone your fork.
2. Create a branch named `gallery/<folder>` — e.g.
   `gallery/2026-09-29-knight-opus`.
3. Add **only** your new folder under `gallery/generations/`. CI fails a PR that
   adds a generation and also changes anything else — including other
   people's generation folders.
4. Run `pnpm gallery:check` until it is clean.
5. Push and open the PR with the generation template, either:
   - open `https://github.com/with-pebbly/aseprite-ai-artist/compare/main...<you>:gallery/<folder>?template=generation.md`, or
   - `gh pr create --repo with-pebbly/aseprite-ai-artist --head <you>:gallery/<folder> --body-file <body>`,
     with the body copied from `.github/PULL_REQUEST_TEMPLATE/generation.md` and filled in.

### What reviewers check

- CI is green (`gallery:check`, tests, site build, folder scope).
- The prompts read as verbatim and the interventions look complete.
- The cover matches the files, and the `.aseprite` source opens and is the
  run's result.
- Benchmark runs: the setup was followed, every criterion is answered, and the
  answers hold up against the preview (a reviewer may flip a criterion with a
  comment rather than reject the run).
- The license confirmation is ticked and nothing looks copied.

## Proposing a new benchmark prompt

Maintainers only — see [Benchmark runs](#benchmark-runs).

Prompts are the fixed tasks. A new one is a **separate PR** that adds
`gallery/prompts/<slug>/prompt.yaml` and nothing else — never bundled with a
generation.

A prompt has: `title`, `summary`, `revision`, optional `tags`, a `setup`
(canvas, colour mode, optional palette, `rules`), ordered `steps` (each with a
`title` and the exact `text` handed to the model) and `criteria` (a unique
slug `id`, the 1-based `step` it judges, and `text` — how to tell pass from
fail without the author's taste). Start a new prompt at `revision: 1`.

**Bump `revision` whenever a step's text, the setup or any criterion changes.**
Results from different revisions measured different tasks and are never ranked
against each other; existing generations keep the revision they were run on and
appear as outdated. Do not edit a prompt to "fix" a criterion without bumping.
Criteria should be checkable by someone who was not there — cite the tool or
observation that decides them.

## Deployment (maintainers)

The site in `apps/web` ([pixeli.pebbly.space](https://pixeli.pebbly.space/); SvelteKit, `@sveltejs/adapter-vercel`) deploys to
Vercel **only on push to `main`** — never for pull requests or other branches.
[`apps/web/vercel.json`](../apps/web/vercel.json) enforces that with
[`git.deploymentEnabled`](https://vercel.com/docs/project-configuration/git-configuration#git.deploymentenabled):
`"**": false` turns automatic deployments off for every branch and
`"main": true` turns them back on for `main`. Per the docs, a branch matching
several rules deploys when at least one rule is `true`, so `main` matches both
and deploys; everything else matches only the `false` rule and does not even
start a build. (`**` rather than `*`, because `*` does not cross the `/` in
branch names such as `gallery/…`.) An `ignoreCommand` was not chosen: it still
starts a build just to exit early
([docs](https://vercel.com/docs/project-configuration/vercel-json#ignorecommand)).
`turbo-ignore` is deliberately not used — the gate is the branch, and skipping
by changed paths would make a `main` push touching only `gallery/` skip a
deploy the site needs.

CI still builds the site on PRs (`gallery.yml`); that is a check, not a deploy.

One-time project settings in the Vercel dashboard (Project → Settings):

| Setting | Value |
|---------|-------|
| Framework Preset | SvelteKit (also set in `vercel.json`) |
| Root Directory | `apps/web` |
| Include source files outside of the Root Directory in the Build Step | **Enabled** — the build reads `gallery/**`, `CHANGELOG.md` and the workspace lockfile |
| Node.js Version | 22.x or newer (the repo requires `>=22.6.0`) |
| Install Command | `pnpm install --frozen-lockfile` (set in `vercel.json`); Vercel picks pnpm from the root `pnpm-lock.yaml` and `packageManager` |
| Build Command | `pnpm turbo run build --filter=@pebbly/web` (set in `vercel.json`; runs `gallery:check` first) |
| Production Branch | `main` |

Settings in `vercel.json` override the dashboard for each deployment.

References:
[Git configuration](https://vercel.com/docs/project-configuration/git-configuration),
[vercel.json](https://vercel.com/docs/project-configuration/vercel-json).
