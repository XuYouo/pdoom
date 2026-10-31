# Chinchilla native PixelSpec — R17

## Binding contract

[GDD](<../GAME_DESIGN_GDD.md#L73-L77>): very small, high-HP rodent with dense attacks. Installed Phaser4.0.0 stays pinned.
[Core](<../src/pages/GamePage/game/entities/model.ts>): half-size6,12x12 collision. [Chapter](<../src/pages/GamePage/game/data/chapterThree.ts>): x920/1730/2180,y314,floor320,108HP.
[Encounter](<../src/pages/GamePage/game/systems/encounters.ts>): idle,600ms tell,800ms recover,9 actual GPU bullets. No collision, clock, damage or projectile-origin changes for art.

## Art decisions

- New live32x32, pivot16,16, LEFT-facing at native1x. Last opaque foot row21 maps to world319; floor starts320.
- Main dense body x10..21/y10..21. Round ears reachy6 and the tailx26. The initial18x16 envelope allowed muzzlex9; frozen art is17x16 atx10..26. Decoration is not collision.
- Two broad ROUND ears, short blunt muzzle, pear-shaped haunch, near paws and dark far-leg hints, thick hooked furry tail distinct from the foot. Not a bunny, squirrel, naked-tail rat, robot, or oversized pet.
- Shared20-entry project palette. Fur#34354f/#575c79/#858eb0, outline/nose#2c2330, cream#cbb696/#f5e8c8, muted plum inner ears#723f68. Initial ceiling8 opaque colors; hard alpha. Hero orange#d97757 forbidden. Upper-left light, selective silhouette, no hair-noise/double internal outline.
- Three STATIC poses: idle attentive crouch; tell ears/paws tighten before the real burst; recover small release/cheek/tail change. No invented walking, idle2 coverage, attack clock, painted projectiles or floating glows.
- Rig: tail, far-limbs, body, head, near-limbs. Stable hip/feet,1px/coherent cluster changes only. Never squash the hit mass or bob the anchor.

## Reference and acceptance

A2090-character concept prompt was prepared but no image-generation request was submitted and no output exists. Proceed with direct native design from the concrete size/palette/anatomy specification; no reference import or generated-image review is claimed. All sprite pixels are authored in live MCP.
Anonymous recognition then brief-aware review. Reused reviewer must be labelled nonfresh due occupied team slots. At most3 bounded fixes; freeze at7/10+ with no blocking/necessary fix. Look/validate/save/export required.
Prefer a separate strict adapter over changing the frozen three-enemy binding. Preserve original11px/1px/gold tell circle; real warnings and bullets above the native body, not generic17px cue.
Complete resources must be checked before ready; legal checkpoint/ordinary-input native proof only. Partial idle visibility is not full-pose coverage. Source/static/runtime gates are complete for this asset:1518unit/85browser/23backend. Full GDD remains incomplete.

Execution note: two malformed direct-write calls included forbidden escalation fields and were rejected before writing. Stop using those fields; normal current workspace operations need no access expansion.

## Static source gate

[Three-pose preview](<../artifacts/asset-review-r17/c.png>) passed nonfresh independent review7.5/10,0blocking/necessary after one bounded ear/body correction. Freeze the source. The initial cat/fox read and6.5 result remain recorded.
Visible five-layer source has3static100ms metadata frames, single-frame idle/tell/recover tags; body/far-limbs/tail are linked. validate Clean,13 deliberate style/hidden-sketch notes. No generated reference exists; the prepared prompt was not submitted. Native scope5/5 and the full85 browser gate pass with exact source signatures and GPU-over-body/death positive controls.

## Runtime evidence

[Independent source tests](<../tests/rendering/chinchillaAssets.test.ts>) reconstruct the actual native source byte-for-byte; [adapter tests](<../tests/rendering/chinchillaSprite.test.ts>) cover102 strict states/lifecycles. [Native cases](<../tests/e2e/chinchilla-art.spec.ts>) retain RGB≤2 and source/signature≥98%: all3 poses, r11 cue, real fan,60/133 opaque-core GPU overlap with before/after source controls,1800ms freeze, actual+6TOK aimed kill, and3 complete-resource failures. Initial Clawd blinking is handled by choosing visibly positive frames, not lowering thresholds. No hidden world access or injected clock.

[Verification record](<../docs/round17-chinchilla-verification.md>) retains historical failures, the separately reproduced dialog-key regression, and final-gate status. No generated reference exists.
