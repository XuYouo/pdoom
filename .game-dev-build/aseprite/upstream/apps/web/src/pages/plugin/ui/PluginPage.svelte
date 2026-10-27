<script lang="ts">
	import { resolve } from '$app/paths';
	import BookOpenIcon from '~icons/pixelarticons/book-open';
	import BugIcon from '~icons/pixelarticons/bug';
	import CalendarIcon from '~icons/pixelarticons/calendar';
	import DownloadIcon from '~icons/pixelarticons/download';
	import ExternalLinkIcon from '~icons/pixelarticons/external-link';
	import EyeIcon from '~icons/pixelarticons/eye';
	import GitBranchIcon from '~icons/pixelarticons/git-branch';
	import GithubIcon from '~icons/pixelarticons/github';
	import PackageIcon from '~icons/pixelarticons/package';
	import RobotIcon from '~icons/pixelarticons/robot';
	import ScriptIcon from '~icons/pixelarticons/script';
	import StarIcon from '~icons/pixelarticons/star';
	import TerminalIcon from '~icons/pixelarticons/terminal';
	import UsersIcon from '~icons/pixelarticons/users';
	import { Badge, Button } from '#shared/ui/8bit/index.js';
	import { Markdown } from '#shared/ui/markdown/index.js';
	import { Seo } from '#shared/ui/seo/index.js';
	import { formatDate } from '#shared/lib/format.js';
	import {
		NPM_PACKAGE,
		NPM_URL,
		PLUGIN_NAME,
		README_URL,
		REPO_URL,
		SITE_NAME,
		SITE_URL,
		STUDIO_URL
	} from '#shared/lib/site.js';
	import type { PluginPageData } from '../model/types';

	interface Props {
		data: PluginPageData;
	}

	let { data }: Props = $props();

	const { readme, stats, skills, agents, fetchedAt } = $derived(data);

	const count = new Intl.NumberFormat('en', { notation: 'compact', maximumFractionDigits: 1 });

	const description = $derived(
		`Aseprite AI Artist is an open-source MCP server and Claude Code plugin that lets AI agents draw pixel art, animate sprites and export spritesheets in your open Aseprite window. ${skills.length} skills; works with Claude Code, Codex, Gemini CLI and Cursor.`
	);

	const statTiles = $derived(
		stats
			? [
					{
						icon: StarIcon,
						label: 'Stars',
						value: count.format(stats.stars),
						href: `${REPO_URL}/stargazers`
					},
					{
						icon: GitBranchIcon,
						label: 'Forks',
						value: count.format(stats.forks),
						href: `${REPO_URL}/forks`
					},
					{
						icon: UsersIcon,
						label: 'Contributors',
						value: stats.contributors === null ? '—' : count.format(stats.contributors),
						href: `${REPO_URL}/graphs/contributors`
					},
					{
						icon: BugIcon,
						label: 'Open issues & PRs',
						value: count.format(stats.openIssues),
						href: `${REPO_URL}/issues`
					},
					{
						icon: EyeIcon,
						label: 'Watchers',
						value: count.format(stats.watchers),
						href: `${REPO_URL}/watchers`
					},
					{
						icon: PackageIcon,
						label: 'npm version',
						value: stats.npm ? `v${stats.npm.version}` : '—',
						href: NPM_URL
					},
					{
						icon: DownloadIcon,
						label: 'npm downloads / month',
						value:
							stats.npm?.monthlyDownloads == null ? '—' : count.format(stats.npm.monthlyDownloads),
						href: NPM_URL
					},
					{
						icon: CalendarIcon,
						label: 'Last commit',
						// formatDate takes a calendar date; GitHub and the build stamp are timestamps.
						value: formatDate(stats.pushedAt.slice(0, 10)),
						href: `${REPO_URL}/commits/main`
					}
				]
			: []
	);

	const jsonLd = $derived([
		{
			'@context': 'https://schema.org',
			'@type': 'SoftwareApplication',
			name: PLUGIN_NAME,
			description,
			url: `${SITE_URL}/plugin`,
			applicationCategory: 'DeveloperApplication',
			applicationSubCategory: 'MCP server',
			operatingSystem: 'macOS, Linux, Windows',
			...(stats?.npm ? { softwareVersion: stats.npm.version } : {}),
			...(stats?.license ? { license: `https://spdx.org/licenses/${stats.license}.html` } : {}),
			downloadUrl: NPM_URL,
			installUrl: `${SITE_URL}/plugin/install`,
			softwareRequirements: 'Aseprite 1.3+, Node.js 22.6+',
			offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
			author: { '@type': 'Organization', name: 'pebbly', url: STUDIO_URL },
			sameAs: [REPO_URL, NPM_URL]
		},
		{
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
				{ '@type': 'ListItem', position: 2, name: 'Plugin', item: `${SITE_URL}/plugin` }
			]
		}
	]);
</script>

<Seo title="{PLUGIN_NAME}, AI pixel art in Aseprite" {description} {jsonLd} />

<section class="page-hero">
	<div class="mx-auto max-w-6xl px-4 pt-12 pb-4 sm:px-6 sm:pt-16">
		<p class="eyebrow">The plugin</p>
		<h1
			class="title-depth mt-5 text-[1.625rem] leading-snug sm:text-4xl sm:leading-snug xl:text-[2.75rem]"
		>
			Aseprite <span class="text-holo">AI</span> Artist
		</h1>
		<p class="lead mt-6 sm:text-xl">
			Your coding agent, painting in the Aseprite window you already have open. Not a generated PNG
			and not a file changed behind your back: the document on your screen, one pixel at a time, and
			every step is one Ctrl+Z.
		</p>
		<p class="mt-4 max-w-[62ch] text-muted-foreground">
			Works with Claude Code, omp, Codex CLI, Gemini CLI, Cursor, VS Code and Windsurf. Free and
			open source.
		</p>
		<div class="mt-9 flex flex-wrap items-center gap-6 px-1.5">
			<Button href={resolve('plugin/install')} variant="accent" size="lg">
				<TerminalIcon aria-hidden="true" />
				Install
			</Button>
			<Button href={REPO_URL} variant="outline" size="lg" rel="noopener">
				<GithubIcon aria-hidden="true" />
				GitHub
			</Button>
			<Button href={NPM_URL} variant="ghost" size="lg" rel="noopener">
				<PackageIcon aria-hidden="true" />
				npm
			</Button>
		</div>
		<div class="mt-8 flex flex-wrap items-center gap-4 border-t-4 border-dashed border-pixel pt-6">
			<Badge class="text-[0.625rem]">MCP plugin</Badge>
			{#if stats?.npm}
				<Badge variant="secondary" class="text-[0.625rem]">v{stats.npm.version}</Badge>
			{/if}
			{#if stats?.license}
				<Badge variant="outline" class="text-[0.625rem]">{stats.license}</Badge>
			{/if}
		</div>
	</div>
</section>

<div class="mx-auto max-w-6xl px-4 sm:px-6">
	<section class="pt-16" aria-labelledby="stats-heading">
		<h2 id="stats-heading" class="section-title text-lg sm:text-2xl">Repository</h2>
		{#if stats}
			<ul class="mt-8 grid grid-cols-2 gap-4 md:grid-cols-4">
				{#each statTiles as tile (tile.label)}
					<li class="flex">
						<a
							href={tile.href}
							rel="noopener"
							class="pixel-frame flex flex-1 flex-col gap-3 bg-card p-4 transition-colors [--frame:4px] hover:bg-muted"
						>
							<span class="flex items-center gap-2 text-sm text-muted-foreground">
								<tile.icon class="text-primary-ink" aria-hidden="true" />
								{tile.label}
							</span>
							<span class="mt-auto retro text-base tabular-nums sm:text-lg">{tile.value}</span>
						</a>
					</li>
				{/each}
			</ul>
			<p class="mt-5 text-sm text-muted-foreground">
				{#if stats.latestRelease}
					Latest release
					<a
						href={stats.latestRelease.url}
						rel="noopener"
						class="text-foreground underline underline-offset-4">{stats.latestRelease.tag}</a
					>, {formatDate(stats.latestRelease.publishedAt.slice(0, 10))}.
				{/if}
				Numbers as of {formatDate(fetchedAt.slice(0, 10))}; the live ones are on
				<a href={REPO_URL} rel="noopener" class="text-foreground underline underline-offset-4"
					>GitHub</a
				>.
			</p>
			{#if stats.topics.length > 0}
				<ul class="mt-6 flex flex-wrap gap-3 px-1.5" aria-label="Topics">
					{#each stats.topics as topic (topic)}
						<li>
							<Badge
								variant="outline"
								font="normal"
								href="https://github.com/topics/{topic}"
								rel="noopener"
								class="text-xs">{topic}</Badge
							>
						</li>
					{/each}
				</ul>
			{/if}
		{:else}
			<p class="mt-6 text-muted-foreground">
				The repository numbers could not be fetched when this page was built. They are always on
				<a href={REPO_URL} rel="noopener" class="text-foreground underline underline-offset-4"
					>GitHub</a
				>.
			</p>
		{/if}
	</section>

	<section class="pt-20" aria-labelledby="skills-heading">
		<h2 id="skills-heading" class="section-title text-lg sm:text-2xl">Skills</h2>
		<p class="mt-5 max-w-[62ch] text-muted-foreground">
			Workflows the agent follows, in the order that catches mistakes while they are still cheap. In
			Claude Code and omp they are slash commands; any other MCP client gets them as prompts with
			the same names. Start with
			<code class="text-foreground">/aseprite:studio</code>: it picks and runs the others.
		</p>
		<ul class="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
			{#each skills as skill (skill.name)}
				<li class="flex">
					<div class="pixel-frame flex flex-1 flex-col bg-card p-5 [--frame:4px]">
						<code class="retro text-[0.625rem] text-primary-ink">/aseprite:{skill.name}</code>
						<h3 class="mt-3 font-sans text-lg leading-snug font-semibold">{skill.title}</h3>
						<p class="mt-2 text-sm text-muted-foreground">{skill.description}</p>
						<a
							href={resolve('/knowledge/[section]/[slug]', { section: 'skills', slug: skill.name })}
							class="mt-auto inline-flex min-h-11 items-end gap-1.5 pt-4 text-sm text-foreground underline underline-offset-4"
						>
							<ScriptIcon aria-hidden="true" />
							Read the skill<span class="sr-only">: {skill.title}</span>
						</a>
					</div>
				</li>
			{/each}
		</ul>
	</section>

	<section class="pt-20" aria-labelledby="agents-heading">
		<h2 id="agents-heading" class="section-title text-lg sm:text-2xl">Agents</h2>
		<p class="mt-5 max-w-[62ch] text-muted-foreground">
			Specialist subagents that ship with the Claude Code plugin. The main session hands them a
			focused job and gets a report back.
		</p>
		<ul class="mt-8 grid gap-6 sm:grid-cols-2">
			{#each agents as agent (agent.name)}
				<li class="flex">
					<div class="pixel-frame flex flex-1 flex-col bg-card p-5 [--frame:4px]">
						<h3 class="flex items-center gap-3 text-base font-normal">
							<span class="gem grid size-10 place-items-center">
								<RobotIcon aria-hidden="true" />
							</span>
							<code class="retro text-xs">{agent.name}</code>
						</h3>
						<p class="mt-4 text-sm text-muted-foreground">{agent.description}</p>
						<a
							href={resolve('/knowledge/[section]/[slug]', { section: 'agents', slug: agent.name })}
							class="mt-auto inline-flex min-h-11 items-end pt-3 text-sm text-foreground underline underline-offset-4"
							>Agent definition<span class="sr-only">: {agent.name}</span></a
						>
					</div>
				</li>
			{/each}
		</ul>
		<p class="mt-8 max-w-[62ch] text-muted-foreground">
			Skills and agents both work from the
			<a href={resolve('/knowledge')} class="text-foreground underline underline-offset-4"
				>pixel-art knowledge base</a
			>: rules for lines, colour, characters, animation and effects, with the pixel templates they
			copy from.
		</p>
	</section>

	<section class="pt-20" aria-labelledby="readme-heading">
		<div class="flex flex-wrap items-baseline justify-between gap-4">
			<h2 id="readme-heading" class="section-title text-lg sm:text-2xl">README</h2>
			<a
				href={README_URL}
				rel="noopener"
				class="inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-4"
			>
				View on GitHub
				<ExternalLinkIcon aria-hidden="true" />
			</a>
		</div>
		{#if readme}
			<!-- The README as a document window, like the art window on the home page. -->
			<div class="mt-8">
				<div class="pixel-frame bg-card">
					<div class="flex items-center gap-2 border-b-4 border-pixel px-4 py-2.5">
						<span class="size-2.5 bg-pico-red" aria-hidden="true"></span>
						<span class="size-2.5 bg-pico-yellow" aria-hidden="true"></span>
						<span class="size-2.5 bg-pico-green" aria-hidden="true"></span>
						<BookOpenIcon class="ml-2 text-muted-foreground" aria-hidden="true" />
						<span class="truncate retro text-[0.625rem] text-muted-foreground">README.md</span>
					</div>
					<div class="px-5 py-2 sm:px-10 sm:py-6">
						<Markdown html={readme} />
					</div>
				</div>
			</div>
		{:else}
			<p class="mt-6 text-muted-foreground">
				The README could not be fetched when this page was built.
				<a href={README_URL} rel="noopener" class="text-foreground underline underline-offset-4"
					>Read it on GitHub</a
				>, or go straight to the
				<a href={resolve('plugin/install')} class="text-foreground underline underline-offset-4"
					>install guide</a
				>.
			</p>
		{/if}
	</section>

	<p class="pt-12 text-sm text-muted-foreground">
		Install it from npm as <code class="text-foreground">{NPM_PACKAGE}</code>, or see everything it
		has drawn in the
		<a href={resolve('gallery')} class="text-foreground underline underline-offset-4">gallery</a>.
	</p>
</div>
