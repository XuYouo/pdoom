import { browser, dev } from '$app/env';
import { page } from '$app/state';
import { inject, pageview } from '@vercel/analytics';

/**
 * Vercel Web Analytics, with one pageview per visited path. Call during component setup.
 *
 * FIXME(@vercel/analytics 2.0.1): its own `injectAnalytics` from '@vercel/analytics/sveltekit'
 * subscribes to `$app/stores`, which SvelteKit 3 removed, and throws `app_stores_removed` on
 * hydration. This is that adapter's body on `$app/state`. 2.1.0 (canary.5 on the `beta` tag as
 * of 2026-10) ships `injectAnalytics` from '@vercel/analytics/sveltekit-next' on `$app/state`;
 * switch to it once 2.1.0 is stable.
 */
export function trackAnalytics(): void {
	if (!browser) return;
	inject(
		{
			mode: dev ? 'development' : 'production',
			// Set by adapter-vercel on deploy; the same values the official adapter passes.
			basePath: import.meta.env.VITE_VERCEL_OBSERVABILITY_BASEPATH,
			disableAutoTrack: true,
			framework: 'sveltekit'
		},
		import.meta.env.VITE_VERCEL_OBSERVABILITY_CLIENT_CONFIG
	);
	// An effect rather than afterNavigate: it also runs for the page the visitor landed on.
	// Shallow query updates (gallery filters) give `page.url` a new object with the same
	// path, so the last path is remembered to count each page once.
	let last: string | undefined;
	$effect(() => {
		const route = page.route.id;
		const path = page.url.pathname;
		if (!route || path === last) return;
		last = path;
		pageview({ route, path });
	});
}
