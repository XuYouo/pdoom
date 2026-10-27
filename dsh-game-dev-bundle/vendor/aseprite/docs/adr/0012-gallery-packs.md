# ADR-0012 — Packs: related generations as one tile

**Status:** accepted · 2026-10-07

## Context

Every benchmark run is a generation ([ADR-0006]), and every generation is a
card on the gallery wall. Four prompts run by five model setups put 22 cards of
the same four subjects on a 25-card wall: the free gallery work drowns in
near-duplicates, and the wall stops reading as a gallery.

The runs belong together — they answer one prompt — but the gallery had no way
to say so.

## Decision

A **pack** groups generations. It lives in `gallery/packs/<slug>/pack.yaml`:

```yaml
title: Cherry tree — from seed to full bloom
description: Benchmark runs of the tree-growth prompt, one card per model run.  # optional
generations:            # ≥ 2 generation folder ids, display order is not used
  - 2026-10-06-tree-growth-opus
  - 2026-10-05-tree-growth-sonnet
```

- A generation belongs to **at most one** pack. The wall shows a pack as one
  tile in place of its members; the members keep their own `/g/<id>` pages.
- A pack with any problem (unknown or rejected member, a member claimed by two
  packs, a stray file) is an error, like any other in the gallery: the check
  fails and the site does not build. The checker reports it once on the pack
  and leaves its members unpacked, so one bad pack does not cascade into
  errors about its members.
- Packs are **maintainer-curated**, like benchmark prompts: a pack hides its
  members from the wall, so an outsider must not be able to pack someone
  else's work. CI and CODEOWNERS guard `gallery/packs/` the same way they guard
  `gallery/prompts/`.
- On the site, a pack is a sealed booster on the wall and opens on
  `/packs/<slug>` into a fan of its cards, with the ordinary list of every card
  below. The opening is CSS animation whose resting state is the open fan, so
  reduced motion, a skip, or no JavaScript all land on the same result.

### Alternatives considered

- **A `pack:` field on `generation.yaml`.** Membership would travel with the
  run, but packing the existing runs means editing 22 published generation
  files, and a generation PR may only add its own folder — so a contributor
  could not join a pack anyway, and a maintainer could not pack a run without
  touching it.
- **Implicit grouping** (by benchmark prompt, by date). Zero data, but it
  decides for every future case, including free runs that should stay loose,
  and leaves no place for a pack's title or order.

## Consequences

- Members are shown best-first by score (points, then compliance, craft, date;
  unscored runs after them, newest first), so the order in `pack.yaml` no
  longer matters and the pack's cover is its best run.
- A new benchmark run shows loose on the wall until a maintainer adds it to its
  prompt's pack, in a separate PR.
- Filters on the wall match a pack when any of its pieces matches, and the facet
  options still come from every piece, packed or not.
- `/benchmarks/*` and the leaderboard read generations directly and are
  unaffected.

[ADR-0006]: 0006-gallery-and-benchmark.md
