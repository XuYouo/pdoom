import type { Attachment } from 'svelte/attachments';

/**
 * Tracks the mouse over an element as `--mx`/`--my` (0–1 across its box) and sets `--shine: 1`
 * while it is over it, for a `HoloShine` inside to follow. Mouse only: a finger's position is
 * where it tapped, and a highlight jumping there reads as a glitch.
 */
export const pointerShine: Attachment<HTMLElement> = (node) => {
	function move(event: PointerEvent) {
		if (event.pointerType !== 'mouse') return;
		const box = node.getBoundingClientRect();
		node.style.setProperty('--mx', ((event.clientX - box.left) / box.width).toFixed(3));
		node.style.setProperty('--my', ((event.clientY - box.top) / box.height).toFixed(3));
		node.style.setProperty('--shine', '1');
	}
	function leave() {
		node.style.removeProperty('--mx');
		node.style.removeProperty('--my');
		node.style.removeProperty('--shine');
	}
	node.addEventListener('pointermove', move);
	node.addEventListener('pointerleave', leave);
	return () => {
		node.removeEventListener('pointermove', move);
		node.removeEventListener('pointerleave', leave);
	};
};
