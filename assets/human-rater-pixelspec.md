# Human Rater — native PixelSpec / R36 admitted workstation bundle

User explicitly selected direct Aseprite drawing in question `human-rater-reference-path` on2026-11-02. This supersedes the old imagegen-first choice for THIS asset only. No generated reference was used or claimed; no reference layer will be imported.

- Canvas64x64 RGB;4 independent static states: neutral, approved, disapproved, hacked. No idle loop or new game clock.
- Foot pivot32,60, opaque art constrained to x4..60,y6..59; bottom4 rows transparent. Side/front three-quarter orthographic; upper-left light; selective outlines.
- Palette20 including transparent, identical to approved chapter-one palette; #d97757 remains player-only and must be unused. Palette list below.
- Silhouette: fixed chunky desk x5..59,y42..59, CRT at left x8..29,y24..41; bespectacled human head x32..47,y7..24, blue-grey rolled sleeves and warm tan skin. Paper and two physical buttons identify evaluation; no text/digits, floating glyphs, glow or scenery.
- Separate layers: legs, torso, head, far arm, desk, near gesture, tentacle. Shared static desk/legs across4 states; head/torso are genuine pixel shapes, not painted downscaled imagery.
- Neutral studies a small clipboard; approved/right arm gives an upward thumb; disapproved/right arm gives a downward thumb. Thumb mass and direction must read without labels; keep gesture within x48..55 and head/hand legible within candidate portrait crop x8,y4,w48,h48.
- Hacked: human leans7px left with surprised raised palms; a single purple tentacle comes from beneath the right desk and presses the mint button. Nonviolent, no injury. Fixed desk footprint/CRT/ground line. Tentacle may leave the portrait crop at its far-right curve; button contact and human reaction must stay inside.
- R36 verifies real physical support and draw order without collision changes. Both Loom rooms and C1room2 use-56px; others+56px. Prior candidate offsets were not automatic admission.
- [R36 runtime acceptance](<../docs/round36-human-rater-integration.md>) passed one full153 browser run,5526 unit tests and23 fresh backend cases; original menu slot, v1/API, rewards, clocks and collisions remain. The R35 checkpoint below is historical source provenance.

Palette: #00000000 #2c2330 #d97757 #eaa083 #b55a4a #783f4a #f5e8c8 #cbb696 #34354f #575c79 #858eb0 #9dded1 #d9ffea #0f191b #24423b #426b50 #8fa86b #b9905d #e5c386 #723f68

## R35 source checkpoint

Four native static states now exist, with seven visible layers and the exact20-color palette. Desk and legs share linked cels; hacked head/torso lean exactly7px left without losing opaque pixels. The fist extends to x47 rather than the initial48, still inside the unchanged48-square crop.

Native export uses padding0: actual padding1 exported66-square rectangles against64-square sourceSize and failed independent tests. Transparent art margins already provide at least3px gutters. A crop_to_content call unexpectedly cropped the whole canvas; the source was restored through live Aseprite from its native backup, then only the exact torso cel was rewritten. Final4x composite bytes equal the pre-recovery preview.

This is source-only, not a scene/menu or whole-game acceptance. Review is by the same Lead, not an independent cold reviewer. No generated reference, new color, collider, timing loop, v1/API or game state change is claimed.
