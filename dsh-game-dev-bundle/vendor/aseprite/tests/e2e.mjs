/**
 * End-to-end smoke test against a LIVE Aseprite session.
 *
 * Unlike the rest of the suite this needs a human-visible Aseprite running with
 * the extension installed, so it is not part of `npm test`. It is the only test
 * that exercises the real chain — MCP server → bridge → Aseprite Lua → pixels —
 * and it is what caught the two bugs that every isolated test missed: Aseprite's
 * json.decode returning userdata, and its decoded arrays yielding nothing from
 * pairs.
 *
 * Run it against an isolated Aseprite so your own documents are never involved:
 *
 *   PORT=19931   # anything but the 9931/9932 defaults
 *   node dist/cli.js bridge --plugin-port $PORT --control-port $((PORT+1)) &
 *   ASEPRITE_USER_FOLDER=/tmp/ase-home node dist/cli.js install-extension --dir /tmp/ase-home
 *   ASEPRITE_AI_PLUGIN_PORT=$PORT ASEPRITE_USER_FOLDER=/tmp/ase-home /path/to/aseprite &
 *   E2E_PLUGIN_PORT=$PORT node tests/e2e.mjs
 *
 * Use non-default ports unless you are certain no real Aseprite session is
 * attached: the bridge accepts the last plugin that connects, so running this
 * against the defaults can steal a session you are actually working in.
 *
 * It creates its own 16x16 sprite and closes it without saving.
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "../dist/server.js";

const pluginPort = Number(process.env.E2E_PLUGIN_PORT || 9931);
const controlPort = Number(process.env.E2E_CONTROL_PORT || pluginPort + 1);
// allowLua enables run_lua, used below only to prove a single undo reverts a
// whole tween/oscillate transaction -- there is no MCP-level "undo" tool. The
// live Aseprite must be started with ASEPRITE_AI_ALLOW_LUA=1 as well: the
// extension refuses the call otherwise.
const { server, live } = createServer({ pluginPort, controlPort, autoSpawnBridge: false, allowLua: true });
const [ct, st] = InMemoryTransport.createLinkedPair();
const client = new Client({ name: "e2e", version: "0" });
await Promise.all([client.connect(ct), server.connect(st)]);

/** Files this run created, removed at the end. */
const written = [];

const call = async (name, args = {}) => {
  const r = await client.callTool({ name, arguments: args });
  if (r.isError) throw new Error(`${name}: ${r.content[0].text}`);
  return r;
};

console.log("— preflight");
const pf = await call("preflight");
console.log("  ", pf.content[0].text);
if (!pf.structuredContent.ready) { console.log("NOT READY, stopping"); process.exit(1); }

console.log("— new sprite");
console.log("  ", (await call("sprite_manage", { op: "new", width: 16, height: 16, colorMode: "rgb" })).content[0].text);

console.log("— palette preset pico8");
console.log("  ", (await call("palette", { op: "preset", preset: "pico8", replace: true })).content[0].text.slice(0, 120));

console.log("— draw a batch");
const drew = await call("draw", {
  label: "e2e smoke",
  ops: [
    { kind: "ellipse", rect: { x: 4, y: 2, width: 8, height: 7 }, color: "#ab5236", fill: "#ffccaa" },
    { kind: "rect", rect: { x: 5, y: 9, width: 6, height: 6 }, color: "#1d2b53", fill: "#29adff" },
    { kind: "pixels", color: "#000000", points: [{ x: 6, y: 5 }, { x: 9, y: 5 }] },
    { kind: "line", from: { x: 6, y: 7 }, to: { x: 9, y: 7 }, color: "#ff004d" },
    // deliberately off-palette, to prove the snap report
    { kind: "pixels", color: "#fe0150", points: [{ x: 2, y: 2 }] },
  ],
});
console.log("  ", drew.content[0].text);
console.log("   snapped:", JSON.stringify(drew.structuredContent.colorsSnapped));

console.log("— look (ascii)");
const ascii = await call("look", { op: "ascii" });
console.log(ascii.content[0].text);

console.log("— look (preview)");
const prev = await call("look", { op: "preview" });
console.log("  ", prev.content[0].text, "| image bytes:", prev.content[1].data.length);

console.log("— frames + tag");
console.log("  ", (await call("frame", { op: "add", count: 3 })).content[0].text);
console.log("  ", (await call("frame", { op: "set_duration", durations: [200, 90, 90, 200] })).content[0].text);
console.log("  ", (await call("tag", { op: "create", name: "idle", from: 1, to: 4, direction: "pingpong" })).content[0].text);

console.log("— filmstrip");
const strip = await call("look", { op: "filmstrip" });
console.log("  ", strip.content[0].text, "| image bytes:", strip.content[1].data.length);

console.log("— validate");
const v = await call("validate");
console.log(v.content[0].text);

console.log("— recolor shade");
console.log("  ", (await call("recolor", { op: "shade", amount: -0.25, frame: 1 })).content[0].text.slice(0, 200));

console.log("— export png");
written.push(process.env.E2E_OUT || "/tmp/aseprite-ai-artist-e2e.png");
console.log("  ", (await call("export", { op: "png", frame: 1, path: process.env.E2E_OUT || "/tmp/aseprite-ai-artist-e2e.png", scale: 8 })).content[0].text);

console.log("— layer paths: ambiguous name refused, group/child path resolves");
await call("layer", { op: "rename", name: "Layer 1", newName: "armA" });
await call("layer", { op: "create", name: "armB" });
await call("layer", { op: "group", names: ["armA"], name: "left" });
await call("layer", { op: "group", names: ["armB"], name: "right" });
await call("layer", { op: "rename", name: "armA", newName: "arm" });
await call("layer", { op: "rename", name: "armB", newName: "arm" });
{
  // Two layers now literally share the name "arm" (left/arm, right/arm) --
  // a bare "arm" must refuse rather than silently pick one.
  const ambiguous = await client.callTool({ name: "layer", arguments: { op: "set", name: "arm", visible: false } });
  assert.equal(ambiguous.isError, true, "a bare name matching two layers must be refused");
  assert.match(ambiguous.content[0].text, /ambiguous/i, "the refusal should say why");

  const resolved = await call("layer", { op: "set", name: "left/arm", visible: false });
  const layers = resolved.structuredContent.layers;
  const leftArm = layers.find((l) => l.name === "arm" && l.parent === "left");
  const rightArm = layers.find((l) => l.name === "arm" && l.parent === "right");
  assert.equal(leftArm.visible, false, "the group-path target should be the one that changed");
  assert.equal(rightArm.visible, true, "the other same-named layer must be untouched");
  await call("layer", { op: "set", name: "left/arm", visible: true });
}

console.log("— cel tween: interpolates across frames, one undo removes it whole");
{
  const beforeCount = (await call("cel", { op: "list" })).structuredContent.cels.length;
  const tween = await call("cel", {
    op: "tween", layer: "left/arm", fromFrame: 1, toFrame: 4,
    property: "position", to: { x: 9, y: 9 }, easing: "ease_in_out",
  });
  console.log("  ", tween.content[0].text);
  assert.equal(tween.structuredContent.frames.length, 4, "tween should report all 4 frames touched");
  assert.deepEqual(tween.structuredContent.frames.at(-1), { frame: 4, x: 9, y: 9 }, "the last frame should land exactly on `to`");
  const afterCount = (await call("cel", { op: "list" })).structuredContent.cels.length;
  assert.ok(afterCount > beforeCount, "tween should have created the missing in-between cels");
  await call("run_lua", { script: "app.undo()" });
  const undoneCount = (await call("cel", { op: "list" })).structuredContent.cels.length;
  assert.equal(undoneCount, beforeCount, "one undo should remove every cel the tween created, as a single action");
}

console.log("— cel oscillate: sinusoidal offset across frames, one undo removes it whole");
{
  const beforeCount = (await call("cel", { op: "list" })).structuredContent.cels.length;
  const osc = await call("cel", {
    op: "oscillate", layer: "left/arm", fromFrame: 1, toFrame: 4,
    amplitudeX: 3, amplitudeY: 0, period: 4,
  });
  console.log("  ", osc.content[0].text);
  assert.equal(osc.structuredContent.frames.length, 4, "oscillate should report all 4 frames touched");
  const afterCount = (await call("cel", { op: "list" })).structuredContent.cels.length;
  assert.ok(afterCount >= beforeCount, "oscillate should not lose cels");
  await call("run_lua", { script: "app.undo()" });
  const undoneCount = (await call("cel", { op: "list" })).structuredContent.cels.length;
  assert.equal(undoneCount, beforeCount, "one undo should revert oscillate as a single action");
}

console.log("— look onion: composites neighbours, leaves the site and sprite count untouched");
{
  const spritesBefore = await call("sprite_manage", { op: "list" });
  const siteBefore = await call("sprite_info", {});
  const onion = await call("look", { op: "onion", frame: 2, framesBefore: 1, framesAfter: 1 });
  console.log("  ", onion.content[0].text, "| image bytes:", onion.content[1].data.length);
  assert.deepEqual(onion.structuredContent.framesUsed, [1, 2, 3], "onion should report the 3 composited frames");
  const spritesAfter = await call("sprite_manage", { op: "list" });
  const siteAfter = await call("sprite_info", {});
  assert.equal(spritesAfter.structuredContent.sprites.length, spritesBefore.structuredContent.sprites.length,
    "onion's scratch sprite must be closed, not left open");
  assert.equal(siteAfter.structuredContent.activeFrame, siteBefore.structuredContent.activeFrame,
    "onion must not move the active frame");
  assert.equal(siteAfter.structuredContent.activeLayer, siteBefore.structuredContent.activeLayer,
    "onion must not move the active layer");
}

console.log("— sprite_manage slices: create/update/delete, center+pivot reach the exported atlas");
{
  const created = await call("sprite_manage", {
    op: "slice_create", name: "icon",
    bounds: { x: 1, y: 1, width: 8, height: 8 },
    center: { x: 1, y: 1, width: 6, height: 6 },
    pivot: { x: 4, y: 4 },
  });
  assert.equal(created.structuredContent.slice.name, "icon");
  assert.deepEqual(created.structuredContent.slice.center, { x: 1, y: 1, width: 6, height: 6 });
  assert.deepEqual(created.structuredContent.slice.pivot, { x: 4, y: 4 });

  const updated = await call("sprite_manage", { op: "slice_update", name: "icon", pivot: { x: 5, y: 5 } });
  assert.deepEqual(updated.structuredContent.slice.pivot, { x: 5, y: 5 }, "only the given field should change");
  assert.deepEqual(updated.structuredContent.slice.center, { x: 1, y: 1, width: 6, height: 6 }, "untouched fields survive an update");

  const info = await call("sprite_info", { includeSlices: true });
  const infoSlice = info.structuredContent.slices.find((s) => s.name === "icon");
  assert.deepEqual(infoSlice.pivot, { x: 5, y: 5 }, "sprite_info's slices should carry the same center/pivot");

  const sheetOut = (process.env.E2E_OUT || "/tmp/aseprite-ai-artist-e2e.png").replace(/\.png$/, "-sheet.png");
  const jsonOut = sheetOut.replace(/\.png$/, ".json");
  written.push(sheetOut, jsonOut);
  const sheet = await call("export", { op: "spritesheet", path: sheetOut });
  console.log("  ", sheet.content[0].text);
  const atlas = JSON.parse(readFileSync(jsonOut, "utf8"));
  const atlasSlice = atlas.meta.slices.find((s) => s.name === "icon");
  assert.ok(atlasSlice, "the exported atlas should list the 'icon' slice");
  assert.deepEqual(atlasSlice.keys[0].center, { x: 1, y: 1, w: 6, h: 6 }, "center should reach the exported atlas");
  assert.deepEqual(atlasSlice.keys[0].pivot, { x: 5, y: 5 }, "pivot should reach the exported atlas");

  const deleted = await call("sprite_manage", { op: "slice_delete", name: "icon" });
  assert.equal(deleted.structuredContent.name, "icon");
  const bad = await client.callTool({ name: "sprite_manage", arguments: { op: "slice_delete", name: "icon" } });
  assert.equal(bad.isError, true, "deleting an already-gone slice must refuse, not no-op");
}

console.log("— palette extract: quantizes the art into a fresh palette");
{
  const extracted = await call("palette", { op: "extract", maxColors: 6 });
  console.log("  ", extracted.content[0].text.slice(0, 160));
  assert.ok(Array.isArray(extracted.structuredContent.colors), "extract should return a colour list");
  assert.ok(extracted.structuredContent.colors.length > 0, "extract should find at least one colour");
  assert.ok(extracted.structuredContent.colors.length <= 6, "extract should honour maxColors");
}

console.log("— validate expect: layerFrames and mustNotOverlap");
{
  // After the tween/oscillate undo above, 'left/arm' is back to holding art on
  // frame 1 only -- expecting it on 2..4 instead must report every violation.
  const mismatch = await call("validate", { expect: { layerFrames: { "left/arm": [[2, 4]] } } });
  const armFindings = mismatch.structuredContent.findings.filter((f) => f.layer === "left/arm");
  assert.equal(armFindings.length, 4, "1 unexpected + 3 missing frames == 4 findings");
  assert.ok(armFindings.every((f) => f.check === "animation"), "expect(layerFrames) findings use check 'animation'");

  await call("draw", { ops: [{ kind: "pixels", color: "#ff004d", points: [{ x: 5, y: 5 }] }], layer: "right/arm", frame: 1 });
  const overlap = await call("validate", { expect: { mustNotOverlap: [["left/arm", "right/arm"]] } });
  const overlapFindings = overlap.structuredContent.findings.filter((f) => f.check === "layers" && f.frame === 1);
  assert.ok(overlapFindings.length > 0, "painting the same pixel on both layers must be reported");
  await call("cel", { op: "clear", layer: "right/arm", frame: 1 });
}

console.log("— transform outline: side x diagonals are 4 distinct combinations");
{
  // A plus/cross shape: the centre pixel's orthogonal neighbours are all
  // opaque (so 4-neighbour 'inside' does not touch it) but its diagonal
  // corners are transparent (so 8-neighbour 'inside' does) -- the one shape
  // that tells all 4 combinations apart from each other.
  const plus = [{ x: 5, y: 4 }, { x: 4, y: 5 }, { x: 5, y: 5 }, { x: 6, y: 5 }, { x: 5, y: 6 }];
  const combos = [
    { side: "outside", diagonals: false },
    { side: "outside", diagonals: true },
    { side: "inside", diagonals: false },
    { side: "inside", diagonals: true },
  ];
  const changed = [];
  for (const combo of combos) {
    await call("cel", { op: "clear", layer: "left/arm", frame: 1 });
    await call("draw", { ops: [{ kind: "pixels", color: "#ff004d", points: plus }], layer: "left/arm", frame: 1 });
    const result = await call("transform", { op: "outline", layer: "left/arm", frame: 1, color: "#29adff", ...combo });
    changed.push(result.structuredContent.pixelsChanged);
  }
  console.log("  outline pixelsChanged per combo:", changed);
  assert.equal(new Set(changed).size, 4, `all 4 side/diagonals combinations must differ, got ${JSON.stringify(changed)}`);
  await call("cel", { op: "clear", layer: "left/arm", frame: 1 });
}

console.log("— draw text: ink pixel, outline colour, and measureOnly touching nothing");
{
  await call("layer", { op: "create", name: "label" });

  const drawn = await call("draw", {
    layer: "label",
    frame: 1,
    label: "text smoke",
    ops: [{ kind: "text", text: "Hi", x: 1, y: 1, color: "#29adff", outlineColor: "#000000" }],
  });
  console.log("  ", drawn.content[0].text);

  // Bundled pixel5x7 "H" at top_left(1,1): its first (leftmost) ink column
  // is solid on rows 0-5, so (1,1) must be ink and (0,0) -- a diagonal
  // neighbour, only outlined because outlineDiagonals defaults true -- must
  // carry the outline colour.
  const region = { x: 0, y: 0, width: 10, height: 8 };
  const after = await call("read_pixels", { layer: "label", composite: false, frame: 1, region });
  const pixelAt = (result, x, y) => {
    const r = result.structuredContent;
    return r.colors[r.grid[(y - r.y) * r.width + (x - r.x)]];
  };
  assert.equal(pixelAt(after, 1, 1), "#29adff", "H's first ink column must land at (1,1)");
  assert.equal(pixelAt(after, 0, 0), "#000000", "diagonal outline corner must be painted");

  const measured = await call("draw", {
    measureOnly: true,
    ops: [{ kind: "text", text: "Hi", x: 1, y: 1, color: "#29adff", outlineColor: "#000000" }],
  });
  console.log("  ", measured.content[0].text);
  assert.deepEqual(measured.structuredContent.textBounds, [
    { index: 0, bounds: { x: 1, y: 1, width: 8, height: 6 } },
  ]);

  const stillAfter = await call("read_pixels", { layer: "label", composite: false, frame: 1, region });
  assert.deepEqual(stillAfter.structuredContent.grid, after.structuredContent.grid, "measureOnly must not touch the sprite");
  assert.deepEqual(stillAfter.structuredContent.colors, after.structuredContent.colors, "measureOnly must not touch the sprite");

  await call("cel", { op: "clear", layer: "label", frame: 1 });
}

console.log("— layer duplicate toSprite: copies cels, suffixes on name clash, reports dropped frames");
{
  // Give the source layer content on every frame, so duplicating into a
  // single-frame target has something real to drop and report.
  for (let f = 1; f <= 4; f++) {
    await call("cel", { op: "create", layer: "left/arm", frame: f });
  }
  const sourceName = `#${(await call("sprite_info", {})).structuredContent.id}`;

  const targetName = `#${(await call("sprite_manage", { op: "new", width: 16, height: 16, colorMode: "rgb" })).structuredContent.id}`;
  await call("layer", { op: "rename", sprite: targetName, name: "Layer 1", newName: "arm" }); // forces a name clash

  const dup = await call("layer", { op: "duplicate", sprite: sourceName, name: "left/arm", toSprite: targetName });
  console.log("  ", dup.content[0].text);
  const record = dup.structuredContent.duplicated?.[0];
  assert.ok(record, "duplicate with toSprite should report a duplicated[] entry");
  assert.equal(record.sourceLayer, "arm");
  assert.equal(record.toSprite, targetName, "toSprite must echo the stable '#<id>', not a shared display name");
  assert.notEqual(record.name, "arm", "the copy must be renamed on a name clash in the target");
  assert.equal(record.framesDropped, 3, "3 of 4 source frames exceed the target's single frame");

  const targetInfo = await call("sprite_info", { sprite: targetName });
  const copiedNames = targetInfo.structuredContent.layers.map((l) => l.name);
  assert.ok(copiedNames.includes(record.name), "the copy should actually exist in the target sprite");
  assert.equal(copiedNames.filter((n) => n === "arm").length, 1, "the original 'arm' layer in the target is untouched");

  await call("sprite_manage", { op: "close", sprite: targetName, force: true });
}

console.log("— tileset: paint a mockup, pack it, export for Tiled");
console.log("  ", (await call("sprite_manage", { op: "new", width: 64, height: 64, colorMode: "rgb" })).content[0].text);
await call("layer", { op: "rename", name: "Layer 1", newName: "mockup" });
{
  // A 4x4 grid of 16px cells using three colours, so packing must collapse
  // 16 cells into 3 tiles.
  const ops = [];
  const colors = ["#ff004d", "#29adff", "#00e436"];
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      const c = colors[(row + col) % 3];
      ops.push({ kind: "rect", rect: { x: col * 16, y: row * 16, width: 16, height: 16 }, color: c, fill: c });
    }
  }
  console.log("  ", (await call("draw", { layer: "mockup", paletteLock: false, ops })).content[0].text);
}
const packed = await call("tileset", { op: "pack", layer: "mockup", name: "terrain", tileWidth: 16, tileHeight: 16 });
console.log("  ", packed.content[0].text);
console.log("   structured:", JSON.stringify(packed.structuredContent));
const tsOut = (process.env.E2E_OUT || "/tmp/aseprite-ai-artist-e2e.png").replace(/\.png$/, "-terrain.tsj");
const exported = await call("tileset", { op: "export", layer: "terrain", path: tsOut, format: "tiled" });
written.push(...(exported.structuredContent.files ?? []));
console.log("  ", exported.content[0].text);
console.log("— look at the packed tileset");
const tsLook = await call("look", { op: "preview" });
console.log("  ", tsLook.content[0].text, "| image bytes:", tsLook.content[1].data.length);
await call("sprite_manage", { op: "close", force: true });

console.log("— close without saving (should refuse)");
const closed = await client.callTool({ name: "sprite_manage", arguments: { op: "close" } });
console.log("  isError:", closed.isError, "|", closed.content[0].text.split("\n")[0]);

console.log("— close with force");
console.log("  ", (await call("sprite_manage", { op: "close", force: true })).content[0].text);

live.close();
await server.close();

// Clean up what this run wrote, so a repeat run starts from nothing.
const { rmSync } = await import("node:fs");
for (const file of written) {
  try {
    rmSync(file, { force: true });
  } catch {
    /* best effort — the point is not to accumulate, not to guarantee removal */
  }
}

console.log("\nE2E OK");
process.exit(0);
