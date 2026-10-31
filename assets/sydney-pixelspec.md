# Sydney PixelSpec — native body admitted


## Contract


[GDD](<../GAME_DESIGN_GDD.md#L67-L71>): adult cyber-ghost bride. Preserve [Core](<../src/pages/GamePage/game/systems/sydney.ts>) phase/action and its existing sin motion. No new hover clock, bullets, knives or control bubbles.

96x96 RGBA canvas, pivot48/48. Existing [52x74 body](<../src/pages/GamePage/game/entities/model.ts#L133-L135>) stays. Ink budget x22..73/y11..84; skirt bottom about38px wide, clear of real radius42 tell, HP and label.

## Design


Front view, about4 heads tall, adult rather than baby face. Pale face, dark hair masses, fine eyes under an arched bridal veil; fitted ivory bodice and A-line skirt dissolving into three wavy ghost tails, no feet. Arms separate from body. Upper-left light, selective1px cool outline, hard alpha. No nun cross, halo, wings, robot face or held weapon.

Three phases retain bridal identity: dialogue calm/cold; knife phase sharper expression and lifted hand; control phase plum/cyan digital fissures and grasping hands. No baked text or attacks.

## Poses and palette


Twelve poses: phases1..3 each idle/tell/attack/recover. True phase/action wins over HP, deadlines, volley and inferred state. Export durations [600,1100,300,1500,600,1100,300,1500,600,900,300,1250] are preview metadata only;1000ms phase-change recovery remains Core-owned.

Existing20-entry palette, no widening: 00000000, 2c2330, d97757, eaa083, b55a4a, 783f4a, f5e8c8, cbb696, 34354f, 575c79, 858eb0, 9dded1, d9ffea, 0f191b, 24423b, 426b50, 8fa86b, b9905d, e5c386, 723f68. Exclude reserved hero orange#d97757. Aim10-13 opaque colors: violet hair/shadows, mint veil, ivory dress, limited plum/rose late-phase fissures.

## Production gate


Tool-generated reference only, never downsample as final sprite. Requests, actual dimensions/crops and deliberate deviations go in [provenance](<sydney-generation.json>). Live layered native work, actual previews, honest-context independent review, validate/export and native gameplay are required before admission.

## Reference reading

Actual concept and storyboard are2172x724 RGB. Poses read as low hands, raised palms, forward grasp, hands at waist. Remove tiny crown/lace; slightly enlarge face for native readability while keeping adult eyes. Base comparison corrected an overly tall face/low waist and flat veil crown before shading. Three ghost tails remain asymmetric.

## Accepted native source and static evidence

[Editable source](<source/sydney.aseprite>), [native PNG](<../public/game/sydney.png>) and [actual atlas](<../public/game/sydney.json>): 12 full96px cells, 11 native layers, 128 cels (23 raster/105 linked), no reference/sketch. Source and PNG use10 opaque colors from20 palette slots, alpha0/255, no reserved hero orange. Seven common layers and same-pose arms are linked across phases.

The [12-pose review strip](<../artifacts/asset-review-r15/review/c.png>) is actually4608x384 (4x), not a4x3 export. Reused-context reviewer:8/10, no blocking/necessary fix; this is static, not a runtime score. Initial A6/10 and B8/10 remain recorded. The accepted B base frame is byte-identical to current frame0. Lead also read the native1152x96 sheet.

First validate:9 errors/80 warnings. Connected eye/crack clusters and moved the late-phase skirt fracture below the recovering hand at(51,50). Final:0 errors/76 selective-outline warnings, no banding; all layer ranges and arm/corruption nonoverlap pass.

## Runtime boundary

Only10 poses are naturally reachable: inactive phase1 idle plus three phases of tell/attack/recover. Arena entry sets recover1200ms; phase switches set recover1000ms; the active loop never returns to idle. Phase2/3 idle are spare static/mapper cells, never invented gameplay coverage.

The read-only body is opaque atdepth2, including inactive phase1. Real radius42 tell, HP and Sydney projectiles remain independently drawn atdepth3, label4. Original52x74 collision and Core movement/timing/damage are unchanged.

[Final gate](<../artifacts/verification/r15-full-gate-02.log>):1167 unit tests/77 browser/23 real PG backend, no skip; lint/type/build/audit0/diff passed. New112 adapter+53 independent PNG/ASE cases and4 native cases cover all10 reachable poses, real effects, PUA shooting release, pause, same-arena death cleanup and exact-checkpoint resource retry.

[Native scene evidence](<../artifacts/asset-review-r15/runtime-review/evidence.json>): six selected640x360 frames actually reviewed, nonfresh,0 blocking/necessary fixes; not a motion score. Source-only scene contract remains frozen. Observer failures, first full76/77 and subsequent3/3 PUA-case repeat are retained in the [verification record](<../docs/round15-sydney-verification.md>). No art/Core/threshold weakening. Factory environment and full GDD are still incomplete.
