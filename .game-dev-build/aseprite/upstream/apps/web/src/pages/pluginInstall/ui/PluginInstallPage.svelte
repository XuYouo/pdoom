<script lang="ts">
	import { resolve } from '$app/paths';
	import ArrowLeftIcon from '~icons/pixelarticons/arrow-left';
	import BrushIcon from '~icons/pixelarticons/brush';
	import ExternalLinkIcon from '~icons/pixelarticons/external-link';
	import { CopyButton } from '#features/copyPrompt/index.js';
	import { Markdown } from '#shared/ui/markdown/index.js';
	import { Seo } from '#shared/ui/seo/index.js';
	import {
		INSTALL_DOC_URL,
		NPM_PACKAGE,
		PLUGIN_NAME,
		SITE_NAME,
		SITE_URL
	} from '#shared/lib/site.js';
	import type { PluginInstallPageData } from '../model/types';

	interface Props {
		data: PluginInstallPageData;
	}

	let { data }: Props = $props();

	const { guide } = $derived(data);

	// The quick start mirrors the README's Install section; the full guide below is
	// docs/INSTALL.md itself, fetched from GitHub when the site is built.
	const agents = [
		{
			name: 'Claude Code',
			commands: [
				'/plugin marketplace add with-pebbly/aseprite-ai-artist',
				'/plugin install aseprite@aseprite-ai-artist'
			],
			note: 'Type these in a Claude Code session.',
			prompt: '>'
		},
		{
			name: 'omp',
			commands: [
				'omp plugin marketplace add with-pebbly/aseprite-ai-artist',
				'omp plugin install aseprite@aseprite-ai-artist'
			],
			note: 'Run these in your shell.',
			prompt: '$'
		},
		{
			name: 'Codex, Gemini CLI, Cursor, VS Code, Windsurf',
			commands: [`npx ${NPM_PACKAGE} install codex`],
			note: 'Swap codex for gemini or cursor, or pass --all. Your config is backed up first; --dry-run shows the change.',
			prompt: '$'
		}
	];

	const steps = [
		{
			id: 'extension',
			title: 'Install the Aseprite extension',
			body: 'This puts the bridge into Aseprite. Quit and reopen Aseprite afterwards. Run it again to update.',
			command: `npx ${NPM_PACKAGE} install-extension`
		},
		{
			id: 'agent',
			title: 'Connect your agent',
			body: 'Pick the agent you use.',
			command: null
		},
		{
			id: 'doctor',
			title: 'Check it',
			body: 'Restart your agent, then run the doctor. All ticks means you are ready.',
			command: `npx ${NPM_PACKAGE} doctor`
		}
	];

	const description = `How to install ${PLUGIN_NAME}, the MCP server that lets Claude Code, Codex, Gemini CLI and Cursor draw pixel art in Aseprite: one npx command for the Aseprite extension, one for your agent, and a doctor check.`;

	const jsonLd = [
		{
			'@context': 'https://schema.org',
			'@type': 'HowTo',
			name: `Install ${PLUGIN_NAME}`,
			description,
			tool: [
				{ '@type': 'HowToTool', name: 'Aseprite 1.3 or later' },
				{ '@type': 'HowToTool', name: 'Node.js 22.6 or later' }
			],
			step: steps.map((step, index) => ({
				'@type': 'HowToStep',
				position: index + 1,
				name: step.title,
				text: step.command ? `${step.body} Command: ${step.command}` : step.body,
				url: `${SITE_URL}/plugin/install#${step.id}`
			}))
		},
		{
			'@context': 'https://schema.org',
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: SITE_NAME, item: SITE_URL },
				{ '@type': 'ListItem', position: 2, name: 'Plugin', item: `${SITE_URL}/plugin` },
				{ '@type': 'ListItem', position: 3, name: 'Install', item: `${SITE_URL}/plugin/install` }
			]
		}
	];
</script>

<!-- A command as a framed terminal: the title bar carries the dots, the shell or agent it is for,
     and the copy button. The prompt glyph is decoration, outside the copied text. -->
{#snippet command(text: string, title: string, prompt: string)}
	<div class="pixel-frame mt-4 bg-card [--frame:4px]">
		<div class="flex items-center gap-2 border-b-4 border-pixel py-1 pr-2 pl-4">
			<span class="size-2.5 bg-pico-red" aria-hidden="true"></span>
			<span class="size-2.5 bg-pico-yellow" aria-hidden="true"></span>
			<span class="size-2.5 bg-pico-green" aria-hidden="true"></span>
			<span class="ml-2 min-w-0 flex-1 truncate retro text-[0.625rem] text-muted-foreground"
				>{title}</span
			>
			<CopyButton {text} label="Copy" done="Copied: {text}" />
		</div>
		<pre class="overflow-x-auto px-4 py-4 font-mono text-sm"><code
				><span class="text-accent-ink select-none" aria-hidden="true">{prompt} </span>{text}</code
			></pre>
	</div>
{/snippet}

<Seo title="Install {PLUGIN_NAME}" {description} {jsonLd} />

<header class="page-hero mx-auto max-w-3xl px-4 pt-10 sm:px-6">
	<nav aria-label="Breadcrumb">
		<a
			href={resolve('plugin')}
			class="inline-flex h-11 items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
		>
			<ArrowLeftIcon aria-hidden="true" />
			{PLUGIN_NAME}
		</a>
	</nav>

	<p class="eyebrow mt-6">Quick start</p>
	<h1 class="title-depth mt-5 text-2xl leading-snug sm:text-4xl sm:leading-snug">
		Install {PLUGIN_NAME}
	</h1>
	<p class="lead mt-5">
		You need <a
			href="https://www.aseprite.org/"
			rel="noopener"
			class="text-foreground underline underline-offset-4">Aseprite</a
		>
		1.3 or later and Node.js 22.6 or later, on macOS, Linux or Windows. Three commands, about a minute.
	</p>
</header>

<div class="mx-auto max-w-3xl px-4 sm:px-6">
	<!-- The stepper: a dashed pixel rail runs from gem to gem. Its first and last pixels stop short
	     of each gem so the rail never touches the numbers. -->
	<ol class="mt-14">
		{#each steps as step, index (step.id)}
			<li
				id={step.id}
				class="relative grid scroll-mt-24 grid-cols-[auto_minmax(0,1fr)] gap-x-5 pb-14 last:pb-0 sm:gap-x-7"
			>
				{#if index < steps.length - 1}
					<span
						class="absolute top-[3.75rem] bottom-2 left-[22px] w-1 bg-[repeating-linear-gradient(180deg,var(--pixel)_0_8px,transparent_8px_16px)]"
						aria-hidden="true"
					></span>
				{/if}
				<span class="z-10 h-fit" aria-hidden="true">
					<span class="gem grid size-12 place-items-center retro text-base">{index + 1}</span>
				</span>
				<div class="min-w-0 pt-2">
					<h2 class="text-sm leading-relaxed sm:text-base">{step.title}</h2>
					<p class="mt-3 text-muted-foreground">{step.body}</p>
					{#if step.command}
						{@render command(step.command, 'shell', '$')}
					{:else}
						<div class="mt-6 space-y-6">
							{#each agents as agent (agent.name)}
								<section
									class="border-l-4 border-dashed border-pixel pl-4"
									aria-labelledby="agent-{agent.name}"
								>
									<h3 id="agent-{agent.name}" class="text-sm leading-relaxed font-normal">
										{agent.name}
									</h3>
									<p class="mt-1 text-sm text-muted-foreground">{agent.note}</p>
									{#each agent.commands as line (line)}
										{@render command(line, agent.name, agent.prompt)}
									{/each}
								</section>
							{/each}
						</div>
					{/if}
				</div>
			</li>
		{/each}
	</ol>

	<!-- A callout, not a step: the accent gem marks it as the payoff. -->
	<section class="mt-20" aria-labelledby="first-prompt">
		<div class="pixel-frame flex gap-4 bg-card p-5 sm:p-6">
			<span class="gem grid size-12 shrink-0 place-items-center" aria-hidden="true">
				<BrushIcon />
			</span>
			<div>
				<h2 id="first-prompt" class="text-sm leading-relaxed">Your first drawing</h2>
				<p class="mt-3 text-muted-foreground">
					Open a sprite in Aseprite and ask your agent for something, for example
					<em class="text-foreground"
						>"Draw me a 32×32 knight in the PICO-8 palette, then give him a 4-frame idle."</em
					>
					In Claude Code, <code class="text-foreground">/aseprite:studio</code> runs the whole job.
				</p>
			</div>
		</div>
	</section>
</div>

<section class="mx-auto max-w-4xl px-4 pt-24 sm:px-6" aria-labelledby="guide-heading">
	<div class="flex flex-wrap items-baseline justify-between gap-4">
		<h2 id="guide-heading" class="section-title text-lg sm:text-2xl">Full install guide</h2>
		<a
			href={INSTALL_DOC_URL}
			rel="noopener"
			class="inline-flex min-h-11 items-center gap-1.5 text-sm underline underline-offset-4"
		>
			View on GitHub
			<ExternalLinkIcon aria-hidden="true" />
		</a>
	</div>
	<p class="mt-5 max-w-[62ch] text-muted-foreground">
		Every agent, project scope, headless mode, troubleshooting and uninstalling.
	</p>
	{#if guide}
		<div class="mt-8">
			<div class="pixel-frame bg-card">
				<div class="flex items-center gap-2 border-b-4 border-pixel px-4 py-2.5">
					<span class="size-2.5 bg-pico-red" aria-hidden="true"></span>
					<span class="size-2.5 bg-pico-yellow" aria-hidden="true"></span>
					<span class="size-2.5 bg-pico-green" aria-hidden="true"></span>
					<span class="ml-2 truncate retro text-[0.625rem] text-muted-foreground">INSTALL.md</span>
				</div>
				<div class="px-5 py-2 sm:px-10 sm:py-6">
					<Markdown html={guide} />
				</div>
			</div>
		</div>
	{:else}
		<p class="mt-6">
			The guide could not be fetched when this page was built.
			<a href={INSTALL_DOC_URL} rel="noopener" class="underline underline-offset-4"
				>Read it on GitHub</a
			>.
		</p>
	{/if}
</section>
