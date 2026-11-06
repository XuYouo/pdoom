# Clawd shooting pose variants — R37 source design / R38 runtime admission

An edit to the existing seven-layer Clawd rig, not a new character or image-generation claim.
Keep32-square RGB, original13-colour palette, four short legs, eye spacing,16,27 pivot and all eight original frames.
R37 was source-only and did not replace production PNGs. R38 subsequently promoted byte-identical exports; the original eight-frame source remains immutable.

Append seven fire variants of original frames1..7, then seven recover variants of frames1..7.
These are a pose matrix, NOT seven sequential attack frames. Hurt remains original frame8 and has priority.
Verified R38 runtime exposure: real successful emission ->83ms fire ->50ms settle ->unmodified locomotion.
No player wind-up, no new hitbox/knockback/hitstop, no fake projectile or independent animation clock.

Fire: translate body and mask1px backward, keeping their exact opaque pixels and relative alignment.
Near arm raises2px; forearm width becomes5px to bridge recoil without detaching the hand.
Only its two outward top pixels use the EXISTING warm highlight. All four legs, far arm and tentacles stay as in each source pose.
Recovery: body/mask return to original, near arm1px high,4px wide, one outward top highlight; legs still match each base.
Preserve original running/idle/jump height variations. Canonical right-facing image may flip with existing facing; no muzzle/aim rule change.
13 colors:00000000,2c2330,d97757,eaa083,b55a4a,783f4a,f5e8c8,cbb696,34354f,575c79,858eb0,9dded1,d9ffea.

R38 integration records actual successful firePlayer/mirror emissions using existing simulation time.
shotReadyAt alone, input.fire alone, old saved actionCounts or a retained projectile do NOT prove a fresh shot.
Fresh world/attempt starts unknown; denied/full-pool/rewind/petrified actions cannot fabricate a pulse.
The receipt must remain runtime-only, copied with detached snapshots; v1/API/rewards/physics unchanged.
Actual core projectile origin is actor.x,actor.y-3, not the palm; this is an emission gesture, not a new barrel contract.

Inspect source, native filmstrips and exact pixels; validate and independently reconstruct ASE/PNG/atlas.
No fresh critic is available under current no-new-delegation constraint; report same-Lead review honestly.

Runtime admission and its deliberately aborted first full run are recorded in [R38](<../docs/round38-clawd-attack-integration.md>). Installed Phaser4.0.0 uses filter1 for nearest-neighbour; native source and actual core projectile origin stay unchanged. This is not whole-game completion.
