import fsd from '@feature-sliced/steiger-plugin';

// `src/routes` is SvelteKit's router, not an FSD layer, and steiger leaves it alone, so the
// recommended rules apply unmodified. See README.md for the one place FSD bends to SvelteKit.
export default [...fsd.configs.recommended];
