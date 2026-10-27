import type { ArticleHeading, KnowledgeSection } from '#entities/knowledge/index.js';

export interface KnowledgeLink {
	href: string;
	label: string;
	/** What precedes the label in a list: a rule's number. */
	marker?: string;
}

export interface KnowledgeNavGroup {
	title: string;
	links: KnowledgeLink[];
}

export interface KnowledgeArticlePageData {
	section: KnowledgeSection;
	/** "Rules", "Skills" or "Agents", for the breadcrumb. */
	sectionTitle: string;
	slug: string;
	title: string;
	/** How an agent addresses the document: `rules://12-anti-aliasing`, `/aseprite:draw`. */
	address: string;
	/** The opening paragraph, rendered. */
	lead: string;
	/** The same, as plain text, for search and share previews. */
	description: string;
	html: string;
	headings: ArticleHeading[];
	templates: number;
	/** Repository path: `rules/12-anti-aliasing.md`. */
	sourcePath: string;
	sourceUrl: string;
	/** Every document, for the sidebar. */
	nav: KnowledgeNavGroup[];
	previous?: KnowledgeLink;
	next?: KnowledgeLink;
}
