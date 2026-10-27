# apps/web — `@pebbly/web`

Pixeli, live at [pixeli.pebbly.space](https://pixeli.pebbly.space/).

A SvelteKit site for [`@pebbly/aseprite-ai-artist`](https://github.com/with-pebbly/aseprite-ai-artist): a gallery of pieces made with the plugin, a benchmark that scores models on the same fixed prompts, the plugin's own page with its install guide, and the contribution flow.

The whole site is prerendered to static HTML against `gallery/` at build time, and ships with `@sveltejs/adapter-vercel`. SvelteKit 3 has no `svelte.config.js`: the kit options, aliases included, are passed to `sveltekit()` in `vite.config.ts`.

## Develop

```sh
pnpm web:dev                                      # gallery/generations from the repo
GALLERY_ROOT=$TMPDIR/gallery-fixture/gallery pnpm --filter @pebbly/web run dev
```

## Build

```sh
pnpm --filter @pebbly/web run check               # svelte-kit sync && svelte-check
pnpm --filter @pebbly/web run lint:fsd           # FSD slice + layer boundaries
pnpm --filter @pebbly/web run build               # prerenders every page + file asset
```

## Layer map (Feature-Sliced Design)

[ADR-0007](../../docs/adr/0007-web-feature-sliced-design.md) is the why. Imports go down only, never between slices of one layer, and always through a slice's `index.ts`.

````
app       layout shell (`layout/`), global CSS and theme tokens (`styles/`), ambient types
pages     home, plugin, pluginInstall, gallery, benchmarks, benchmark, benchmarkCompare, generation, contribute, knowledge, knowledgeArticle, notFound: one slice per route; sitemap builds sitemap.xml, leaderboardImage the leaderboard SVG
widgets   siteHeader (with the burger menu below lg), siteFooter, promptTimeline (used by two pages)
features  copyPrompt, filterGenerations
entities  generation (cards, score meter, gallery data), prompt, benchmark (ranking data), plugin (skills, agents, docs), knowledge (rulebook, palettes, markdown and ```grid renderer)
shared    api (GitHub and npm, at build time), ui (shadcn + 8bitcn ports, pixel art and ArtCard, masonry, lightbox, seo, markdown), lib (gif decoder, pixel-fit), config (PICO-8, Pebbly sprites)
````

A component used by one page is not a widget: it lives in that page's `ui/`. A slice gets promoted when a second slice needs it.

`src/routes/` is SvelteKit's router and holds no logic: a `+page.svelte` mounts a page slice with its `data`, and a `+page.server.ts` re-exports the slice's `load`.

## Import paths

Layers are Node [subpath imports](https://nodejs.org/api/packages.html#subpath-imports) in `package.json` — SvelteKit 3's replacement for `$lib` and `config.alias`. Vite, TypeScript and steiger all resolve them.

| Import         | Path             |
| -------------- | ---------------- |
| `#app-shell/*` | `src/app/*`      |
| `#pages/*`     | `src/pages/*`    |
| `#widgets/*`   | `src/widgets/*`  |
| `#features/*`  | `src/features/*` |
| `#entities/*`  | `src/entities/*` |
| `#shared/*`    | `src/shared/*`   |

A subpath import names the file, with the extension the compiled module will have: a slice is `#pages/home/index.js`, its server barrel `#pages/home/index.server.js`, a module `#shared/lib/site.js`, a component `#shared/ui/pixel/PixelImage.svelte`. TypeScript maps `.js` to the `.ts` source. `$app` stays SvelteKit's own (`$app/paths`, `$app/state`), so the app layer is `#app-shell`.

## Documented exceptions

`pnpm run lint:fsd` runs `steiger` with its recommended rules and nothing turned off. The places FSD bends to SvelteKit:

- **`src/routes`** is the router SvelteKit requires, not a layer; steiger does not treat it as one. It stays thin (above).
- **`index.server.ts`** next to a slice's `index.ts` is the server-only barrel: the mappers that read `gallery/` from disk (`node:fs`). Steiger accepts it as the slice's public API. Only `*.server.ts` files may import it, so SvelteKit refuses to bundle it into the client. Each mapper lives in the slice's `api/*.server.ts`.
- **`@x`**: `entities/generation/@x/{benchmark,prompt,pack}.ts` and `entities/prompt/@x/benchmark.ts` are FSD's cross-import API. The chains are one-way: benchmark → prompt → generation, and pack → generation.
- **`shared/ui/8bit/index.ts`** is the one entry to the 8bitcn ports. Primitives that export `Root`/`Content`/`Trigger` are namespaces there: `Select.Root`, `Table.Row`, `Collapsible.Content`.
- **`src/app.html`** stays at the `src` root, where SvelteKit reads it.

## `GALLERY_ROOT`

The repo's `gallery/` is the default. Override with `GALLERY_ROOT=<path>` to point at a fixture (its parent must hold a `CHANGELOG.md` for plugin versions to validate). The path is resolved in `vite.config.ts` and baked into the server bundle through `define.__GALLERY_ROOT__` — it cannot be changed after the build starts.

## GitHub data: `/plugin`, `/plugin/install`, the header's stars

These are the only pages that are not prerendered. They are Vercel ISR routes (`GITHUB_ISR` in `shared/config/isr.ts`): cached on the CDN and re-rendered at most every two hours, fetching the README, `docs/INSTALL.md` and the repository and npm numbers from the GitHub and npm APIs. The header's star count is baked into every prerendered page at build time, then refreshed in the browser from `/api/stars`, which sits on the same two-hour window — so the header and `/plugin` always agree. Without a token GitHub allows 60 calls an hour per IP; set `GITHUB_TOKEN` (no scopes needed, the repo is public) in the Vercel project, for builds and functions. Turbo passes it through without hashing it. A failed call never fails a build or a render: the page links to GitHub instead, and the header drops the count. The skills and agents are bundled from `skills/` and `agents/` at build time (`import.meta.glob`), because the ISR function has no repository on disk.

## Sitemap

`/sitemap.xml` is a sitemap index over `/sitemaps/{pages,benchmarks,knowledge,gallery}.xml` (`pages/sitemap`). A new top-level page goes into the `pages` list by hand.

## Packs

A pack (`gallery/packs/<slug>/pack.yaml`, [ADR-0012](../../docs/adr/0012-gallery-packs.md)) stands in for its pieces on the gallery and home walls: `entities/pack/lib/wall.ts` merges loose pieces and packs into one newest-first wall, and `WallTileCard` draws either kind. `/packs/<slug>` (`pages/pack`) plays the opening as CSS animation whose resting style is the open fan, so reduced motion, a click to skip, and a page without JavaScript all show the same thing; the fan is `aria-hidden` and the card list under it is the way in for the keyboard and screen readers.

## Knowledge base

`/knowledge` is the plugin's rulebook (`rules/*.md`, grouped by ADR-0011's bands), its skills, agents and bundled palettes; `/knowledge/{rules,skills,agents}/<name>` is one document. Like `/plugin`, the markdown is bundled from the checkout with `import.meta.glob`, never fetched, and rendered at build time with `marked` (`entities/knowledge/lib/markdown.ts`): ` ```grid ` blocks become pixel pictures with their legend, `rules://` and `skill://` references link to the page they name, and relative links resolve to a site page or the file on GitHub. The source is the repository's own, which is why the HTML is printed unsanitised.

## llms.txt

`/llms.txt` ([llmstxt.org](https://llmstxt.org)) is a markdown map of the site and the plugin for language models; `/llms-full.txt` inlines the README, `docs/INSTALL.md` and every skill and agent, so one fetch answers most questions. Both are prerendered from the same checkout (`pages/llms`, `entities/plugin`).

## Leaderboard image

`/leaderboard/light.svg` and `/leaderboard/dark.svg` are the `/benchmarks` leaderboard as a standalone image, for the repository README, which embeds both in a `<picture>` so GitHub picks the one matching the reader's theme (`pages/leaderboardImage`). They are prerendered, so they change with every deploy of `main`. The fonts are inlined as data URLs: an SVG shown through `<img>` may not load anything, and a fallback font would break the column layout, which relies on Press Start 2P's fixed 1em advance. The colours are copies of the site's tokens; change them together.

## Icons and share card

`static/` holds the favicon set, the web-app icons and `og-image.png`, all made by `pnpm --filter @pebbly/web run generate:icons` from `gallery/generations/2026-09-29-pebbly-mascot/pebbly-icon.png`. Run it by hand when the icon changes and commit the output; the build never regenerates it. `static/site.webmanifest` is hand-written.

## Where gallery files come from

A production build does not copy generation files into the deployment. Every
cover, GIF and `.aseprite` links to the file in the repository on GitHub
(`raw.githubusercontent.com/with-pebbly/aseprite-ai-artist/<commit>/gallery/generations/…`),
pinned to `VERCEL_GIT_COMMIT_SHA` (fallback `GALLERY_FILES_REF`, then `main`), so
the deployment stays small however large the gallery grows. Downloads fetch the
file and save it under its own name, because browsers ignore `download` on
cross-origin links. `vite dev` serves the local files through `/files/…`; for a
fixture build, whose files are not on GitHub, set `GALLERY_FILES=local`. This
needs the repository to stay public.

## UI source

Components are ports of [8bitcn/ui](https://www.8bitcn.com) (MIT) into Svelte 5. See `src/shared/ui/8bit/LICENSE` for the notice and each file's header comment for the source it was ported from. Dark/light is mode-watcher. The theme is "Pebble & Moss" in `src/app/styles/index.css`: primary `#83769c`, secondary `#008751`, accent `#ffa300`, dark background `#111016`, `radius: 0`.

Icons are pixelarticons via `unplugin-icons` + `@iconify-json/pixelarticons`, compiled into each Svelte component at build time. No runtime icon API call. Every icon is locked to the 24px grid in `src/app/styles/index.css` under the `[data-pixel-icon]` selector.

`components.json` still records `iconLibrary: "lucide"` (shadcn-svelte only supports the five bundled libraries). A future `pnpm dlx shadcn-svelte add` will therefore reintroduce `@lucide/svelte` imports; swap each to `~icons/pixelarticons/<name>` by hand. It also writes slice imports without a file name (`#shared/ui/button`); add `/index.js`, as everywhere else — `pnpm run check` reports each one it missed.

## Deploy

Vercel, from `main` only — not on pull requests.
