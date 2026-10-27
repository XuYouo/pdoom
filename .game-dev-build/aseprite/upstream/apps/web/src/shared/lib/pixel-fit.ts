// Fitting pixel art into a box. Art on this site fills the space it is given (edge to edge, the
// height following the width) rather than stopping at a whole multiple of its native size and
// leaving margins; `image-rendering: pixelated` keeps the edges hard at any scale.

export interface PixelSize {
	width: number;
	height: number;
}

/** The size of `art` that exactly fills `box` without overflowing it (CSS `contain`). */
export function containPixels(art: PixelSize, box: PixelSize): PixelSize {
	const scale = Math.min(box.width / art.width, box.height / art.height);
	return { width: art.width * scale, height: art.height * scale };
}
