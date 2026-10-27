<script lang="ts">
	import { AppLayout } from '#app-shell/layout/index.js';

	let { children } = $props();
</script>

<AppLayout>
	{@render children()}
</AppLayout>
