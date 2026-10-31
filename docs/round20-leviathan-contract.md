# Leviathan native-art contract — next-milestone draft only

Persisted from the read-only task77 specialist report. No new sprite, code, test or runtime admission is claimed here. Actual engine stays Phaser4.0.0; re-read relevant implementation and preflight live Aseprite before any future drawing.

## Fixed mechanics

- [GDD identity](<../GAME_DESIGN_GDD.md#L79-L83>): a huge green hexagonal vortex, not a newly invented walking quadruped.
- [World](<../src/pages/GamePage/game/data/chapterFour.ts#L7-L15>):2580×640; arena(1940,200,640,360),trigger1960. Only expanded, uncollapsed graph nodes support the player; no continuous floor.
- [Body and combat](<../src/pages/GamePage/game/systems/combat.ts#L108-L138>): fixed center(2490,448),420HP,144×144 full square contact/hit domain(2418,376)..(2562,520),contact24. The inner26×30 aperture is a weak-state indicator, not the only target.
- [Platforms](<../src/pages/GamePage/game/data/loomGraph.ts#L42-L50>): arena A top520/B508; center2240, widthA=180−2(seed%4),B=A−16,h12; seed42 A176/B160. [R](<../src/pages/GamePage/game/systems/loom.ts#L101-L124>) changes real platforms but never relocates the Boss. Swallow may leave no platform below it. Never invent a Basilisk-like floor-anchor invariant.
- [State machine](<../src/pages/GamePage/game/systems/leviathan.ts#L7-L58>): initial recover2400; normal tell1200→attack2800→recover1200. Real successful left-turn gives recover/weak3200. HP floors280/140 force transitions and clear weak/turn/pull/swallow; closed shell takes0. `recover` alone is not weakness and HP cannot open the aperture by itself.
- [Left-turn condition](<../src/pages/GamePage/game/systems/leviathan.ts#L62-L79>): player action during attack, not Q; actual center-anchor support/feet error<1, dash active/vx<−250/facing−1; start line2240+4..64, travel left>=32 and reachline−14. R that tick does not count. Success stops pull/clears hostile shots, returns HUD/music, never swallowed platforms.
- [Swallow](<../src/pages/GamePage/game/systems/leviathan.ts#L24-L43>): outerL,outerR,innerL,innerR; natural stages add2/1/1, width640→410→about300→center anchor. Later tell can have emptyids and remain genuine. Player HP readout is swallowed, not actual HP; Boss64×4 bar still exists. Loststems=min(4,eaten.length),success temporarily returns0,nexttell swallowsagain.
- [Projectile origin](<../src/pages/GamePage/game/systems/leviathan.ts#L42-L50>):(bx−78,by),aimatactualplayer;3/5/7 shots,speed120/135/150,r5,damage18/20/22,TTL4500. Existing dedicated Core keeps Boss facing−1 and position fixed. Never interpret the player's left-turn as Boss flipping.

## Smallest candidate art contract — still to confirm

[Current shape](<../src/pages/GamePage/game/systems/LoomRenderer.ts#L124-L147>) has only closed/weak-open semantic appearances. Minimum2poses; if preserving rotation, closed/open×4 hand-drawn rotor phases (8frames) may cover the basic60-degree symmetry of the existing100ms-quantized15-degree rotation. Asymmetric final details still need review. Read actual elapsed time, no second clock/arbitrary PNG rotation; enteredAt is not reset at everyaction.

Candidate160×160,pivot(80,80);144-domain atlocal(8,8),aperturelocal(67,65,26,30),realemissionlocal(2,80). Minimal rig:shell/contact-frame,rotors,aperture. The square contact corners must remain legible rather than silently shrinking the hitbox to a hexagon.

Entry recover/tell/attack and realdash weak are naturally reachable;phase2/3 need realdamage. Inactive pretriggerx<1960 cannot show a full body: [camera](<../src/pages/GamePage/game/systems/cameraFrame.ts#L11-L24>) rightedge≤2365 is left ofbody2418, then entry has120ms smoothing. Do not demand impossible complete inactive-idle evidence. No right-facing/walk/run/death pose is currently justified;hp0 hides immediately even if weakUntil remains set.

## Independent cues and verification limits

- Preserve actual swallow target orange boxes/links, collapse/noncollidingghost, narrowing region,line2240,turn arrow/countdown,remainingweak andrealHP/music. None belongs baked in the skin. [Loom cues](<../src/pages/GamePage/game/systems/LoomRenderer.ts#L68-L121>).
- Body,player/voidbullets,HP andLoomcombat currentlyshareg(depth0),title2,HUD6. FutureImage2 must not cover actualcues; separatebodyreplacement fromforegroundcue3/title4 as needed without moving Core. [Integration](<../src/pages/GamePage/game/systems/WorldRenderer.ts#L257-L314>),[HP](<../src/pages/GamePage/game/systems/WorldRenderer.ts#L358-L362>).
- Current [browser case](<../tests/e2e/loom.spec.ts#L199-L244>) is legalCP2→normalnavigation→firstleftturn→HUD/actualPCMreturn→reswallow. It explicitly doesnotshoot and proves neither all phases/kill nor source-pixel body registration. [Pure rule routes](<../tests/game/loomPlaythrough.test.ts#L43-L86>) can readWorld tochooseFrameInput; that is not browser visual proof.
- Next gate needs independent PNG/atlas registration, multi-colour/pose witnesses, realcueoverlap,pausedfreeze,hp0/crosschapter/restartcleanup. Do not let newbodycolours spoof existingClawdorange/marker/platform [RGB observations](<../tests/e2e/loom.spec.ts#L36-L70>). [Release](<../src/pages/GamePage/game/systems/leviathan.ts#L81-L84>) leavesweakUntil:weakalonecannotkeepdeadbodyvisible.

Final canvas,palette/detail and actual native visibility/rotation witnesses remain pending. This draft does not authorize engine upgrades, new physics, synthetic browser state or broadening an existing sprite palette silently.
