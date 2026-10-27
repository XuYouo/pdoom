<script lang="ts">
	import type { KnowledgeNavGroup } from '../model/types';

	interface Props {
		groups: KnowledgeNavGroup[];
		/** The current page's path; its group starts open and its link is marked. */
		current: string;
	}

	let { groups, current }: Props = $props();
</script>

<!-- Eighty links: every group is a disclosure, and only the one holding this page starts open. -->
<ul class="space-y-1">
	{#each groups as group (group.title)}
		{@const here = group.links.some((link) => link.href === current)}
		<li>
			<details open={here} class="group/nav">
				<summary
					class="flex min-h-10 cursor-pointer items-center gap-2 py-1 text-sm text-muted-foreground group-open/nav:text-foreground hover:text-foreground"
				>
					<span
						class="inline-block size-2 shrink-0 bg-current group-open/nav:bg-accent"
						aria-hidden="true"
					></span>
					{group.title}
				</summary>
				<ul class="mb-3 ml-1 border-l-4 border-dashed border-pixel">
					{#each group.links as link (link.href)}
						<li>
							<a
								href={link.href}
								aria-current={link.href === current ? 'page' : undefined}
								class="-ml-1 flex min-h-10 items-baseline gap-2 border-l-4 border-transparent py-1.5 pl-3 text-sm leading-snug text-muted-foreground transition-colors hover:border-pixel hover:bg-muted hover:text-foreground aria-[current=page]:border-accent aria-[current=page]:bg-muted aria-[current=page]:font-semibold aria-[current=page]:text-foreground"
							>
								{#if link.marker}
									<span class="shrink-0 text-muted-foreground tabular-nums">{link.marker}</span>
								{/if}
								<span>{link.label}</span>
							</a>
						</li>
					{/each}
				</ul>
			</details>
		</li>
	{/each}
</ul>

<style>
	summary {
		list-style: none;
	}
	summary::-webkit-details-marker {
		display: none;
	}
</style>
