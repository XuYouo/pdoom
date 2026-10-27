<script lang="ts">
	import DownloadIcon from '~icons/pixelarticons/download';
	import { Button, Table } from '#shared/ui/8bit/index.js';
	import { formatBytes } from '#shared/lib/format.js';
	import { saveFrom } from '#shared/lib/download.js';
	import { roleLabel, type FileView } from '#entities/generation/index.js';

	interface Props {
		files: FileView[];
	}

	let { files }: Props = $props();
</script>

<section aria-labelledby="files">
	<h2 id="files" class="section-title text-lg sm:text-2xl">Files</h2>
	<div class="pixel-frame mt-8 overflow-x-auto bg-card">
		<Table.Root font="normal" containerClass="w-full min-w-max" class="text-sm">
			<caption class="sr-only">Every file in this generation</caption>
			<Table.Header class="bg-muted/60">
				<Table.Row>
					<Table.Head class="retro text-[0.625rem]">File</Table.Head>
					<Table.Head class="retro text-[0.625rem]">Role</Table.Head>
					<Table.Head class="retro text-[0.625rem]">Step</Table.Head>
					<Table.Head class="text-right retro text-[0.625rem]">Size</Table.Head>
					<Table.Head><span class="sr-only">Download</span></Table.Head>
				</Table.Row>
			</Table.Header>
			<Table.Body class="[&_tr:nth-child(even)]:bg-muted/30">
				{#each files as file (file.name)}
					<Table.Row class="last:border-b-0">
						<Table.Head scope="row" class="h-auto py-3 font-medium text-foreground">
							{file.name}
							{#if file.label}<span class="block text-xs font-normal text-muted-foreground"
									>{file.label}</span
								>{/if}
						</Table.Head>
						<Table.Cell>{roleLabel[file.role]}</Table.Cell>
						<Table.Cell class="text-muted-foreground">{file.step ?? '—'}</Table.Cell>
						<Table.Cell class="text-right tabular-nums">{formatBytes(file.bytes)}</Table.Cell>
						<Table.Cell class="py-3 pr-4 text-right">
							<Button
								href={file.url}
								download={file.name}
								data-sound="confirm"
								onclick={(event: MouseEvent) => saveFrom(event, file.url, file.name)}
								variant="outline"
								size="sm"
							>
								<DownloadIcon aria-hidden="true" />
								Download<span class="sr-only"> {file.name}</span>
							</Button>
						</Table.Cell>
					</Table.Row>
				{/each}
			</Table.Body>
		</Table.Root>
	</div>
</section>
