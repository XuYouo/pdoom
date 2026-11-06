# Leviathan native-art contract — frozen mechanics, admitted native asset

Mechanics below originate in the read-only task77 report. Initial integration is historical in [R20](<round20-leviathan-progress.md>); current admission is [R21](<round21-leviathan-verification.md>).
Actual engine stays Phaser4.0.0. Future art edits still require live preflight and current sprite_info; no engine/physics/DTO/camera changes.

## Fixed mechanics

- [GDD identity](<../GAME_DESIGN_GDD.md#L79-L83>): a huge green hexagonal vortex, not a newly invented walking quadruped.
- [World](<../src/pages/GamePage/game/data/chapterFour.ts#L7-L15>):2580×640; arena(1940,200,640,360),trigger1960. Only expanded, uncollapsed graph nodes support the player; no continuous floor.
- [Body and combat](<../src/pages/GamePage/game/systems/combat.ts#L108-L138>): fixed center(2490,448),420HP,144×144 full square contact/hit domain(2418,376)..(2562,520),contact24. The inner26×30 aperture is a weak-state indicator, not the only target.
- [Platforms](<../src/pages/GamePage/game/data/loomGraph.ts#L42-L50>): arena A top520/B508; center2240, widthA=180−2(seed%4),B=A−16,h12; seed42 A176/B160. [R](<../src/pages/GamePage/game/systems/loom.ts#L101-L124>) changes real platforms but never relocates the Boss. Swallow may leave no platform below it. Never invent a Basilisk-like floor-anchor invariant.
- [State machine](<../src/pages/GamePage/game/systems/leviathan.ts#L7-L58>): initial recover2400; normal tell1200→attack2800→recover1200. Real successful left-turn gives recover/weak3200. HP floors280/140 force transitions and clear weak/turn/pull/swallow; closed shell takes0. `recover` alone is not weakness and HP cannot open the aperture by itself.
- [Left-turn condition](<../src/pages/GamePage/game/systems/leviathan.ts#L62-L79>): player action during attack, not Q; actual center-anchor support/feet error<1, dash active/vx<−250/facing−1; start line2240+4..64, travel left>=32 and reachline−14. R that tick does not count. Success stops pull/clears hostile shots, returns HUD/music, never swallowed platforms.
- [Swallow](<../src/pages/GamePage/game/systems/leviathan.ts#L24-L43>): outerL,outerR,innerL,innerR; natural stages add2/1/1, width640→410→about300→center anchor. Later tell can have emptyids and remain genuine. Player HP readout is swallowed, not actual HP; Boss64×4 bar still exists. Loststems=min(4,eaten.length),success temporarily returns0,nexttell swallowsagain.
- [Projectile origin](<../src/pages/GamePage/game/systems/leviathan.ts#L42-L50>):(bx−78,by),aimatactualplayer;3/5/7 shots,speed120/135/150,r5,damage18/20/22,TTL4500. Existing dedicated Core keeps Boss facing−1 and position fixed. Never interpret the player's left-turn as Boss flipping.

## Frozen source contract

160×160,pivot80,80;contact local[8,8,152,152),Core-clear local(67,65,26,30),actualemission local(2,80).
Four layers:anchors / outer-rotor / inner-rotor / iris;32cels＝11compressed＋21linked,20palette includingtransparent,5/7opaque colours andhard0/255alpha.
Eight manually authored frames:closed0..3/open4..7. phase=floor(actualsave.elapsedMs/100)%4,open only realweakUntil>now;no second clock,bitmap rotation or action-reset timer.
Fixed body center,never flip or snap tofloor;full144square contact/hit domain stays legible,not silently shrunk tohexagon.
No invented right-facing/walk/run/death poses;hp0 hides despite leftoverweakUntil.

Entry recover/tell/attack and trueleftdash opening are naturally reachable;phase2/3 need realdamage.
Inactive pretriggerx<1960 cannot showfullbody: [camera](<../src/pages/GamePage/game/systems/cameraFrame.ts#L11-L24>) rightedge≤2365 is leftofcontact2418,followedby120ms entrysmoothing.
Do not require an impossible full inactive-idle browser witness.

## Independent cues and current limits

[Body integration](<../src/pages/GamePage/game/systems/WorldRenderer.ts>) usesImage2;contactfill remainsbehind.
[Loom cues](<../src/pages/GamePage/game/systems/LoomRenderer.ts>) keeptrue144outline,26×30Core,swallow targets/links,narrow region,line2240,leftarrow,projectiles andHP onforeground3;Boss title4 andunique localdeadline6.
React ownsonecurrentinstruction andtimeline/HP/music state,not a second large native statusboard. None ofthese cues isbaked inskin.

The original [CP2 browser route](<../tests/e2e/loom.spec.ts#L201>) stilldoesnotshoot:normalnavigation→firstleftturn→HUD/actualPCMreturn→reswallow.
The added [native case](<../tests/e2e/loom.spec.ts#L269>) independently registers8sourceposes,realopening/reclose,pause/nativeGLrestore andrealA/B reroll withfixedbodyanchor.
Initialwide-field source1 wascorrectly rejectedundertrueforegroundnarrowline;laternaturally narrowerfields providedstrictqualifyingwitnesses withoutthreshold/source/geometry changes.
Threeadditionalrealresourcefaults preventready,preservecheckpoint andallowretry. R20Loomscope7/7 wasnot then-currentfull100browser/backendgate; R21 complete102/23 functional regression now passes.
[Pure rule routes](<../tests/game/loomPlaythrough.test.ts#L43-L86>) mayreadWorld tochooseFrameInput;thatdoesnot make thembrowserjourneyproof.

R21 verified allHP-phase ordinary nativekill,samearena hurtdefeat/retry,crosschaptercleanup and current102browser/23backend. Remaining: fresh continuous journey and subjectiveplayback/humanlistening.
[Release](<../src/pages/GamePage/game/systems/leviathan.ts#L81-L84>) leavesweakUntil;weakalonecannotkeepdeadbodyvisible.
Do not add synthetic browserstate,spoofhero/marker/platformcolours or silently widen thepalette. Nativeasset productionReady is asset-scoped; game release/security and fullGddComplete remainfalse.
