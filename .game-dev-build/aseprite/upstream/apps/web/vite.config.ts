import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import { sveltekit } from '@sveltejs/kit/vite';
import Icons from 'unplugin-icons/vite';
import { defineConfig } from 'vite';

// Resolved here, from this file's own location, because the server code is bundled into
// .svelte-kit/output before it runs — its import.meta.url no longer points into the repo.
// GALLERY_ROOT swaps in a fixture gallery (its parent must hold a CHANGELOG.md).
const galleryRoot = process.env.GALLERY_ROOT
	? resolve(process.env.GALLERY_ROOT)
	: fileURLToPath(new URL('../../gallery', import.meta.url));

export default defineConfig(({ command }) => ({
	define: {
		__GALLERY_ROOT__: JSON.stringify(galleryRoot)
	},
	ssr: {
		// The built server imports externals from .svelte-kit/output, where `zod` resolves to the
		// repo root's zod 3 (the plugin's) instead of the gallery's zod 4, and `yaml` not at all.
		// Dev resolves externals from the importing file, so it gets the right ones — and must not
		// inline `yaml`, whose Node entry is CommonJS.
		noExternal: command === 'build' ? ['zod', 'yaml'] : []
	},
	plugins: [
		tailwindcss(),
		sveltekit({
			preprocess: vitePreprocess(),
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			prerender: { handleUnseenRoutes: 'ignore' }
		}),

		// Icons are compiled into the bundle from @iconify-json/pixelarticons at build time, so the
		// prerendered pages never call the Iconify API. A data attribute rather than a class marks
		// them for the 24px rule in app/styles/index.css, because a caller's `class` replaces the
		// default one.
		Icons({
			compiler: 'svelte',
			iconCustomizer: (_collection, _icon, props) => {
				props['data-pixel-icon'] = '';
			}
		})
	]
}));
