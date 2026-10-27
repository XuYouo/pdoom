import { NPM_PACKAGE, REPO_NAME, REPO_OWNER } from '#shared/lib/site.js';

// Everything here runs while the site is prerendered, never in a visitor's request. A failed
// call returns null instead of throwing: the page then links to GitHub, and a GitHub outage or
// an exhausted rate limit (60/hour per IP without GITHUB_TOKEN, shared on build machines) never
// fails a deploy.

const API = 'https://api.github.com';
const REPO = `${REPO_OWNER}/${REPO_NAME}`;
const BRANCH = 'main';

export interface RepoStats {
	stars: number;
	forks: number;
	openIssues: number;
	watchers: number;
	contributors: number | null;
	license: string | null;
	topics: string[];
	createdAt: string;
	pushedAt: string;
	latestRelease: { tag: string; publishedAt: string; url: string } | null;
	npm: { version: string; monthlyDownloads: number | null } | null;
}

function githubHeaders(accept = 'application/vnd.github+json'): HeadersInit {
	const headers: Record<string, string> = { Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
	// process.env rather than $env/dynamic: SvelteKit refuses dynamic env while prerendering, and
	// $env/static would make the token mandatory for every local build.
	const token = process.env.GITHUB_TOKEN;
	if (token) headers.Authorization = `Bearer ${token}`;
	return headers;
}

async function request(url: string, headers?: HeadersInit): Promise<Response | null> {
	try {
		const response = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) });
		if (response.ok) return response;
		console.warn(
			`[plugin page] ${url}: ${response.status} ${response.statusText}; linking to GitHub instead`
		);
	} catch (cause) {
		console.warn(
			`[plugin page] ${url}: ${cause instanceof Error ? cause.message : cause}; linking to GitHub instead`
		);
	}
	return null;
}

async function json<T>(url: string, headers?: HeadersInit): Promise<T | null> {
	const response = await request(url, headers);
	return response ? ((await response.json()) as T) : null;
}

/** GitHub reports the contributor count only through the last page number of a one-per-page list. */
async function contributorCount(): Promise<number | null> {
	const response = await request(
		`${API}/repos/${REPO}/contributors?per_page=1&anon=1`,
		githubHeaders()
	);
	if (!response) return null;
	const last = response.headers.get('link')?.match(/[?&]page=(\d+)>;\s*rel="last"/);
	if (last) return Number(last[1]);
	return ((await response.json()) as unknown[]).length;
}

interface RepoResponse {
	stargazers_count: number;
	forks_count: number;
	open_issues_count: number;
	subscribers_count: number;
	license: { spdx_id: string } | null;
	topics?: string[];
	created_at: string;
	pushed_at: string;
}

/**
 * Shared for a few minutes: enough for one build (35+ prerendered pages read the header's
 * star count), short enough that a warm ISR function does not serve its first answer forever.
 */
const STATS_TTL_MS = 5 * 60_000;
let stats: { promise: Promise<RepoStats | null>; at: number } | undefined;

/** Repository and npm numbers. */
export function repoStats(): Promise<RepoStats | null> {
	if (!stats || Date.now() - stats.at > STATS_TTL_MS)
		stats = { promise: loadStats(), at: Date.now() };
	return stats.promise;
}

async function loadStats(): Promise<RepoStats | null> {
	const [repo, release, contributors, npm, downloads] = await Promise.all([
		json<RepoResponse>(`${API}/repos/${REPO}`, githubHeaders()),
		json<{ tag_name: string; published_at: string; html_url: string }>(
			`${API}/repos/${REPO}/releases/latest`,
			githubHeaders()
		),
		contributorCount(),
		json<{ version: string }>(`https://registry.npmjs.org/${NPM_PACKAGE}/latest`),
		json<{ downloads: number }>(`https://api.npmjs.org/downloads/point/last-month/${NPM_PACKAGE}`)
	]);
	if (!repo) return null;
	return {
		stars: repo.stargazers_count,
		forks: repo.forks_count,
		// GitHub counts open pull requests as issues too.
		openIssues: repo.open_issues_count,
		watchers: repo.subscribers_count,
		contributors,
		license:
			repo.license?.spdx_id && repo.license.spdx_id !== 'NOASSERTION' ? repo.license.spdx_id : null,
		topics: repo.topics ?? [],
		createdAt: repo.created_at,
		pushedAt: repo.pushed_at,
		latestRelease: release
			? { tag: release.tag_name, publishedAt: release.published_at, url: release.html_url }
			: null,
		npm: npm ? { version: npm.version, monthlyDownloads: downloads?.downloads ?? null } : null
	};
}

/**
 * A markdown file from the repository, rendered to HTML by GitHub itself — the same renderer,
 * and the same sanitiser, as the page on github.com. Returns null when GitHub is unreachable.
 *
 * `localLinks` maps repository paths to pages of this site, so a README link to
 * `docs/INSTALL.md` stays here instead of leaving for github.com.
 */
export async function renderedMarkdown(
	path: string,
	localLinks: Record<string, string> = {}
): Promise<string | null> {
	const url =
		path === 'README.md' ? `${API}/repos/${REPO}/readme` : `${API}/repos/${REPO}/contents/${path}`;
	const response = await request(url, githubHeaders('application/vnd.github.html+json'));
	if (!response) return null;
	return adaptGithubHtml(await response.text(), path, localLinks);
}

const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:|\/\/|#)/i;
/** A stand-in origin to let URL resolve `../` and `./` against the file's folder. */
const REPO_ROOT = 'https://repo.invalid/';

/**
 * GitHub's HTML is written for github.com: relative links resolve against the file's folder
 * there, heading ids carry a `user-content-` prefix that its own script strips, and the page
 * that embeds it already has an h1. Each of those is fixed here, on the string, because the
 * markup is GitHub's sanitised output, not arbitrary HTML.
 */
function adaptGithubHtml(html: string, path: string, localLinks: Record<string, string>): string {
	const base = new URL(path, REPO_ROOT);
	const absolute = (target: string, kind: 'blob' | 'raw') => {
		if (EXTERNAL.test(target)) return target;
		const resolved = new URL(target, base);
		const file = resolved.pathname.slice(1);
		const local = kind === 'blob' ? localLinks[file] : undefined;
		if (local) return `${local}${resolved.hash}`;
		return kind === 'raw'
			? `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${file}`
			: `https://github.com/${REPO}/blob/${BRANCH}/${file}${resolved.hash}`;
	};
	return (
		html
			.replace(/\ssrc="([^"]*)"/g, (_, target: string) => ` src="${absolute(target, 'raw')}"`)
			// An image wrapped in a link to itself: the link opens the raw file too.
			.replace(
				/<a([^>]*)\shref="([^"]*)"([^>]*)>(\s*<img)/g,
				(_, before: string, target: string, after: string, img: string) =>
					`<a${before} href="${absolute(target, 'raw')}"${after}>${img}`
			)
			.replace(/\shref="([^"]*)"/g, (_, target: string) => ` href="${absolute(target, 'blob')}"`)
			.replace(/\s(id|name)="user-content-/g, ' $1="')
			// One level down, so the document's own h1 stays the page's only one.
			.replace(
				/<(\/?)h([1-5])(?=[\s>])/g,
				(_, slash: string, level: string) => `<${slash}h${Number(level) + 1}`
			)
	);
}
