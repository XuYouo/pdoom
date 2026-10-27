---
name: game-dev-workflows
description: "DSH integration for this game-development mode. Load before multi-agent game workflows or Aseprite pixel-art work: maps upstream commands and specialists to native skill, delegation, workflow and MCP tools, with single-writer and cold-critique rules."
---

# Game development in DSH

## Select skills, not an entire library

1. Load `router` for the actual engine/task. Read the project's dependency/lock or engine version, not only an old README description. The Phaser official snapshot is 4.2.1; community `phaser-core` / `phaser-arcade-physics` may describe Phaser 3. Use APIs supported by the installed version; an upgrade is a separate user decision.
2. Load just the applicable engine, discipline, genre and workflow skills using `skill({name: ...})`. References resolve from the skill's returned resource base. There are 28 official Phaser + 77 gamedev + 14 Aseprite upstream skills, plus this adapter.
3. Choose `prototype-fast`, `game-jam`, `create-game-assets` or the relevant task skill. Their text is guidance, not permission for an installation, external publication, CI release or credential use.

## Native workflow tools

This preset mounts the real `workflow` tool backed by an isolated workflow engine. Delegation follows the active DSH configuration: when Agent Teams is enabled, use `spawn_teammate` and its task/message tools; otherwise `subagent` / `subagent_fork` may be available. Team mode can intentionally disable the latter pair. It does not simulate workflow execution with Markdown. See the actual tool schema before calling it.

- One independent review can use the available native delegation tool. For a user-requested workflow or large fan-out, use `workflow` with `script`, JSON `meta`, and `args`.
- Script hooks are `agent`, `pipeline`, `parallel`, `phase`, `log`, `args`. No filesystem, network or Node APIs exist in the script itself; agents perform the work.
- Independent pipeline items may overlap; use a barrier only when a stage needs every preceding result. Explicitly handle `null` agent failures and report incomplete reviews rather than success.
- The [game review template](../../workflows/game-review.js) is a read-only engine/gameplay/assets/performance review. Its [metadata](../../workflows/game-review.meta.json) names phases. Pass `{ "targets": ["src/game"], "engineVersion": "the verified version" }` as args.
- The [pixel-art critique template](../../workflows/pixel-art-critique.js) separates cold visual recognition from brief-aware checking. Its [metadata](../../workflows/pixel-art-critique.meta.json) names phases. Pass an anonymized preview path and then the brief. Use `read_image` to inspect previews; if the selected model cannot see images, report the limit rather than inventing a review.
- Child agents inherit the parent's game-dev preset. Do not change profile settings or another preset to delegate. Give each writer disjoint files; the lead integrates and tests. Never execute an entire vendored repository as a project bootstrap.

## Aseprite command mapping

Load `studio` for end-to-end art. Upstream `aseprite:<name>`, `/aseprite:<name>` and `skill://<name>` mean the corresponding DSH `skill({name: "<name>"})`, not a shell command. Available names: `animate`, `brief`, `concept`, `draw`, `export`, `fix`, `new`, `palette`, `review`, `rig`, `shade`, `studio`, `submit`, `tileset`.

Raw tool names in upstream examples are qualified in DSH: `preflight` → `mcp__aseprite__preflight`, `look` → `mcp__aseprite__look`, etc. Discover the actual schemas; skill and tool names can coincide and are not interchangeable.

Read `rules://index` through `read_mcp_resource({server: "aseprite", uri: "rules://index"})`, then only the relevant rule chapters. `skill://<name>` is also an MCP resource. The local [rulebook](../../vendor/aseprite/rules/README.md) is an offline alternative; it is not a substitute for live document inspection.

1. Run `mcp__aseprite__preflight` first. Default is live. If unavailable, explain that Aseprite 1.3+ and the AI Artist extension are required and stop drawing. Do not silently edit an `.aseprite` file or switch to headless mode.
2. This bundle never installs Aseprite, extensions or other agents' configs. Its wrapper disables detached auto-spawn and arbitrary Lua; it starts a loopback bridge only on a tool call and stops its own bridge at process shutdown. Existing bridges are not killed. Do not rely on live editor access being exclusive merely because preset tools are scoped.
3. All sessions share the same external Aseprite editor. Use exactly one drawing agent at a time. Parallel specialists can inspect exported immutable previews, plan palettes or review code; never let multiple agents mutate the live document.
4. Upstream [specialists](../../vendor/aseprite/agents/) are prompt resources, not automatically installed Claude agents. Read the relevant file and pass its role to a DSH subagent; ignore Claude-only `model`, `effort`, `tools` and `disallowedTools` keys. Do not hard-code another provider/model. `pixel-critic` is read-only; `palette-smith`, `animation-director` and `rig-builder` may propose work, but only the designated writer applies changes.
5. For a true cold critique, use a fresh subagent (not forked history). Initially supply ONLY an anonymized preview/document identifier and request its perceived subject and three focal points. Do not include the brief, intended subject, filenames that reveal it, or creation history. Freeze that result before a separate brief/spec comparison. This deliberately resolves the upstream studio shortcut that hands a critic the brief too early.
6. Show actual previews after edits, preserve user state, retain undo/snapshots and run mechanical validation before export. At most three targeted fix rounds; no unlimited polish. `submit`, `steam-publish`, `itch-publish` do not authorize an upload or release. Ask before external publishing.

## Upstream reference corrections

Upstream snapshots remain byte-preserved. For the known official Phaser broken relative references:
- In the cameras and sprites-and-images skills, `references/REFERENCE..//SKILL.md` means the same skill's `references/REFERENCE.md`.
- In game-object-components and v4-new-features reference documents, sibling-skill paths written `../<skill>/SKILL.md` need `../../<skill>/SKILL.md` because they start in a references directory.

The Phaser source-code paths in those skills refer to the upstream engine source tree, not to files shipped in this skills-only snapshot. Inspect the project's installed engine source/types when needed.

## Safety and isolation

Only this preset contributes these skills and Aseprite tools. Do not copy into global `.agents/skills`, `.dsh/skills`, root `.github`, or other clients' hooks/configs. Do not execute vendor installers or maintenance scripts automatically. Review delete/output paths, `--force`, process launches, network endpoints and credential handling before using any script. In particular, site generation can remove its output directory, packaging can replace an app bundle, and publication examples can upload/release real builds.
