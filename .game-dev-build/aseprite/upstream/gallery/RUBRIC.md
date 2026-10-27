# The craft rubric

Benchmark criteria are pass/fail and answer one question: did the run do what
the brief said? Two runs can both pass every criterion and still be a sprite
you would ship and one you would redraw. The rubric scores that second
question — is it good — on five axes, 0 to 4, against written anchors, so two
judges scoring the same run land in the same place.

Ratings live in `generation.yaml` under `ratings`, one entry per judge. The
site averages them: per run, the mean over judges of each judge's craft score,
shown as a percentage beside the compliance score. A judge's craft score is
their `overall` (0–10, ÷10) when they gave one, otherwise the mean of their
axes. Craft is 50% of the composite 0–100 score (35% criteria passed, 15%
speed); a run nobody has rated
counts 0 for craft. A run with no recorded time is scored on criteria and craft
alone, rescaled to 0–100. Model judges (`model:<id>`) are paused until they are
re-evaluated: their ratings may stay in `generation.yaml`, but only human
ratings are shown and counted.

## How to judge

- **Judge blind.** Look at the cover, the animation and the filmstrip — not the
  `models` line, the description or the other ratings. Read the brief (the
  prompt's step text) so you know what was asked, then score what you see.
- **Judge the final output.** For a benchmark that is the last step's file; the
  still from step 1 is part of it only as far as it survives into the
  animation.
- **Use the anchors, not your mood.** When a run sits between two anchors,
  pick the lower one unless every part of the higher anchor holds.
- **A model never rates a run it took part in.** The checker refuses
  `model:<id>` when `<id>` is in the run's `models`. Different models are
  fine judges, but say which one: `model:gpt-5`.
- **One rating per judge per run.** Changed your mind? Edit your entry.
- **`motion` is scored when, and only when, the run has a file with role
  `animation`.**

```yaml
ratings:
  - judge: human:fedorovvvv        # or model:<model id>
    scores: { read: 3, form: 2, motion: 3, cohesion: 4, appeal: 2 }
    overall: 6                     # optional, 0–10 integer: your own overall score; replaces the axis mean in craft
    note: Arcs read well; the coat loses its shading on the recoil frames.
```

## Axes

### `read` — silhouette and readability

What the eye gets at 1× and at a glance.

| | |
|---|---|
| 0 | The subject cannot be identified without being told what it is. |
| 1 | The subject is identifiable, but key parts merge (limbs into body, prop into character, foreground into background). |
| 2 | Reads at a glance; one or two important parts are muddy or lost at 1×. |
| 3 | Every important part reads at 1×; the silhouette alone says what it is. |
| 4 | Instantly readable at 1×, with clear hierarchy — the eye lands on the focal point first, every time. |

### `form` — light, volume and material

| | |
|---|---|
| 0 | Flat fills, or shading that contradicts any single light direction. |
| 1 | A light direction exists but is inconsistent, or shading is pillow-shaded / pure brightness steps. |
| 2 | Consistent light; volume reads on the main forms, materials look alike. |
| 3 | Consistent light with hue-shifted ramps; distinct materials (cloth, metal, skin, foliage) read as different. |
| 4 | As 3, plus deliberate secondary light (bounce, rim, emissive effects) that sells depth without noise. |

### `motion` — timing, spacing and arcs

Animations only.

| | |
|---|---|
| 0 | Frames do not form a movement — jumps, teleports, or nothing readable changes. |
| 1 | The movement is legible but mechanical: even spacing, uniform timing, things translate in straight lines. |
| 2 | Key poses read and timing varies, but in-betweens slide, volume drifts or secondary motion is missing. |
| 3 | Clear anticipation / action / follow-through (or a smooth cycle), arcs and easing, secondary motion follows through. |
| 4 | As 3, and it has weight and intent: holds, smears or impact frames land exactly where they should. |

### `cohesion` — palette, style and clean pixels

| | |
|---|---|
| 0 | Clashing colours, mixed resolutions or styles, noise everywhere. |
| 1 | One style, but sloppy: stray pixels, jaggies, banding or accidental anti-aliasing all over. |
| 2 | Clean in the main forms; a few stray pixels, jaggies or inconsistent outline treatments remain. |
| 3 | Clean, deliberate clusters; outline and dithering used consistently; the palette is used as a system. |
| 4 | Everything looks placed on purpose — a pixel artist would change nothing for cleanliness. |

### `appeal` — would you use it

| | |
|---|---|
| 0 | Would not use it in anything. |
| 1 | Placeholder quality — fine to block out a game, would be replaced. |
| 2 | Usable as is in a small project; unremarkable. |
| 3 | Good: has a clear idea and charm; you would show it. |
| 4 | Memorable: you would put it on the project's front page. |
