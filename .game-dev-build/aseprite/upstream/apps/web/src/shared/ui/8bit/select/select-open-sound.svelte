<script lang="ts">
	// Renders nothing: mounted inside the list, it plays once each time the list opens, without
	// adding an element among the listbox's options.
	import { onMount } from 'svelte';
	import { playSound } from '#shared/lib/sound/index.js';

	onMount(() => playSound('expand'));
</script>
