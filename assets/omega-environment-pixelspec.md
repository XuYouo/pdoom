# Omega Point environment PixelSpec — R24 source candidate

## Authority and scope

[Approved shared direction](<chapter-one-art-spec.md#L5-L22>) and [already-chosen reference workflow](<chapter-one-art-spec.md#L37-L45>), [GDD](<../GAME_DESIGN_GDD.md#L85-L105>), [actual geometry](<../src/pages/GamePage/game/data/chapterFive.ts>) and [readonly contract](<../artifacts/verification/r23-next-chapter-contract.md>).
ActualPhaser4.0.0/native640×360/NEAREST/FIT. Existingfourenvironments/Clawd/mirror/Core/DTO/camera/input/fixedtick/old108 frozen. Source-only; no loader/renderer/collision integration or inherited browser admission.

## Art spec

A cooling compute corridor opens into a deliberately empty office: one abandoned swivel chair, the final door and a tall mirror. Terminalcalm afteroverload,not reusedGPUmoon/Loomtree. No signs/labels/glyphwallpaper/characters/fakemonsters/combatmarkers. Side/front elevation,one shallow topplane,upper-leftlight,selectivedark1pxedges,cleanclusters. Slate/jade machinery,mutedplum officejoinery,smallcopperfurniturerim; quietroom emptierthancorridor.
Shared20 entries exactly:
`#00000000 #2c2330 #d97757 #eaa083 #b55a4a #783f4a #f5e8c8 #cbb696 #34354f #575c79 #858eb0 #9dded1 #d9ffea #0f191b #24423b #426b50 #8fa86b #b9905d #e5c386 #723f68`.
Heroorange d97757=0pixels; alpha0/255; prefer8–13usedopaquecolours. No palettewidening. Matte upholstery versusbandedsteel; mirrorborder/glints withtransparentinterior,not paintedreflection/eyes.

## Native terrain

256×128 authoring,16grid. First128×64 holds32distinctmothers,rowmajor8×4; othercells repeat/assemblychecks referencingthem,not extrauniquetiles. Exactpack/grid32unique+empty; PNG96×96/6columns/32frames/4transparenttrailingslots. ASEindexN→PNGslotN−1; authoringmap isnotcollision.

| slots | roles | alpha/geometry |
|---|---|---|
|0..3|corridor-top-left,corridor-top-mid-a,corridor-top-mid-b,corridor-top-right|0..2transparent,3..15body; actualCoretop3 separate|
|4..7|corridor-body-left,corridor-body-a,corridor-body-b,corridor-body-right|full16body|
|8..11|corridor-foot-left,corridor-foot-a,corridor-foot-b,corridor-foot-right|onlyrows0..7ink;8..15transparent; native8bottomcrop|
|12..15|chamber-top-left,chamber-top-mid-a,chamber-top-mid-b,chamber-top-right|0..2transparent,3..15body|
|16..19|chamber-body-left,chamber-body-a,chamber-body-b,chamber-body-right|full16body|
|20..23|chamber-foot-left,chamber-foot-a,chamber-foot-b,chamber-foot-right|onlyrows0..7ink;8..15transparent|
|24..27|observer-left,observer-mid-a,observer-mid-b,observer-right|onlyrows3..11ink;otherrowstransparent,h12|
|28..31|quiet-wall,rear-channel,rack-base,floor-recess|lowcontrastbackground,notloadbearing|

EachmidA/B pairpreservesouter2px; no flippinglitcaps. Check3×3 bodyrepeats,40px3rowassemblies,12pxobserverwidth130→2pxremainder. Real3200×360/floor320,three40pxfloors/three12pxobservers/two60gaps stayunchanged; no16snap/stretch/solidwholefloor.

## Native props

One64×128document,sixstatic100msframes,sourcestandardpivot(32,120),horizontal384×128,no trim/rotate. Threeordinaryrearprops occupy the64px beforebaseline120 (banky56,cabley60,ducty64;notcanvaslowerhalf); furnitureusesnativepixels,notruntime downscaling. Layersstructure/material/details; sixsingleframetags arelabels,notanimation.

|frame|role|targetspacecontract|
|---|---|---|
|0|compute-bank|two-baycoolingstack,quietvents/sockets,y56..119,lowcontrast|
|1|cable-arch|broadsegmentedloop/twofeet,y60..119,notfakedoor|
|2|air-duct|short ribbedexhaustelbow/maintenanceplinth,y64..119|
|3|empty-chair|emptyofficeback/armrests/seat/stem/five-waywheeledbase,about48×80,baseline120|
|4|final-door-frame|transparentopeningx12..51/y24..119=40×96;outercolumnsx8..11/52..55,lintely20..23;no leaf/handle|
|5|standing-mirror|glassdomainx8..55/y22..119=48×98;outerrimx4..7/56..59,y18..21;mostlytransparentinterior/sparseedgeglints;no actor/eyes/sparks|

Doorcentre2500/floor320 mapsopening(2480,224,40,96); mirrorcentre3025/floor320 mapsglass(3001,222,48,98). Chairvisualanchor floor320; metadata(2800,300)unchanged/notcollider. No source replacesrealdoorleaf/reflection/reveal/mirror16×22/scan/chevron/HP/storm/endingDOM.

## Reference choice and prompt

Theuseralreadyselectedtool-generatedconcept→nativeAsepriteinterpretationforsubsequentsame-styleassets. Use thatapprovedchoice,notanewsilentdefault. Readactualoutput/path/panels beforepixels. Neverdownscale/quantizeconceptintofinalsource; missingoutputmustbehonestlyrecorded.

```text
Pixel-art environment prop concept sheet for the quiet final room and cooling compute corridor of a side-view action platformer. Exactly six equal panels in one horizontal row, same scale, flat plain #0f191b background, no panel borders, text, labels or watermark. Each panel represents a64x128 native sprite, baseline at y120, front/side elevation with one shallow top plane and consistent upper-left light. Hard pixel edges, large deliberate clusters, no gradients or glow blur, selective dark one-pixel outlines. Left to right: (1) low two-bay compute cooling bank with quiet vents and sockets, about56x64, (2) broad segmented cable loop on two maintenance feet, about52x60, (3) short ribbed exhaust elbow and low plinth, about52x56, (4) unmistakably EMPTY padded swivel office chair with backrest, two armrests, seat, narrow central stem and five wheeled spokes, about48x80, (5) restrained heavy door FRAME with empty40x96 opening, no leaf or handle, (6) tall brass-edged standing MIRROR frame around48x98 glass, sparse edge glints, mostly empty dark interior, absolutely no reflected person or eyes. Final three feel abandoned and calm, not magical treasure or fantasy gates. Colours only: #0f191b #2c2330 #34354f #575c79 #858eb0 #24423b #426b50 #8fa86b #783f4a #b9905d #cbb696 #f5e8c8 #9dded1. No orange, characters, symbols, readable screens, battle effects, scenery or fake playable floor. Design reference only, not final game spritesheet.
```

## Gates and open boundary

Leadsolelivewriter; preflight/info,draw→look→fix,validate/save/export. Independentanonymous-firstthenbriefreview,contextnonfreshhonestlymarked;>=7/0blocking sufficient,max3necessaryfixes,nooptionalpolish. Independentlyreconstruct ASE/PNGRGBA,index/roles/tags/alpha/palette/openings/borders/negativecontrols.
SourceReady!=integrated/productionReady. Laterruntime mustaddress605supportcommandsvsLoom512 throughseparateboundedviewport/bandplan,andexistingg0storm/scan/HP(scanends329/332)foregroundprotection. Thesearereadonlystaticrisks,notobservedruntimebugs. R23inherited108/23arenotnewruntimeevidence. FullGDD/security/humanhearing/balance/freshcontinuousfivechaptersremainopen.

## Written design reading and reference provenance correction

Before drawing, the verified design basis was the written specification, not an imported concept. No filesystem path was exposed/verified; therefore no import/reference layer or pixel transfer is claimed. Native source is drawn from the written coordinates above and visual shape guidance, not resampled image pixels.
Target landmarks: sharedbaseline120; rearbank bounds4,56..60,120; cableloop6,60..58,120; duct6,64..58,120; chair8,40..56,120; door8,20..56,120/open12,24..52,120; mirror4,18..60,120/glass8,22..56,120.
Intentional deviations: remove dense screws/bright screen glyph-like detail; reduce machine rear contrast; explicitly separate five chair spokes; constrain literal40×96/48×98 domains rather than concept proportions; keep mirror interior transparent except sparse edge glints, no opaque generated glass or baked actor; no concept background retained. Palette masses map to the approved20 entries, not sampled extra colours.

### Locked source metadata / seam clarification

ActualASE/sharedslice planned:prop-origin,bounds(0,0,64,128),pivot(32,120); exportedJSONmustbechecked,notassumed.
Insideglassglints onlyx8..13/y26..56 orx50..55/y64..88,totalopaque≤24. Centralx20..43/y74..119strictalpha0;nootherglassink.
BodyA/B outer2 identical onallsides;first/last2rowsbasewrap;toplast2→bodyfirst2/bodylast2→footfirst2equalbase. Footnotverticalwrap.

Mirrorframeouterbboxisx4..59/y18..123;bottomrail y120..123 isoutsideglass y22..119. Itmaymeetfloorforeg later,notareason toputinkintheactorquietdomain. TheASEslice fullcanvascenter ismetadataonly,notauthorizationfor9slicestretching.
Mechanicalpre-exportcleanup: pairedisolatedfasteners and connecteddiagonalribs/glints into hardpixelclusters; allsamecontracts retained. Glass17inkpixels planned/observedfromdrawing,parsermustverify≤24. Sixselective-outlinewarnings remainstylewarnings,notpalette/alpha/errors.

### Reference timing correction

A realimage_gen tooloutput isvisible onlyafter the sixnativefileswerefrozen inthisavailableexecutionrecord. Itisauxiliaryconceptoutput,notthe sourceofthealreadydrawnpixels. Theearlierclaimthatactualgeneratedreferencewasreadbeforepixelsisunsupportedandwithdrawn. Targetlandmarks/deviationsabovewerewritten-designchoices,notmeasuredgeneratedimagepanels. Noreferenceimport,resamplingorlocalfile/dimensionsverificationisclaimed. NativeASEsourcesremainfrozen;nooptionalredrawtomatchthislateconcept.
