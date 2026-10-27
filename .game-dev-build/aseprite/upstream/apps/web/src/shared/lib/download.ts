/**
 * Save a file under `name` even when it lives on another origin. Browsers
 * ignore the `download` attribute on cross-origin links, so a PNG or GIF served
 * from GitHub would open in a tab instead of saving. Fetching it (the host sends
 * `Access-Control-Allow-Origin: *`) and saving the blob keeps the button honest.
 * On any failure the link's own navigation still happens, so the file is at
 * worst opened rather than lost.
 */
export async function saveFrom(event: MouseEvent, url: string, name: string): Promise<void> {
	if (new URL(url, location.href).origin === location.origin) return;
	event.preventDefault();
	try {
		const response = await fetch(url);
		if (!response.ok) throw new Error(String(response.status));
		const blobUrl = URL.createObjectURL(await response.blob());
		const link = document.createElement('a');
		link.href = blobUrl;
		link.download = name;
		link.click();
		setTimeout(() => URL.revokeObjectURL(blobUrl), 0);
	} catch {
		location.href = url;
	}
}
