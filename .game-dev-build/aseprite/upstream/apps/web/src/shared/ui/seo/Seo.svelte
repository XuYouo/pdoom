<script lang="ts">
	// The one place a page's search and share metadata is written. The layout adds what is the
	// same everywhere (canonical, og:url, og:site_name); this adds what each page owns.
	import { OG_IMAGE_URL, SITE_NAME } from '#shared/lib/site.js';

	interface Props {
		/** The page's own title; the site name is appended unless it is already in it. */
		title: string;
		description?: string;
		/** Absolute URL. Without one, the site's card is used. */
		image?: string;
		imageAlt?: string;
		type?: 'website' | 'article';
		/** schema.org objects, written as JSON-LD. */
		jsonLd?: Record<string, unknown> | Record<string, unknown>[];
		noindex?: boolean;
	}

	let {
		title,
		description,
		image,
		imageAlt,
		type = 'website',
		jsonLd,
		noindex = false
	}: Props = $props();

	const fullTitle = $derived(title.includes(SITE_NAME) ? title : `${title}: ${SITE_NAME}`);
	const cardImage = $derived(image ?? OG_IMAGE_URL);
	// A closing script tag inside the JSON would end the element early; JSON allows \u003c in
	// place of every `<`. The tag names are split so the Svelte parser does not see them either.
	const SCRIPT = 'scr' + 'ipt';
	const ldJson = $derived(
		jsonLd
			? `<${SCRIPT} type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, '\\u003c')}</${SCRIPT}>`
			: ''
	);
</script>

<svelte:head>
	<title>{fullTitle}</title>
	{#if description}
		<meta name="description" content={description} />
		<meta property="og:description" content={description} />
		<meta name="twitter:description" content={description} />
	{/if}
	{#if noindex}
		<meta name="robots" content="noindex" />
	{/if}
	<meta property="og:title" content={fullTitle} />
	<meta property="og:type" content={type} />
	<meta property="og:image" content={cardImage} />
	{#if !image}
		<meta property="og:image:width" content="1200" />
		<meta property="og:image:height" content="630" />
	{/if}
	<meta
		property="og:image:alt"
		content={imageAlt ?? `${SITE_NAME}: pixel art drawn by AI agents in Aseprite`}
	/>
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:title" content={fullTitle} />
	<meta name="twitter:image" content={cardImage} />
	<!-- eslint-disable-next-line svelte/no-at-html-tags -- serialised and escaped above -->
	{@html ldJson}
</svelte:head>
