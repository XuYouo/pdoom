<script lang="ts">
	// The sound counterpart of ../retro-mode-switcher: the same ghost pixel button beside it.
	import VolumeIcon from '~icons/pixelarticons/volume-2';
	import MuteIcon from '~icons/pixelarticons/volume-x';
	import { Button } from '../button';
	import { playSound, soundSetting } from '#shared/lib/sound/index.js';

	let { class: className }: { class?: string } = $props();

	function toggle() {
		// Turning off still says so; the sound is started before the setting silences the next.
		if (soundSetting.enabled) {
			playSound('switch-off');
			soundSetting.enabled = false;
		} else {
			soundSetting.enabled = true;
			playSound('switch-on');
		}
	}
</script>

<Button variant="ghost" class="size-10 px-0" aria-pressed={soundSetting.enabled} onclick={toggle}>
	{#if soundSetting.enabled}
		<VolumeIcon class={className} aria-hidden="true" />
	{:else}
		<MuteIcon class={className} aria-hidden="true" />
	{/if}
	<span class="sr-only">Sound effects</span>
</Button>
