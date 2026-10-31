# Sydney native body - admitted

> Native body admitted after source, gameplay and full regression gates. This is not full-GDD completion.

## Delivered scope

[Source](<../assets/source/sydney.aseprite>), [PNG](<../public/game/sydney.png>), [atlas](<../public/game/sydney.json>), [PixelSpec](<../assets/sydney-pixelspec.md>) and [provenance](<../assets/sydney-generation.json>). Only the body replaces the old Graphics shape. Factory scenery and real combat effects remain separate.

96x96 cells on a1152x96 sheet; 12 distinct static poses,11 layers,128 cels (23 raster/105 linked),20 palette slots/10 used opaque colors, alpha0/255, no Clawd-orange pixels. Seven common layers and same-pose arms are linked. References/sketches are absent. Independent source reconstruction equals all PNG pixels.

Actual inclusive bounds are[26,14,70,84] for idle/recover and[22,14,73,84] for tell/attack. The52x74 collision is unchanged. Native source selection uses only actual Core phase/action/x/y; no second bob, animation clock, HP inference or target prediction.

## Art evidence and failures retained

Two generated references actually2172x724 RGB, despite requested1536x1024/high; final pixels were manually drawn in live Aseprite, not downsampled references. Empty-reference rejection and the first long-PTY failure remain in provenance. Initial A scored6/10 (generic hood/robe); one structural pass produced B8/10. The [full12-pose strip](<../artifacts/asset-review-r15/review/c.png>) scored8/10 with0 blocking/necessary fixes. Reviewer context was reused, not fresh; this is a static score. Native1x sheet and actual legacy-smoke scene images were also read by Lead.

First validate reported9 errors/80 warnings: isolated diagonal eye/crack pixels plus a real recovery-hand overlap at(51,50). Connected clusters and a lower skirt-fracture start fixed all errors. Final validate:0 errors,76 selective-outline style warnings,0 banding notes; all layer-frame and arm/corruption overlap contracts pass. Warnings are retained because light/cool material edges intentionally do not share one outline color; not claimed warning-free.

The rows preview actually exported a horizontal4608x384 strip. Missing reference cels needed explicit copies; color selection unexpectedly returned1 pixel and was cleared without using it.

## View-only integration

[Adapter](<../src/pages/GamePage/game/systems/SydneySpriteRenderer.ts>) owns one Image, alpha1/scale1/depth2, including inactive Sydney. [Binding](<../src/pages/GamePage/game/data/sydneyAssets.ts>) uses actual exported names. [Integration diff](<../artifacts/verification/r15-view-integration.patch>) keeps real radius42 tell, HP and Sydney projectiles atdepth3 and labels4; cleanup precedes death/stage early returns. All12 frames are checked before ready. Core, v1 DTO/API, four HUD counters and package/lock are unchanged.

## Reachability is not the static matrix

Only10 poses naturally occur: inactive phase1 idle plus three phases of tell/attack/recover. Arena entry immediately starts recover1200ms; phase changes start recover1000ms. The active loop never returns to idle. Phase2/3 idle are spare static/mapper cells, not manufactured browser coverage. Tests start from legal cp2 and climb normally; not a fresh continuous chapter or five-chapter journey.

## Verified gates

| Gate | Actual result |
|---|---|
| [Code gate](<../artifacts/verification/r15-code-gate-02.log>) | 1167/1167 unit,47 files,5.93s; lint/type/build/audit0/diff,EXIT0 |
| [Legacy factory smoke](<../artifacts/verification/r15-integration-smoke-01.log>) | 4/4,49.5s; Sydney binding/J release actually observed; EXIT0 |
| [Existing browser regression](<../artifacts/verification/r15-existing-browser-01.log>) | Explicit21 old specs:73/73,7.7m,backend enabled,no skip; excludes new Sydney spec; EXIT0 |
| [Fresh private PG backend](<../artifacts/verification/r15-backend-tests.log>) | 23/23 real Scala/HTTP/security,14s; EXIT0 |
| [Three-phase native battle](<../artifacts/verification/r15-native-sydney-05.log>) | 1/1,2.6m; all10 live poses, victory and same-arena cleanup; EXIT0 |
| [PUA/phase1 three repeats](<../artifacts/verification/r15-native-sydney-06-repeat.log>) | 3/3,2.6m; EXIT0 |
| [Final merged gate](<../artifacts/verification/r15-full-gate-02.log>) | 1167/1167 unit,47 files,4.59s;77/77 browser,10.8m,backend enabled,no skip; lint/type/build/audit0/diff,EXIT0 |

New unit coverage:112 adapter cases plus53 independent PNG/ASE cases. [Bound](<../artifacts/asset-review-r15/factory-native-01/sydney-bound.png>)/[released](<../artifacts/asset-review-r15/factory-native-01/sydney-released.png>) smoke screenshots were read and archived without re-encoding. They are1440x810 compositor images, not the separate640x360 native-pose proof.

## Native gameplay evidence

[Selected-frame ledger](<../artifacts/asset-review-r15/runtime-review/evidence.json>) preserves original paths/hashes and measurements. Native05 retained668 real640x360 frames and710 analyzed views:663 source-matchable samples;47 unmatched/out-of-view/occluded/cleared views are not hidden. All10 reachable poses occurred. Minimum whole-body match99.118%, all-pair signature100%, minimum51 discriminating witness pixels, maximum known-projectile occlusion12.513%. These are image-proof statistics, not a performance benchmark.

Ordinary checkpoint climbing reaches inactive idle1 before the real trigger. Full/native tell proves the original42px circle and64px HP bar; a3400ms real pause freezes the canvas, body, HP, HUD and checkpoint. Actual PUA first blocks movement; mouse is released before J, shots remove the real bubble, control clears and movement resumes with both combatants alive. No exact shot count is inferred from requested input duration.

The battle crosses the real280/140 HP thresholds, stops firing and observes all active poses. New5-dialogue/6-knife/7-dialogue+6-knife emissions and separated fans are checked independently; old lingering bullets cannot substitute for new onsets.

[Live positive](<../artifacts/asset-review-r15/native-05/sydney-art-Sydney-real-ord-7e727--arena-before-chapter-three/sydney-live-before-defeat.png>) and [same-arena death](<../artifacts/asset-review-r15/runtime-review/defeated-same-arena.png>) use raw canvas, not a covering DOM overlay. Body/HP/bubble disappear; an independently anchored danger sweep reaches0, not a body-null shortcut. Normal victory saves stage3/checkpoint0 with positive HP, increased time/shots and the same restored attempt; third-chapter rendering has no Sydney.

Real PNG failure and missing exported unused idle2 frame4 block ready, preserve the EXACT raw checkpoint, and recover via explicit refresh without starting/restoring a new run.

## Observation failures retained, not gameplay weakened

- [Native01](<../artifacts/verification/r15-native-sydney-01.log>):2/4. A genuine dialogue box hid body witnesses; a hero-only observer incorrectly required a simultaneous body. Short live-input taps also missed updates. Require a source-matchable live body when needed and inspect every captured frame.
- [Native02](<../artifacts/verification/r15-native-sydney-02.log>):3/4. Two-rAF alignment overshot. Restore the already-regressed lightweight compositor navigation; keep4px alignment and reserve native640px proof for art.
- [Native03](<../artifacts/verification/r15-native-sydney-03.log>): battle0/1. A real last-ledge gap54px was reached, but an unmatched view triggered another jump. Stop from visible ledge geometry and allow bounded ordinary no-input settling; never manufacture idle.
- [Native04](<../artifacts/verification/r15-native-sydney-04.log>): all10 poses/new emissions observed, but725 raw frames/794 rows exhausted240s before victory. Batch paused decoding of fixed art/masks; keep every frame, all assertions and the same timeout. Native05 then passed in2.6m. This is observer optimization, not a game-FPS result.
- [First full gate](<../artifacts/verification/r15-full-gate-01.log>):1167 unit and76/77 browser,11.0m. The short PUA-only case had not actually observed attack2 through the first emission; the complete battle and other75 cases passed. Require an explicit ordinary phase1 observation cycle; three repeats passed before rerunning the merged gate. No Core, art, matcher threshold, real effect layer or timing contract was weakened.

## Independent scene review

The existing reviewer actually read six selected640x360 images: nonfresh,0 visual BLOCKING,0 necessary fixes. Bridal silhouette/three tails and Clawd remain distinct; real cues, HP and bubble remain readable. Some phase3 bullets obscure part of arm/skirt, not face/overall body/HP. No new polish requested; selected stills do not prove motion or mechanics.

## Service and completion boundary

Private PostgreSQL16.14 and Java17.0.17 API were used for the verified gates. Owned API then PG were stopped and their terminals closed; both8081/55439 now refuse connections (61). The private cluster is retained, not deleted. [Cleanup proof](<../artifacts/verification/r15-service-cleanup.json>) records frontend8080 stillHTTP200. No host service/config changes, external publish or engine upgrade.

The existing Phaser chunk warning remains (~1352kB minified); no low-end60FPS claim. Factory environment, later chapter art/content, full audio/human listening, progression/procedural depth, accessibility and a fresh continuous five-chapter browser journey remain incomplete. The whole-GDD goal stays active.

Post-document [lint/type/unit/diff recheck](<../artifacts/verification/r15-post-document-gate.log>):1167/1167,47 files,4.42s,EXIT0. [Local link/JSON/history check](<../artifacts/verification/r15-document-check.json>) and [final source hashes](<../artifacts/verification/r15-final-source-hashes.json>) preserve the admitted files; historical Gato data and package/lock remain unchanged.
