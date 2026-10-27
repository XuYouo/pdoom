import type { Component } from 'svelte';
import type { SvelteHTMLElements } from 'svelte/elements';

/** One of the site's main sections, as the header and its menu list them. */
export interface NavLink {
	href: string;
	label: string;
	/** Shown beside the label in the menu, where there is room for it. */
	icon: Component<SvelteHTMLElements['svg']>;
	/** Drawn in the holographic accent. */
	accent?: boolean;
}
