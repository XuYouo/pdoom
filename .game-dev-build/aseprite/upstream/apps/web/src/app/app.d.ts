/// <reference types="unplugin-icons/types/svelte5" />

declare global {
	/** Absolute path of the gallery folder, fixed at build time by vite.config.ts. */
	const __GALLERY_ROOT__: string;

	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
