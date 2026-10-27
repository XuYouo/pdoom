<script lang="ts">
	import type { ArticleHeading } from '#entities/knowledge/index.js';

	let { headings }: { headings: ArticleHeading[] } = $props();
</script>

<ul class="space-y-0.5 border-l-4 border-dashed border-border text-sm">
	{#each headings as heading (heading.id)}
		<li>
			<a
				href="#{heading.id}"
				class="-ml-1 block border-l-4 border-transparent py-1.5 leading-snug text-muted-foreground transition-colors hover:border-accent hover:text-foreground {heading.depth ===
				3
					? 'pl-7'
					: 'pl-3'}">{heading.text}</a
			>
		</li>
	{/each}
</ul>
