# Leviathan PixelSpec — design locked, not yet admitted

## Mechanical source

Follow the [read-only contract](<../docs/round20-leviathan-contract.md>) and actual Loom/Core, not reference-image physics. Phaser4.0.0, native640x360 NEAREST/FIT, view-only renderer; no Core/DTO/camera/timing changes.

Body center(2490,448),144x144 contact domain. Canvas160x160,pivot80,80; contact local[8,8,152,152). ArenaA/B floors520/508 do not reposition the Boss. Actual projectile origin is local(2,80).

## Visual target

Mineral/abstract voracious conqueror: a large GREEN HEXAGONAL VORTEX with counter-rotating faceted rings and an inward iris, not a walking animal, generic coil logo or busy mechanical wall. One dominant six-sided swallowing mouth; restrained fixed corner anchors make the full square contact domain legible.

Front view, centered, upper-left light, hard pixel clusters,1px dark outline with sparse mint highlights. No smooth gradients, fake glow blur, text, teeth/limbs without a role, external particles or scene background. Hero orange is reserved and absent.

Palette ceiling20, copied from the admitted family; new source uses a subset. Transparent00000000; outline0f191b/2c2330, green shadow24423b, mid426b50, light8fa86b, mint9dded1/d9ffea, cool facets34354f/575c79/858eb0, optional brassb9905d/e5c386 and void723f68. Other family entries remain available but are not a license to widen the palette.

## Eight authored frames

0..3 closed-phase0..3;4..7 open-phase0..3. Every100ms of actual save elapsed advances phase modulo4; alternating rings turn in opposite directions in hand-redrawn quarter-period phases. Never algorithmically rotate the bitmap or use a second animation clock.

Closed is the ordinary sealed state. Open only follows true weakUntil>now, not ordinary recover or lowHP. The open iris retracts visibly; it is not merely a colour swap. Tags closed0..3/open4..7, forward,100ms per frame, no trimming,8-frame horizontal1280x160 atlas.

Rig: anchors / outer-rotor / inner-rotor / iris. Anchor cels may link across8; iris cels may link within each state. Moving rings are authored per phase. Intended source transparency hard0/255.

## Independent Core cues

Keep central local rectangle(67,65,26,30) clear in every source frame. Its dark/weak fill, outline and sealed line remain actual Core graphics, as do144-square domain cue,HP,shots,swallow targets,narrowing region,line2240,left-turn arrow/countdown andrealmusic/HUD state. No permanent gold arrow, fake health bar or baked bullet in the skin.

Native active skin alpha1/inactive.55; fixed center, no flip or floor snapping. hp0 hides even if weakUntil is left over. Full inactive body is not naturally camera-visible pretrigger, so it is not a required impossible browser witness.

## Pipeline and acceptance

No new image-generation output was obtained or imported. Proceed from the explicit written GDD/mechanical design; an unverified image is not a reference. Generated geometry/colours are not authority; redraw native art in live Aseprite. Never ship a downscaled reference as the sprite.

Independent anonymous cold read before brief-aware review, at most3 necessary corrections;7/10 with0blocking is enough to freeze. Source proof needs8 unique frames/consistentpivot/palette/alpha/realcel reconstruction. Actual native browser proof must preserve existing Loom/audio/collision controls and later add source pose registration,realweak andphase/death/cleanup coverage. Current CP2 browser route doesnotshoot and doesnot certify all phases.

Project audit12 moderate development-chain entries remain open separately. This design is not a production or whole-GDD completion claim.
