# The benchmarks

Our own fixed tasks for judging whether a model can hold this brush. Not a
leaderboard — repeatable tasks with a written pass bar, so a claim like
"Model X animated a good attack" can be checked rather than taken on faith.

| Benchmark | What it tests |
|---|---|
| [`boombox-mage`](../../gallery/prompts/boombox-mage/prompt.yaml) | A specified character held on model through an anime special attack: anticipation, impact frame, layered effects confined to their beats |
| [`tree-growth`](../../gallery/prompts/tree-growth/prompt.yaml) | A growth animation planned backwards from a fixed final frame: continuous structure, eased pacing |
| [`winding-road`](../../gallery/prompts/winding-road/prompt.yaml) | Scene-scale perspective and depth, then several independent cycles closing into one seamless loop |

Each step's text is a complete brief — size, palette, layout, colours, layer
names, frame counts and timing — so runs on different models and plugin
versions answer the same task instead of each model inventing its own. The
prompt file holds the fixed setup and the pass criteria. Results are
generations in [`gallery/`](../../gallery/), each carrying its files and a
pass/fail per criterion; the site renders them as a model × plugin-version
matrix. How the store works:
[ADR-0006](../adr/0006-gallery-and-benchmark.md). How to submit a run:
[gallery/README.md](../../gallery/README.md), or `/aseprite:submit`.

## Procedure

1. Run each step with no further instructions from you. Let the model's own
   skills (`brief`, `draw`, `shade`, `rig`, `animate`, `review`) decide the
   path — that choice is part of what's being measured.
2. Do not intervene mid-run unless the model asks a genuine clarifying
   question. Record it as an intervention on that step.
3. Start each step's session outside this repository (an empty scratch
   directory holding only the run's `.aseprite`): from the repo root the model
   can read `gallery/prompts/` — the criteria and the later steps — and earlier
   runs in `gallery/generations/`.
4. When the model reports done, capture the evidence below before judging
   anything yourself.

## What to capture

- `look op="preview"` — the overall read of every step's final frame.
- `look op="filmstrip"` — every frame of the animation in one image. The only
  reliable way to see the whole cycle at once.
- `look op="onion"` on at least one in-between frame, to check spacing rather
  than just endpoints.
- The PNG export of step 1, kept aside — `tree-growth` compares its final
  frame against it.
- The model's own `validate` output (findings, `passed`, `score`) and its
  final review report, verbatim.
- From the harness's session log: wall time, tool calls, output tokens and
  cost per step — they go in `metrics`.

Run through `rules://07-review-checklist` too, and put anything ticked "no" in
the criterion's note rather than silently passing it.

## How a run is scored

Three numbers, kept apart because they answer different questions:

| | Question | Who decides | Ranks? |
|---|---|---|---|
| **Compliance** | Did it do what the brief said? | Pass/fail per criterion, checked with the tool each criterion names | First |
| **Craft** | Is it good? | Blind judges, 0–4 on `read`, `form`, `motion`, `cohesion`, `appeal` against the anchors in [RUBRIC.md](../../gallery/RUBRIC.md) | Breaks ties |
| **Cost** | What did it take? | The session log: minutes, tool calls, tokens, dollars | Shown only |

Compliance alone rewards a model that ticks boxes with ugly art; craft alone
rewards one that ignores the brief. Rate a run after it is recorded, without
looking at its `models` line, and never with a model that took part in it —
the checker refuses that.

## Related

`skill://brief`, `skill://draw`, `skill://animate`, `skill://review`,
`skill://submit`, `rules://05-animation`, `rules://07-review-checklist`.
