# Aseprite AI Artist — pinned-source and npm runtime audit

Audit date: 2026-10-27. Scope: task-local acquisition, static review and adaptation guidance. This reviewer did not execute upstream scripts, the MCP runtime, an extension or native Aseprite; did not install anything; and did not change global configuration or the DSH profile. Vendor copy and DSH wrapper implementation were handed to the Lead; this document does not claim those integration steps have passed tests.

## 1. Provenance and reproducibility

| Item | Pinned value |
|---|---|
| Repository | <https://github.com/with-pebbly/aseprite-ai-artist> |
| Source commit | [`a32a2a58e76b06fc9ad7b29b12abd003ec769665`](https://github.com/with-pebbly/aseprite-ai-artist/commit/a32a2a58e76b06fc9ad7b29b12abd003ec769665) |
| Source archive SHA-256 | `cf5eaabb72651500bab41050d74e877ed8b29567aae51c7449fa741450760e38` |
| npm runtime | `@pebbly/aseprite-ai-artist@0.8.2` |
| Published gitHead | `5894b12cead839789077b279369409f868451ffc` |
| npm SHA-1 | `c99e76880de10dc7720b10db9b72e760ada03a73` |
| npm integrity | `sha512-blkv8UK24ti+2jCwi+fZPvi91l29FTh+iQSnHmOAfkqAqODd2ifbFN0y+qdBVm0fSe28eP1I7Ert1TW34UpCZg==` |
| Node engine | `>=22.6.0` |
| Source package manager declaration | `pnpm@11.25.0` |

The downloads were verified against registry hashes and safely unpacked as data: absolute paths, traversal, links and special archive members were rejected. Full source snapshot: **862 files**. Full published npm tarball: **186 files**. A per-file SHA-256 inventory is in [inventory-audit.json](inventory-audit.json); source acquisition metadata is in [download-audit.json](download-audit.json).

Do not equate the source commit with the published runtime merely because both declare version 0.8.2. They are different snapshots.

### Dependency recommendations

Published runtime ranges: SDK `^1.30.0`, `ws ^8.21.3`, `zod ^3.25.76`. Source ranges: SDK `^1.32.0`, same ws/zod ranges. Source npm lock exact versions: SDK **1.32.1**, ws **8.21.3**, zod **3.25.76**. The source npm lock contains no `hasInstallScript: true` entry; this is not a security audit of every transitive dependency.

For the Lead's bundle-local resolved runtime, recommend exact pins `@pebbly/aseprite-ai-artist: 0.8.2`, `@modelcontextprotocol/sdk: 1.32.2`, `ws: 8.22.0`, `zod: 3.25.76`, with a bundle-local lock/override ensuring the Aseprite package actually resolves the selected SDK/ws. These versions were present in registry metadata at audit time. Do not add global or profile-wide overrides. Compatibility still requires the Lead's protocol tests, and the exact resolved dependency tree should be recorded after installation. Do not claim that merely pinning the top-level Aseprite version pins its caret-ranged transitive dependencies.

## 2. Curated vendor contents

Preserve source-relative layout, attribution and MIT [LICENSE](https://github.com/with-pebbly/aseprite-ai-artist/blob/a32a2a58e76b06fc9ad7b29b12abd003ec769665/LICENSE) (copyright 2026 with-pebbly). Preserve skill, specialist, rule, knowledge, documentation, gallery schema/prompt, source and test files as data. Preserve the original upstream plugin manifests and hooks as reference, not as active DSH configuration.

Agreed omissions: website `apps/` (379 files, 708,073 bytes), community `gallery/generations/` (248 files, 47,270,895 bytes), and `gallery/packs/` (5 files, 2,354 bytes). The curated source set is **230 files / 13,447,876 bytes**, excluding any added audit metadata. The full source snapshot remains in the task cache. The omission is intentional, not a missing extraction.

Counts:

- **14 workflows**, each with one `SKILL.md`; the fifteenth file in the skills tree is its README, not an additional workflow or sidecar asset.
- **4 specialists**.
- **62 rule documents**, plus the rules README.
- **2 knowledge files**; the palette catalogue contains **2,006 presets**, preserving individual author/source fields.
- Gallery submission references remain available: schema, checker, loader, README, RUBRIC, MAINTAINERS, benchmark prompts, and the generation PR template. Actual benchmark inputs are under `gallery/prompts/`, not a `gallery/benchmarks/` directory.

The palette documentation describes Lospec author attribution and source URLs; do not flatten those external palette credits into a blanket assertion that every palette is authored by the MIT repository owner. Retain the catalogue metadata and palette documentation.

## 3. npm versus pinned HEAD

The 108 common paths contain **105 byte-identical files**. The three differing common paths are the changelog, extension Lua source and root package manifest. In particular, **all workflows, specialists, rules and knowledge resources in the npm tarball match pinned HEAD byte-for-byte**. Static `rules://` and `skill://` references in skills/specialists resolve; no missing resource names were found.

This byte comparison alone does not compare compiled npm JavaScript to source TypeScript. The [upstream comparison](https://github.com/with-pebbly/aseprite-ai-artist/compare/5894b12cead839789077b279369409f868451ffc...a32a2a58e76b06fc9ad7b29b12abd003ec769665), also recorded as [compare-release-head.json](compare-release-head.json), shows **11 commits** after the published gitHead. Relevant runtime changes absent from the published 0.8.2 build:

1. **Reference import cleanup/site preservation**: HEAD closes the source image even when reading throws, and restores the user's sprite, layer and frame on every path. The npm extension restores only the sprite on its normal path and can leave the source document open/active on an exception.
2. **Reply shape checks**: HEAD adds expected-field checks to `look`, `read_pixels`, `palette` and `tileset` call sites. The npm runtime can summarize missing fields from an outdated extension as undefined/empty results rather than refusing them. The changed bridge-client source is explanatory comments; the new call-site checks are the functional change.
3. **SDK security dependency update**: HEAD bumps the SDK range and lock from 1.30.x to 1.32.x. The npm package's range does not itself guarantee the selected installed version; a local lock/override is necessary.
4. Source-only changes also include CI's Aseprite CLI handler test job, website Vite/analytics updates and gallery updates. They do not alter workflow text.

Do not describe these HEAD fixes as active merely because HEAD source is vendored. This task did not build or patch upstream runtime code. If the published runtime is selected, document these differences and test against a current compatible extension before real editing. Installing the extension remains a separate user-authorized action.

## 4. CLI and execution audit

The actual published executable is `dist/cli.js`; the bin name is `aseprite-ai-artist`. Package-root `main` and `types` point at `dist/index.js` and `dist/index.d.ts`, which **do not exist** in the tarball. Use the executable path or explicit `dist/server.js` / `dist/bridge/bridge.js` subpaths, not a package-root import. There is no restrictive package `exports` map.

Minimal upstream stdio launch (documentation only; not executed by this reviewer):

```text
node <absolute-installed-package>/dist/cli.js serve
```

This is **not the preferred DSH launch** because of its detached bridge lifecycle. The Lead is implementing an owned in-process bridge wrapper instead.

### Commands and side effects

| Command/surface | Observed behavior | Task decision |
|---|---|---|
| `serve` (default) | MCP stdio; diagnostics on stderr; constructs a live WebSocket client immediately | Wrap; do not invoke unguarded CLI |
| `bridge` | Local relay listening on loopback ports 9931/9932 | Manage within wrapper lifetime only |
| `install` | Writes agent client configuration; backups plus atomic rename; optional agent-guidance file merge | Do not run |
| `install-extension` | Copies extension into Aseprite's per-user extensions directory | Do not run |
| `doctor` | Probes; may spawn a bridge if absent, later kills its own spawned PID; prints stdout | Not a side-effect-free check and not MCP transport; do not run for static detection |
| `--headless` / `preflight mode=headless` | Spawns native Aseprite with the bundled Lua runner, creates scratch user-folder state | Default live; retain explicit mode selection only when the user specifically requests it, never as fallback |
| `--help` / `--version` | Human-readable stdout | Never use as MCP transport |
| Git-install bootstrap | If compiled CLI is absent, runs `npm ci --ignore-scripts`, then `npm run build`; npm spawned through a shell | Preserve as reference only; never execute under this task |
| Claude/omp/OpenCode adapters | Harness-specific registrations, hook replay and workflow injection | Do not load as DSH plugins |
| Claude look-nudge hook | Writes a session marker under plugin-data or temp state | Do not execute |
| Palette refresh script | Fetches Lospec data and rewrites the catalogue | Do not execute |

The 12 root scripts are build, dev, clean, typecheck, test, lint, prepublishOnly, test:extension, test:e2e, test:pure, gallery:check and web:dev. No root preinstall/install/postinstall/prepare hook is declared. `prepublishOnly` invokes clean and build; clean deletes the compiled output tree. Native/e2e tests can launch Aseprite or manipulate documents. None were executed. Installation should remain `--ignore-scripts`, with exact lock and separate review for any requested build exception.

The standard macOS extension destination is under the user's Library/Application Support/Aseprite extensions directory; `ASEPRITE_USER_FOLDER` can redirect the root. The installer also supports Linux/XDG and Windows AppData locations. None was written by this reviewer.

### Stdio and lifecycle hazards

- `createServer()` constructs `LinkSelector`, which immediately constructs the initial `LiveClient`; it connects during construction, not on the first drawing call.
- With upstream defaults, connection failure triggers a detached child running the bridge CLI, with ignored stdio and `unref()`. The child can outlive the MCP process. The upstream hook's claim that the bridge only starts on the first tool call is not accurate for this build.
- Require `createServer({ autoSpawnBridge: false, allowLua: false, headless: false, prompts: false })` and a wrapper-owned `Bridge`. Starting it on the first valid tool call avoids a listener during initialization/resource discovery.
- `Bridge.start()` returns true only for a bridge this process started; false means a port is already occupied. Never stop/kill another process's existing bridge. Multiple sessions can share the relay, but stopping the owning session disconnects the other clients until a relay is available again.
- On stdin EOF, SIGINT and SIGTERM: close both live links and MCP transport; stop only the owned bridge; include a finite cleanup timeout because upstream close methods do not await every socket close callback. No detached child should remain.
- Keep diagnostics strictly on stderr and MCP JSON-RPC strictly on stdout. Verify initialize, list-tools, resources, failed preflight, EOF and signals in the Lead's integration tests.
- **`headless:false` sets only the initial mode; it does not disable headless switching.** Published `preflight` still accepts `mode:'headless'`, calls `live.use()`, and spawns native Aseprite. The Lead selected a **default-live** wrapper, not a hard live-only capability boundary: this explicit mode remains available, while DSH adapter guidance must require the user's specific request and forbid silent fallback. Environment defaults do not provide a security sandbox. Any future hard live-only deployment would additionally need to reject that mode at dispatch and narrow the advertised schema.

### Trust boundary

The relay binds 127.0.0.1 only, but is unauthenticated. Any local process can connect and issue commands. The ordinary save/open/export/reference/tileset tools have no project filesystem sandbox, even while `run_lua` is disabled. Session/preset visibility isolation is not OS security isolation.

`run_lua` is arbitrary Lua inside the process with open documents and filesystem access; it is gated both by server registration and extension environment. Keep it absent. Do not infer that disabling it removes all destructive or external-path capabilities.

No network egress/telemetry was identified in the live MCP/bridge code paths inspected; this is not a claim about website analytics, palette refresh, GitHub submission, bootstrap npm access, or arbitrary authorized Lua. Those are separate surfaces.

## 5. DSH adaptation map

The upstream human-facing `/aseprite:*` syntax, Claude `Task`/`Read`/`Glob`/`Grep` names, hook tool matchers, YAML `model: opus/sonnet` and disallowed-tool declarations are **not DSH executable APIs or enforced permissions**. Preserve originals as source; expose scoped DSH skill entrypoints and remap calls to the actual MCP tool names discovered from DSH. Do not invent tool prefixes. Reapply each specialist's intended read/write boundaries through the DSH composition and wrapper.

### 14 workflows

| Name | Role |
|---|---|
| `studio` | End-to-end orchestration and critique/fix gates |
| `brief` | Confirm canvas, palette, view, lighting, outline and destination |
| `concept` | Art spec, concept/storyboard offer, reference-to-PixelSpec interpretation |
| `new` | Create a document with agreed structure and palette |
| `draw` | Structured shapes/clusters and mutation-preview loop |
| `palette` | Choose/apply/lock a coherent palette |
| `shade` | Light/material/value passes constrained to palette |
| `rig` | Layer/cel rig planning before assembly |
| `animate` | Key poses, timing, cycles and motion review |
| `tileset` | Tile creation, adjacency/atlas workflow |
| `review` | Visual and rule-based quality checks |
| `fix` | Localized corrective passes with regression control |
| `export` | Validate and export agreed deliverables |
| `submit` | Prepare a public gallery contribution; publishing requires separate consent |

### 4 specialists

| Name | DSH adaptation |
|---|---|
| `pixel-critic` | Fresh, read-only context; first inspect anonymized art cold, then receive brief and metadata; no canvas writes |
| `palette-smith` | Analyze/propose first; apply only after approval, using the drawing operator if critic-like read-only tooling is retained |
| `animation-director` | Plan timing/poses, then explicit build handoff; inspect filmstrip/onion/key frames, not only a GIF's first frame |
| `rig-builder` | Inspect and propose layer/cel structure, confirm before mutation |

All canvas writers must be serialized because they share the active native editor. Independent reasoning can be parallel, but not simultaneous edits to one Aseprite session.

### Tools and resources

The published package registers **18 ordinary tools**, plus gated `run_lua` as a nineteenth:

```text
preflight, sprite_info, sprite_manage, draw, select, transform,
layer, frame, tag, cel, look, read_pixels, palette,
reference, export, tileset, recolor, validate
```

Most nouns multiplex operations. A `palette` or `layer` tool is not wholly read-only just because it has a read operation. Specialist permissions must account for operation-level writes. `look` writes and cleans temporary PNGs but does not mutate the art. `preflight` has a mode-switching side effect unless wrapper-restricted as above.

MCP resources: `rules://index`, `rules://{name}`, `skill://{name}`, `knowledge://palettes`; optional prompts: `aseprite:{name}`. Disable upstream prompts if DSH already exposes skill entrypoints. Resource fallback mapping must preserve source-relative names:

```text
rules://x        -> vendor/aseprite/rules/x.md
skill://x        -> vendor/aseprite/skills/x/SKILL.md
knowledge://palettes -> vendor/aseprite/knowledge/palettes.json
```

The resource implementation serves main skill bodies. Although its loader enumerates skill assets, the server does not actually register sidecar resources; the current 14 workflow directories contain no sidecars, so this is a future packaging limitation rather than a present missing-file error.

### Workflow invariants to carry forward

1. Preflight first. If not connected, report the missing native/extension setup and stop. Never silently fall back to disk editing, Pillow raster generation or headless mode.
2. Read real sprite state before editing; after each mutation use `look` and inspect the actual result. Keep one undo transaction per logical action.
3. New art follows brief/spec/concept decisions. The DSH system-level image-generation rules take precedence over upstream confirmation wording when the user directly requests an image.
4. Studio acceptance: no BLOCKING findings and score at least 7/10. At most three fix rounds; snapshot touched content, keep fixes local, restore accidental redraws/regressions. Blind A/B in one critic call is stronger than comparing scores from separate calls. Stop after two rejected rounds; no additional edits after final accepted review.
5. Preserve critic independence. The studio text suggests handing over document and brief; the critic demands a cold first read. Stage the brief after the cold read rather than contaminating the first inspection.
6. Preserve draft/snapshot/rollback paths and the user's active sprite, layer and frame. Note the published extension's reference-import exception bug in section 3.
7. Gallery `submit` includes fork/push/PR and publishing verbatim prompts/assets. Workflow availability is not permission for external publication; obtain specific consent and check private/licensed content first.

## 6. Native availability and test limits

Read-only detection found no `aseprite` on PATH and no executable at the standard system Applications, user Applications or macOS Steam locations. This is not an exhaustive scan or proof that the user owns no copy elsewhere. Local Node was v25.3.0 and npm 11.7.0, satisfying the package engine constraint.

No native rendering, extension handshake, drawing, saving, exporting, Lua handler or end-to-end test was performed. Installing an MCP package does not install the commercial/native Aseprite application or activate its extension. The game preset can expose workflows and the safely wrapped MCP, but real art operations remain unavailable until the user supplies and explicitly enables the required native setup.

This is a bounded static audit, not a guarantee against all vulnerabilities. The Lead owns final copy verification, actual resolved dependency versions, MCP protocol/cleanup tests, game-preset-only tool/skill visibility verification, and clear final disclosure of the native dependency gap.

## Sources

- [Pinned source](https://github.com/with-pebbly/aseprite-ai-artist/tree/a32a2a58e76b06fc9ad7b29b12abd003ec769665)
- [Published release to source comparison](https://github.com/with-pebbly/aseprite-ai-artist/compare/5894b12cead839789077b279369409f868451ffc...a32a2a58e76b06fc9ad7b29b12abd003ec769665)
- [npm package metadata](https://registry.npmjs.org/@pebbly%2faseprite-ai-artist/0.8.2)
- [npm tarball](https://registry.npmjs.org/@pebbly/aseprite-ai-artist/-/aseprite-ai-artist-0.8.2.tgz)
- [SDK version metadata](https://registry.npmjs.org/@modelcontextprotocol%2fsdk/1.32.2)
- [ws version metadata](https://registry.npmjs.org/ws/8.22.0)
- [zod version metadata](https://registry.npmjs.org/zod/3.25.76)
- [Upstream security model](https://github.com/with-pebbly/aseprite-ai-artist/blob/a32a2a58e76b06fc9ad7b29b12abd003ec769665/SECURITY.md)
