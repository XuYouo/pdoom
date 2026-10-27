<script lang="ts">
	import { PixelImage } from '#shared/ui/pixel/index.js';
	import type { FileView } from '../model/types';

	interface Props {
		file: FileView;
		alt: string;
		/** The art never gets shorter than this; a very wide image gets space above and below. */
		minHeight?: number;
		eager?: boolean;
		/** A click opens the art full screen. */
		zoomable?: boolean;
		class?: string;
	}

	let { file, alt, minHeight, eager = false, zoomable = false, class: className }: Props = $props();
</script>

<PixelImage
	src={file.url}
	width={file.width}
	height={file.height}
	pixel={file.pixel}
	{alt}
	{minHeight}
	{eager}
	{zoomable}
	class={className}
/>
