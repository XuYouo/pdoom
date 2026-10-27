// Pure formatting helpers; none of them names a business concept.
export function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const dateFormat = new Intl.DateTimeFormat('en', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });

export function formatDate(iso: string): string {
	return dateFormat.format(new Date(`${iso}T00:00:00Z`));
}

export function plural(count: number, one: string, many = `${one}s`): string {
	return `${count} ${count === 1 ? one : many}`;
}
