# R18 Basilisk PixelSpec — frozen source and native integration

## Fixed gameplay contract

[GDD](<../GAME_DESIGN_GDD.md#L73-L77>) calls for a causal basilisk whose fury comes from prior donation history; gaze must be directional, not an ornamental aura.
[Chapter](<../src/pages/GamePage/game/data/chapterThree.ts#L46>) places it at2890,280 with540HP and floor320.
[Body](<../src/pages/GamePage/game/entities/model.ts#L133-L135>) remains52x74 centered on the boss: x±26,y±37.
[Mechanic](<../src/pages/GamePage/game/systems/basilisk.ts>) has idle/tell/attack/recover, facing acquired at tell entry and locked through attack/recovery.
Real laser originates x±26,y+15; real projectile fan originates x±30,y. Never move these to fit art.
Normal timing1300/700/1800ms, enraged1000/850/1350ms. Stable HP phases change bullet count, while a phase transition also forces recover and clears the laser. This does not require three anatomy modes.

## Native target

- New live96x96 RGB, shared20 palette, LEFT authored; pivot48,48, scale1. No edits to existing sprites.
- Eight static poses: normal idle/tell/attack/recover, then enraged idle/tell/attack/recover. Idle is inactive phase1 only; arena entry starts active recover for2400ms. No active-idle or phase2/3-idle claim, no separate animation timer.
- A coiled, proud, threatening green serpent: large arched hood/neck, small LOW angular head, one side eye and heavy brow, grounded coils and a short separate tail. No humanoid torso, legs, wings or unrelated armor/props.
- The head is deliberately low: iris six-pixel box x25..30,y60..65 has geometric center28,63, mapping to world-20,+15. Mirroring the96-wide frame places its center+20,+15. Keep this landmark fixed in all poses.
- Beam socket at local22,63 for left-facing; the engine remains the only beam painter. No fake beam, halo or projectile in the PNG.
- Core body window x22..73,y11..84; small hood/tail decoration may leave it. Visible coil bottom row87 maps to319, three pixels below the rule box but not below the floor. Never change collision to match the silhouette.
- Upper-left light; selective1px dark outline; broad clusters with no gradients/soft alpha/noise. Normal green/cream, enraged restrained plum/copper accents; hero orange#d97757 excluded.
- Palette roles: outline2c2330; cool shadow34354f/24423b; skin426b50/8fa86b; bellycbb696/f5e8c8; eye9dded1/d9ffea; muted metal/boneb9905d/e5c386; enraged783f4a/b55a4a/723f68. Full shared20 remains the ceiling; target≤13 used opaque colors per mode.
- Parts from back to front: sketch(hidden),tail,coil-back,hood,neck,head,jaw,eye,coil-front,crest. Ground coil/hips fixed. Distinguish poses in head/brow/hood clusters as well as eye color so beam occlusion does not erase all state evidence.

## Reference provenance and admission

No new generated image or output path has been verified. No generated reference is imported or claimed; repeated directory scans were stopped. Design starts from the explicit GDD/coordinate/palette specification, not an imagined image.
Eight-pose art, independent ASE-to-PNG equality, read-only runtime integration and the8-case native scope now pass. Full local gates are2194 unit,91 browser with real backend enabled and23 Scala/HTTP, plus type/lint/build/audit0/diff; detailed admission and limitations are recorded in the progress report. The1518/85/23 numbers remain the historical R17 baseline.
Aseprite remains the sole pixel writer. Before admission: actual composite preview, independent nonfresh-labelled review if fresh capacity unavailable, at most3 bounded fixes, validate, native ASE/PNG equality, complete eight-frame shared loader guard, and ordinary-input native evidence.
Keep all real laser geometry, petrification/facing/rewind rules, HUD, Core clocks and DTO unchanged. Lift only relevant real cues/projectiles above the new body; do not rewrite unrelated render paths.

## Independent contract review

Read-only task50 confirmed eight poses, fixed optical/laser offsets and locked boss-facing. The old fixed-eye-RGB observations are migrated to independent source registration without weakening real petrification/Q or the>40px relative rewind assertion. Before arena entry, ink as well as padding can be clipped. Require>=90% visible opaque ink and all critical alternative-pose witnesses, report the clipping, and never modify camera/trigger to satisfy the test.

## Frozen eight-pose results

[Source](<source/basilisk.aseprite>), [PNG](<../public/game/basilisk.png>), [atlas](<../public/game/basilisk.json>):96x96 cells,768x96 sheet, eight single-frame100ms tags in normal/enraged action order. Durations are not gameplay timing.
Six visible layers link across eight frames; jaw/eye/crest are pose-local. Hidden sketch has eight independent copies. Total80cels=38raster+42links.
Foot rows86–87 are byte-identical. All eight complete images and their upper-crest witnesses differ. Alpha0/255,9–11 opaque colors per frame, hero orange0.
Nonfresh independent base and full-eight-pose reviews both7.5/10,0necessary; full review actually saw1x and2x. Validate Clean with32 intentional selective-outline style notes and a hidden-sketch note.
The static review alone is not gameplay verification; the separate native scope below supplies that evidence.

The current tail reachesx85. Before the arena, potentially a few tail-tip pixels as well as transparent padding can be clipped.
The03 native scope measured normal/enraged idle clipping7.5159%/4.8342%; registration and every alternative-pose signature are1.0, not a claim that all ink fits.
See [progress and pending gates](<../docs/round18-basilisk-progress.md>).

## Independent file and runtime evidence

- [74 file cases](<../tests/rendering/basiliskAssets.test.ts>) decode PNG CRC/filter plus actual ASE chunks, signed cel origins, visibility and links; all8 composites equal PNG byte-for-byte. Negative-origin transparent padding is legal, opaque overflow is zero. Never reapply cel offsets in Phaser.
- Main crest witness is XYWH(28,8,53,32), half-open[28,8,81,40), minimum pair difference214; the additional half-open[28,8,53,32) kernel is25x24, minimum96. These are different regions.
- [602 adapter cases](<../tests/rendering/basiliskSprites.test.ts>) cover actual mode/action/facing, immutable input, all8 exact rectangles, numeric0, identity changes and owned-image cleanup. Only actual furnace.enraged chooses mode; HP phases/active/player.x/clocks are not read by the body adapter.
- [Native acceptance](<../tests/e2e/basilisk-art.spec.ts>) reads640x360 pixels with RGB tolerance2, ratio/signature>=.98 and>=90% visible source ink. The fixed real laser band localY50..76 is excluded from registration; upper-source witnesses distinguish all7 other poses.
-543 actual03 matches have ratio/signature1; foot equals independently scanned screen-floorTop minus1 in every case, including actual shake. Grounded world row319 is not assumed to be fixed screen319.
- Beam covers14 of23 source-opaque head pixels; before/after head and full-ink positives remain1.0. Both donation modes petrify and realQ releases; normal right-lock/actual historical flank/mouse damage defeats the boss in the same arena.
- Body, HP, active beam, tell tip and causal bullets disappear with a live actor/background positive; cue scans run independently of body matching. The restored attempt UUID is retained across the chapter4 handoff.
- Read-only task57 is nonfresh,0BLOCKING/0NECESSARY after fixing the shake observation. This is a legal checkpoint slice, not a fresh continuous five-chapter journey or human balance review.
