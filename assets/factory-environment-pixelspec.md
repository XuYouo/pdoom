# Factory environment PixelSpec - design contract, not admitted

## Scope and authority

Follow the [GDD](<../GAME_DESIGN_GDD.md#L67-L71>), [page-private architecture](<../架构与开发规范参考.md#L1425-L1461>) and approved [shared art direction](<chapter-one-art-spec.md>). Phaser package AND installed engine are4.0.0. Live Aseprite1.3.18.6-dev is ready, tileset list supported; Lead is sole artist. Sydney, Probe, Clawd and first-chapter assets stay frozen. The existing approved tool-reference then native-pixel workflow applies; no repeated per-tile approval.

## Geometry and state

640x2040 vertical world,640x360 native viewport. Real platform heights12/24/28;180px main steps alternate x150/310 at55px rise,100px side branches; no grid-snapping collision or stretching16px texels. Source textures clip exactly to real rectangles. Green protected3px edge remains a true semantic cue, not a promise against the sea.

Sea starts at spawn.y+165, rises52px/s, stops at y380; feet y+11>=seaY kill, including Q/dash. Sea consumes even protected platforms by their real top y. Render only actual seaY/collapsed/platforms; no second timer, inferred sea, false waves above the boundary or fabricated disappearances.

## Native delivery target

16px terrain kit: about32 unique mother tiles on a256x128 mockup. Left8x4 mother cells, right repeating3x3 tests, lower exact12px ledge/solid-floor combinations; MCP pack/grid export, never claim blob47. Roles: green main ledge caps/body, brass service caps/body, structural floor top/body/base, quiet bulkheads/rails/conduits, and visibly open hooked metal-paperclip mass/surface. Actual packed indices must be read, not assumed.

Six static64x64 rear props: wire spool, paperclip-bending press, clip hopper, service cabinet, vertical conduit joint, inspection grille. Same scale/light; no characters, pickups, fake ledges or baked text. Checkpoint flags/donation/pickups and actual control/combat effects stay semantic Graphics.

## Art direction and gates

Side view, upper-left light, selective cool1px edges, hard alpha0/255. Oppressive steel shaft with quiet central play lane; machinery restricted to low-contrast side dressing. Small crisp hook/curl silhouettes must say paperclips, not blue water or generic blocks. Repeating material mostly quiet; variants preserve outer2px seams. Static sea pattern is bounded by actual hazard height, not a cosmetic animation.

Palette ceiling20 including transparent: 00000000, 2c2330, d97757, eaa083, b55a4a, 783f4a, f5e8c8, cbb696, 34354f, 575c79, 858eb0, 9dded1, d9ffea, 0f191b, 24423b, 426b50, 8fa86b, b9905d, e5c386, 723f68. Reserve d97757: zero use. Foreground steel34354f/575c79/858eb0; sparse mint edges; dark0f191b/24423b bulkheads, limited brass service details. No baked pink/bullet/HP cues.

Use generated design only as reference, then draw native pixels live. Inspect native/tiled previews; independent honest-context critique, bounded targeted fixes, validate, exact source/PNG reconstruction and seam checks precede engine admission. Keep original sea/PUA/death particles and warnings visible above correct layers. New native source-specific tests must replace obsolete background-color assumptions, not weaken actor/sea/collapse positive controls. Pause/rest/WebGL/resize/resource identity/cleanup and full1167/77/23 baseline remain required. This was the pre-authoring gate; finalR16 admission is recorded below.

## Actual design reference and first terrain gate

[Reference](<../generated-images/image-20261030-031657-49d81b.png>): actual2048x768 RGB, gpt-image-2.5; requested1536x1024/high, actual quality unreported. Retain wire-spool/C-press/hopper silhouettes and quiet central shaft; reject excessive rivets/cables, closed noisy loops, uneven sea crest and supports outside collision. Six machines are actually arranged3 columns by2 rows.

Terrain [source](<source/factory-tiles.aseprite>) is256x128,32 distinct16px mothers plus native repeat/assembly tests. [1x draft](<../artifacts/asset-review-r16/a-native.png>) and [4x](<../artifacts/asset-review-r16/a.png>) received7.5/10,0 blocking/necessary fixes from reused-context critic. A fresh-member attempt hit the team limit; not claimed fresh. Paperclip/coil ambiguity is nonblocking statically; sea composition was not yet verified in-game at this static gate. Freeze the structure.

MCP packed128 cells into32 tiles; [PNG](<../public/game/factory-terrain.png>)/[JSON](<../public/game/factory-terrain.json>) are96x96,6 columns. Actual slot wall-a8/clip-fill-a9 precede floor-left10; read all role indices from provenance. Packed composite equals raster byte-for-byte RGBA.12 opaque colors, hard alpha, hero orange0. Raster validate Clean+2 deliberate style notes; packed validate Clean+hidden-mockup note. Props and runtime admission were pending at this first gate; see final evidence below.


## Completed native props and bounded review

The six-frame [source](<source/factory-props.aseprite>) uses visible housing/mechanism/details layers, static single-frame tags and600ms metadata, not a new animation clock. [PNG](<../public/game/factory-props.png>) and [atlas](<../public/game/factory-props.json>) are384x64, six untrimmed64px frames. Eleven opaque palette colors, hard alpha, hero orange0; source composites equal all exported frames. The conduit has identical full64px first/last RGBA rows with8 opaque columns. Two wire-corner strays were connected with3 pixels; retained open-conduit/mesh outline warnings are intentional, not called warning-free.

Reused-context static review scored7/10,0 necessary fixes. Spool/cooling-unit and grille/monitor ambiguity remains accepted for noninteractive rear dressing. No claim that every prop uniquely reads as its intended machine.

## R16 integration evidence, not full GDD release admission

[Pre-input-fix pure/typed gate](<../artifacts/verification/r16-unit-type-lint-01.log>):1374/1374 tests in49 files, typecheck and lint pass. This includes149 independent renderer/plan cases and58 native-file cases. Original [package](<../package.json>) and [npm lock](<../package-lock.json>) hashes remain unchanged after the documented unexpected pnpm auto-install was reversed; see [recovery](<../artifacts/verification/r16-dependency-recovery/result.json>) and [provenance](<factory-environment-generation.json>).

[Native environment gate](<../artifacts/verification/r16-native-environment-02.log>):3/3. The actual starting view's11 ROIs match source pixels100% within2RGB tolerance, including exact28px ground/12px ledge bounds, low-alpha spool and both sea caches. The ordinary pause preserves the canvas through2.8s and a real WebGL loss/restore without a Core tick. Ordinary Q does not prevent the subsequent sea death. Missing/wrong-sized unused prop frames prevent readiness and preserve the save. These are checkpoint rendering slices, not fresh journeys.

[Probe migration](<../artifacts/verification/r16-probe-migration-01.log>):4/4. Replaced obsolete flat-color assumptions with independent source signatures and true world-phase background blending. A visible probe and the protected3px stripe must register exactly; all original body/state thresholds remain. The side platform is source-positive before actual consumption, absent afterward, while native background and the protected neighbour remain positive. No camera or Core change was needed.

Actual two-frame scene review scored7/10,0 blocking/necessary fixes, nonfresh context. Freeze the art. The sea still has a noticeable regular clip-icon pattern; material realism is not called fully solved. Only the visible rear machine and two starting-area views were reviewed, not all props, the whole chapter or GPU performance. The later lead review additionally saw native platform consumption and the24px cleared arena. Final [1385-unit code gate](<../artifacts/verification/r16-full-gate-04.log>), [80-browser gate](<../artifacts/verification/r16-browser-03.log>) and [23-backend gate](<../artifacts/verification/r16-backend-tests.log>) pass. Eleven input-edge regression cases were added without changing Core or native thresholds. productionReady is true for this asset family; fullGddComplete remains false. See the [complete report](<../docs/round16-factory-environment-verification.md>) for failures and limitations.
