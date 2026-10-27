# Topic codes

Every note is tagged with one or more codes so synthesis can collect them.
Final file = `rules/<code>.md`. See ADR-0011.

## 1x Technique
- 10-lines-and-curves — pixel-perfect lines, slopes, curve step sequences, jaggies, doubles
- 11-clusters-and-noise — clusters, orphan pixels, banding, pillow shading
- 12-anti-aliasing — manual AA, selective outlines, when not to
- 13-dithering-and-texture — dither patterns, texture without noise
- 14-readability-and-scale — contrast, value, reading at 1x, detail budget

## 2x Colour, light, materials
- 20-color-for-pixel-art — ramps, hue shift, saturation, value structure, temperature
- 21-limited-and-platform-palettes — 4/8/16/32 colour palettes, NES/GB/GBA/SNES/PICO-8
- 22-materials-hard — metal, stone, glass, gems, wood, bone
- 23-materials-soft — cloth, skin, hair, fur, leather, scales, organic
- 24-lighting-scenarios — rim, back, bounce, night, fire, multiple lights, cast shadows

## 3x Characters
- 30-proportions-by-size — heads-tall, chibi to realistic, per canvas size
- 31-anatomy-and-pose — skeleton, gesture, line of action, weight, contrapposto
- 32-heads-and-faces — head construction, angles, facial features
- 33-eyes-and-expressions — eyes per size, expressions, emotion
- 34-hands-and-feet — hands/feet per size, grips, gestures
- 35-hair-and-clothing — hair masses, folds, armour, accessories
- 36-character-design — shape language, personality, silhouette, archetypes
- 37-views-and-directions — side, front, 3/4, top-down, 4/8 directions
- 38-portraits — bust portraits, dialogue faces

## 4x Animation
- 40-timing-and-spacing — 12 principles applied to sprites, frame counts, ms
- 41-idle-and-breathing
- 42-walk-and-run — human walk/run, contact/down/passing/up, frame tables
- 43-jump-fall-land
- 44-attacks-and-impacts — anticipation, smears, hitstop, hit reactions, death
- 45-secondary-motion — hair, capes, tails, overlap, follow-through
- 46-subpixel-animation
- 47-top-down-animation — 4/8-dir walk and attack

## 5x Creatures
- 50-quadrupeds — anatomy and proportions of quadrupeds
- 51-animal-gaits — walk, trot, canter, gallop sequences
- 52-birds-and-flight
- 53-small-creatures — fish, insects, reptiles, amphibians
- 54-monster-design — creature design, slimes, dragons, undead

## 6x Environments
- 60-skies-and-atmosphere — skies, clouds, atmospheric perspective, time of day
- 61-landscapes-and-terrain — mountains, hills, cliffs, scene depth
- 62-parallax-backgrounds
- 63-trees-and-foliage
- 64-water — still, flowing, waterfalls, reflections, animated
- 65-ground-rocks-grass
- 66-tiles-and-autotiling — seamless, transitions, 47-blob, modular
- 67-architecture-and-interiors — buildings, bricks, walls, doors, rooms

## 7x Objects and 3D
- 70-perspective — horizon, vanishing points, foreshortening, top-down vs side
- 71-isometric — 2:1 lines, cubes, iso characters, grids
- 72-3d-forms — cube, cylinder, sphere, cone; form shading
- 73-props-and-items — weapons, potions, food, chests, icons-as-items
- 74-vehicles-and-machines
- 75-rotation-and-turnarounds — rotating objects, turnarounds, pseudo-3D

## 8x Effects and interface
- 80-vfx-fire-smoke-magic
- 81-impacts-and-game-feel — flashes, shake, recoil, juice
- 82-particles-and-weather — rain, snow, leaves, dust
- 83-ui-and-icons — frames, bars, buttons, icon design
- 84-bitmap-fonts

## 9x Style
- 90-platform-styles — NES, GB, GBC, GBA, SNES, Genesis, PICO-8, modern hi-bit
- 91-composition-and-scenes — framing, focal point, value grouping, staging
- 92-generated-art-tells — what marks art as machine-made, and the fixes
