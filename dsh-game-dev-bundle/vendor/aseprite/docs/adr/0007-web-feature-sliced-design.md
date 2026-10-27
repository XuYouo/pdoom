# ADR-0007 — The site is organised as Feature-Sliced Design

**Status:** accepted · 2026-09-29

## Context

`apps/web` started as SvelteKit's flat layout: every component in
`lib/components`, every route holding its own markup and load logic. The site is
growing a leaderboard, per-benchmark galleries, filters and a detail page that
share pieces (a generation card, copy-the-prompt, score bars). In a flat tree
each of those is a place where a change can reach anywhere.

## Decision

- `apps/web/src` follows the layer → slice → segment structure of
  [Feature-Sliced Design](https://feature-sliced.design): `app`, `pages`,
  `widgets`, `features`, `entities`, `shared`.
- SvelteKit's `src/routes` stays, as a thin router: it mounts a page slice and
  calls its load function. It holds no markup or logic of its own.
- Import rules: only downward across layers; no imports between slices of one
  layer, except entities through FSD's `@x` public cross-API
  (`entities/generation/@x/benchmark`); everything goes through a slice's public
  API. A slice with a single consumer is not a slice: it lives inside that page.
- `shared` names no business concept. A generation, prompt or benchmark type
  lives in `entities`; the generic pixel-art components live in `shared/ui`.
- Server-only code sits in `*.server.ts` files inside the slice that owns it and
  is exported through a second barrel, `index.server.ts`, imported only from
  `*.server.ts` files, so the client bundle cannot reach `node:fs`.
- The rules are checked, not remembered: `steiger` runs as `lint:fsd`
  (`steiger ./src`) in `apps/web` and in the Gallery workflow, on its
  recommended config with no rule switched off. Run against `.` instead of
  `./src` it reports nothing at all, which is how the first migration passed
  while breaking 94 rules.
- Each layer has an import path (`#shared`, `#entities`, `#features`,
  `#widgets`, `#pages`), declared as Node subpath imports in
  `apps/web/package.json`; SvelteKit 3 replaced its `$lib` and `config.alias`
  with them. The app layer's path is `#app-shell`, because `$app` belongs to
  SvelteKit.

## Consequences

**Good.** A slice can be changed or deleted knowing who may depend on it. The
generation card, the copy button and the score bar each have exactly one home.

**Good.** New pages compose existing widgets instead of copying markup.

**Bad.** More directories and barrels for a small site; a small change can touch
a slice's `index.ts`. Accepted for the enforcement.

**Bad.** Steiger has no notion of SvelteKit's `routes/`; it is documented as the
one structural exception in `apps/web/README.md` and kept to mounting page
slices.

## Revisit when

The site stays at a handful of pages and the barrels cost more than they protect,
or `steiger` cannot follow SvelteKit conventions without exceptions that swallow
the rules.
