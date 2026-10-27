<script lang="ts">
	import { resolve } from '$app/paths';
	import BookOpenIcon from '~icons/pixelarticons/book-open';
	import GridIcon from '~icons/pixelarticons/grid';
	import RobotIcon from '~icons/pixelarticons/robot';
	import ScriptIcon from '~icons/pixelarticons/script';
	import SearchIcon from '~icons/pixelarticons/search';
	import { Badge, Button, Input, ToggleGroup } from '#shared/ui/8bit/index.js';
	import { Seo } from '#shared/ui/seo/index.js';
	import { CopyButton } from '#features/copyPrompt/index.js';
	import { PaletteCard } from '#entities/knowledge/index.js';
	import { SITE_NAME, SITE_URL } from '#shared/lib/site.js';
	import type { KnowledgePageData } from '../model/types';

	interface Props {
		data: KnowledgePageData;
	}

	let { data }: Props = $props();

	const ruleCount = $derived(data.bands.reduce((sum, band) => sum + band.rules.length, 0));
	const templateCount = $derived(
		data.bands.reduce(
			(sum, band) => sum + band.rules.reduce((inBand, rule) => inBand + rule.templates, 0),
			0
		)
	);

	let query = $state('');
	// Every word has to appear somewhere in the entry, in any order: "walk quadruped" finds the
	// animal gaits file, which a phrase match would not.
	const terms = $derived(query.toLowerCase().split(/\s+/).filter(Boolean));
	const matches = (...fields: (string | undefined)[]) => {
		const haystack = fields.join(' ').toLowerCase();
		return terms.every((term) => haystack.includes(term));
	};

	const bands = $derived(
		data.bands
			.map((band) => ({
				...band,
				rules: band.rules.filter((rule) =>
					matches(rule.title, rule.summary, rule.slug, band.title, band.topics)
				)
			}))
			.filter((band) => band.rules.length > 0)
	);
	const skills = $derived(
		data.skills.filter((skill) => matches(skill.name, skill.title, skill.description))
	);
	const agents = $derived(data.agents.filter((agent) => matches(agent.name, agent.description)));
	const palettes = $derived(
		data.palettes.filter((preset) => matches(preset.id, preset.name, preset.author, preset.notes))
	);
	const found = $derived(
		bands.reduce((sum, band) => sum + band.rules.length, 0) +
			skills.length +
			agents.length +
			palettes.length
	);

	const jumps = $derived([
		...bands.map((band) => ({ id: `band-${band.code}`, label: `${band.code} ${band.title}` })),
		...(skills.length ? [{ id: 'skills', label: 'Skills' }] : []),
		...(agents.length ? [{ id: 'agents', label: 'Agents' }] : []),
		{ id: 'palettes', label: 'Palettes' }
	]);

	const description = $derived(
		`The pixel-art rulebook AI agents follow in Aseprite: ${ruleCount} rules on lines, colour, characters, animation, creatures, environments and effects, with ${templateCount} pixel templates, plus the plugin's skills, agents and palettes.`
	);

	const jsonLd = $derived({
		'@context': 'https://schema.org',
		'@type': 'CollectionPage',
		name: `Knowledge base: ${SITE_NAME}`,
		description,
		url: `${SITE_URL}/knowledge`,
		hasPart: data.bands.flatMap((band) =>
			band.rules.map((rule) => ({
				'@type': 'TechArticle',
				headline: rule.title,
				url: `${SITE_URL}/knowledge/rules/${rule.slug}`
			}))
		)
	});
</script>

<Seo title="Pixel-art knowledge base" {description} {jsonLd} />

<header class="page-hero mx-auto max-w-6xl px-4 pt-12 sm:px-6 sm:pt-16">
	<p class="eyebrow">Knowledge base</p>
	<h1 class="title-depth mt-5 text-2xl leading-snug sm:text-4xl sm:leading-snug">
		The pixel-art <span class="text-holo">rulebook</span>
	</h1>
	<p class="lead mt-5">
		What the plugin's agents read before they draw: how a hand works at 16 px, when to anti-alias,
		how a quadruped walks, how an isometric roof meets a wall. Each rule is a decision an agent can
		act on, with the pixel templates it copies from.
	</p>
	<p class="mt-4 max-w-[62ch] text-muted-foreground">
		These are the same files an agent opens as <code class="text-foreground">rules://</code>
		resources, built from the same commit, so what you read here is exactly what it follows.
	</p>

	<!-- The counts as a scoreboard: big numbers, the label under each. -->
	<dl
		class="mt-10 grid max-w-3xl grid-cols-2 gap-x-4 gap-y-6 border-t-4 border-dashed border-pixel pt-6 sm:grid-cols-3 lg:grid-cols-5"
	>
		{#each [{ label: 'Rules', value: ruleCount }, { label: 'Pixel templates', value: templateCount }, { label: 'Palettes', value: data.paletteCount }, { label: 'Skills', value: data.skills.length }, { label: 'Agents', value: data.agents.length }] as stat (stat.label)}
			<div class="flex flex-col-reverse gap-2">
				<dt class="text-sm text-muted-foreground">{stat.label}</dt>
				<dd class="retro text-xl text-foreground tabular-nums sm:text-2xl">{stat.value}</dd>
			</div>
		{/each}
	</dl>
</header>

<div class="mx-auto max-w-6xl px-4 pb-24 sm:px-6">
	<!-- Search and the section jumps share one framed panel, so they read as the page's controls. -->
	<div class="pixel-frame mt-12 bg-card/80 p-5 backdrop-blur-sm sm:p-6">
		<search class="block" aria-label="Knowledge base">
			<label for="knowledge-search" class="flex items-center gap-2 text-sm text-muted-foreground">
				<SearchIcon aria-hidden="true" />
				Search rules, skills, agents and palettes
			</label>
			<div class="mt-3 max-w-xl px-1.5">
				<Input
					id="knowledge-search"
					type="search"
					font="normal"
					placeholder="walk cycle, dithering, hands…"
					autocomplete="off"
					spellcheck="false"
					class="h-12 text-base"
					bind:value={query}
				/>
			</div>
			<p class="mt-3 min-h-5 text-sm text-muted-foreground" aria-live="polite">
				{#if terms.length}
					{found === 1 ? '1 match' : `${found} matches`} for “{query.trim()}”
				{/if}
			</p>
		</search>

		{#if jumps.length}
			<nav aria-label="Sections" class="mt-3 border-t-4 border-dashed border-border pt-5">
				<!-- Same look as the site's toggles; still links, since they jump within the page. -->
				<ul class="flex flex-wrap gap-4 px-1.5 py-1.5">
					{#each jumps as jump (jump.id)}
						<li>
							<ToggleGroup.Link href="#{jump.id}">{jump.label}</ToggleGroup.Link>
						</li>
					{/each}
				</ul>
			</nav>
		{/if}
	</div>

	{#each bands as band (band.code)}
		<section
			id="band-{band.code}"
			class="scroll-mt-24 pt-20"
			aria-labelledby="band-{band.code}-title"
		>
			<div class="flex flex-wrap items-center gap-x-5 gap-y-2">
				<span class="gem px-2.5 py-1.5 retro text-xs" aria-hidden="true">{band.code}</span>
				<!-- No section-title stair: the band's code gem beside it is the marker. -->
				<h2 id="band-{band.code}-title" class="text-lg sm:text-2xl">{band.title}</h2>
			</div>
			{#if band.topics}
				<p class="mt-4 max-w-[62ch] text-muted-foreground">
					{band.topics.charAt(0).toUpperCase()}{band.topics.slice(1)}.
				</p>
			{/if}
			<ul class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each band.rules as rule (rule.slug)}
					<li>
						<a
							href={resolve('/knowledge/[section]/[slug]', { section: 'rules', slug: rule.slug })}
							class="group pixel-frame flex h-full flex-col bg-card p-5 transition-colors hover:bg-muted"
						>
							<span class="retro text-[0.625rem] break-all text-primary-ink"
								>rules://{rule.slug}</span
							>
							<h3
								class="mt-3 font-sans text-lg leading-snug font-semibold group-hover:underline group-hover:underline-offset-4"
							>
								{rule.title}
							</h3>
							<p class="mt-2 mb-4 line-clamp-4 text-sm text-muted-foreground">{rule.summary}</p>
							{#if rule.templates > 0}
								<span
									class="mt-auto inline-flex items-center gap-1.5 border-t-2 border-dashed border-border pt-3 text-sm text-accent-ink"
								>
									<GridIcon aria-hidden="true" />
									{rule.templates === 1 ? '1 pixel template' : `${rule.templates} pixel templates`}
								</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/each}

	{#if skills.length}
		<section id="skills" class="scroll-mt-24 pt-20" aria-labelledby="skills-title">
			<h2 id="skills-title" class="section-title items-center text-lg sm:text-2xl">
				<ScriptIcon aria-hidden="true" />Skills
			</h2>
			<p class="mt-4 max-w-[62ch] text-muted-foreground">
				The workflows that put the rules to work, step by step. In Claude Code and omp they are
				slash commands; other MCP clients get them as prompts.
			</p>
			<ul class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each skills as skill (skill.name)}
					<li>
						<a
							href={resolve('/knowledge/[section]/[slug]', { section: 'skills', slug: skill.name })}
							class="group pixel-frame flex h-full flex-col bg-card p-5 transition-colors hover:bg-muted"
						>
							<code class="retro text-[0.625rem] break-all text-primary-ink"
								>/aseprite:{skill.name}</code
							>
							<h3
								class="mt-3 font-sans text-lg leading-snug font-semibold group-hover:underline group-hover:underline-offset-4"
							>
								{skill.title}
							</h3>
							<p class="mt-2 line-clamp-4 text-sm text-muted-foreground">{skill.description}</p>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	{#if agents.length}
		<section id="agents" class="scroll-mt-24 pt-20" aria-labelledby="agents-title">
			<h2 id="agents-title" class="section-title items-center text-lg sm:text-2xl">
				<RobotIcon aria-hidden="true" />Agents
			</h2>
			<p class="mt-4 max-w-[62ch] text-muted-foreground">
				Specialists the main agent hands work to: each reads the rules for its own job.
			</p>
			<ul class="mt-8 grid gap-5 sm:grid-cols-2">
				{#each agents as agent (agent.name)}
					<li>
						<a
							href={resolve('/knowledge/[section]/[slug]', { section: 'agents', slug: agent.name })}
							class="group pixel-frame flex h-full flex-col bg-card p-5 transition-colors hover:bg-muted"
						>
							<h3
								class="font-sans text-lg leading-snug font-semibold group-hover:underline group-hover:underline-offset-4"
							>
								<code class="text-primary-ink">{agent.name}</code>
							</h3>
							<p class="mt-2 line-clamp-4 text-sm text-muted-foreground">{agent.description}</p>
						</a>
					</li>
				{/each}
			</ul>
		</section>
	{/if}

	<section id="palettes" class="scroll-mt-24 pt-20" aria-labelledby="palettes-title">
		<h2 id="palettes-title" class="section-title items-center text-lg sm:text-2xl">
			<BookOpenIcon aria-hidden="true" />Palettes
		</h2>
		<p class="mt-4 max-w-[62ch] text-muted-foreground">
			{data.paletteCount} bundled presets an agent loads by key with
			<code class="text-foreground">palette</code> op <code class="text-foreground">preset</code>:
			the classics below and the most-downloaded palettes on Lospec. Anything else can be loaded
			from a .gpl, .hex, .pal or .png file.
		</p>
		<div class="mt-8 px-1.5">
			<Button
				href="{resolve('/knowledge/palettes')}{terms.length
					? `?q=${encodeURIComponent(query.trim())}`
					: ''}"
				class="h-auto min-h-9 max-w-full py-2 text-left whitespace-normal"
			>
				<SearchIcon aria-hidden="true" />
				{terms.length
					? `Search all ${data.paletteCount} palettes for “${query.trim()}”`
					: `Browse all ${data.paletteCount} palettes`}
			</Button>
		</div>
		{#if palettes.length}
			<ul class="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
				{#each palettes as preset (preset.id)}
					<li>
						<PaletteCard
							id={preset.id}
							name={preset.name}
							author={preset.author}
							colors={preset.colors}
							notes={preset.notes}
							source={preset.source}
						>
							{#snippet actions()}
								<CopyButton
									text={preset.id}
									label="Copy key {preset.id}"
									done="Copied {preset.id}"
									variant="ghost"
									iconOnly
									class="size-10 px-0"
								/>
							{/snippet}
						</PaletteCard>
					</li>
				{/each}
			</ul>
		{/if}
	</section>

	{#if found === 0}
		<div class="mt-20 border-4 border-dashed border-border bg-card/60 p-8 text-center">
			<p class="retro text-xs">Nothing matches “{query.trim()}”</p>
			<p class="mt-3 text-muted-foreground">
				Try a broader word — <em>animation</em>, <em>colour</em>, <em>tiles</em> — or
				<button
					type="button"
					class="text-foreground underline underline-offset-4"
					onclick={() => (query = '')}>clear the search</button
				>.
			</p>
		</div>
	{/if}
</div>
