# ADR-0006 — One store of generations; the benchmark is a view over it

**Status:** accepted · 2026-09-29

## Context

`docs/evals/knight-benchmark.md` defined a fixed task with a written pass bar,
and its results table stayed empty: a Markdown row has nowhere to put the
`.aseprite`, the GIF and the filmstrip that make a claim checkable. People also
want to share work that follows no benchmark at all.

Results have three axes that must not be mixed: the plugin version, the prompt,
and the model. A run is only comparable to another run on the same prompt text.

*Amended 2026-09-29 by [ADR-0009](0009-concept-first.md):* the model axis also
carries the reference pipeline. A run that drew from an image model's concept
is an intended, declared benchmark run, ranked on its own row
(`model · concept by <image model>`) and never merged into the pixel-only row.

## Decision

- **One store, `gallery/`, a private workspace package.** Every run is a folder
  `gallery/generations/<yyyy-mm-dd>-<slug>/` holding `generation.yaml` and the
  flat files it lists. The `.aseprite` source is required — the gallery keeps
  the editable original, not just a picture of it.
- **A generation records its own prompts, verbatim, in order**, with the model
  that ran each step. That makes every entry self-contained ("copy the prompt
  sequence" needs nothing else) and lets one run span several models.
- **The benchmark is derived, never stored.** A benchmark prompt
  (`gallery/prompts/<slug>/prompt.yaml`) has ordered steps, a fixed setup,
  criteria and a `revision`. A generation that names it must carry the step
  texts verbatim and answer every criterion. Cells are keyed by
  prompt × model(s) × plugin version; a run on an older revision is kept and
  listed but never ranked, because it measured a different task.
- **Plugin versions are validated against `CHANGELOG.md`.** An unreleased build
  is not reproducible by anyone else, so it cannot be a benchmark row.
- **One schema** (`gallery/src/schema.ts`, zod) is read by `pnpm gallery:check`,
  by CI, by the web build and by the `aseprite:submit` skill. A field the
  checker does not enforce does not exist — the same rule as the tool surface.
- **Binaries live in git.** Pixel art is small; Git LFS would add a quota and a
  setup step to every contribution. The checker rejects files over 95 MiB
  (GitHub refuses 100 MiB) and warns over 50 MiB.
- **The repository becomes a pnpm workspace with turborepo.** The plugin stays
  the root package, because the Claude Code marketplace installs from `./` and
  every user's plugin path points there; `gallery` and `apps/web` are
  workspace packages outside the published `files` list.
- **The site (`apps/web`, SvelteKit, fully prerendered) deploys on Vercel from
  `main` only.** Data changes arrive by merged pull request, so a build per PR
  would only preview unreviewed submissions and spend build minutes.

## Consequences

**Good.** A benchmark claim links to the exact files, prompts and validate
report behind it. Adding a run is a pull request that CI can judge on its own.

**Good.** The npm tarball is unchanged; the gallery never ships to npm users.

**Bad.** The repository grows with every contribution, and a plugin installed
from the marketplace copies the whole repository — gallery binaries included —
into every user's plugin cache. Acceptable while submissions are sprite-sized;
revisit if clones or plugin installs become slow.

**Bad.** The plugin launcher builds a git install with `npm install`, which
does not read `pnpm-lock.yaml`. The root keeps an npm `package-lock.json` for
that path only, and CI fails when it drifts from `package.json`.

**Bad.** Criterion results are self-reported. Review catches the obvious; the
required `.aseprite` and filmstrip make the rest checkable by anyone.

## Revisit when

The repository passes a size where cloning hurts (move binaries to LFS or
object storage behind the same schema), or runs need automated judging.
