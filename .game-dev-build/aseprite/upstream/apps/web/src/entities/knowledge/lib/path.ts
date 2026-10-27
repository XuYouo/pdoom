/** The three kinds of document the knowledge base has a page for, by their URL segment. */
export type KnowledgeSection = 'rules' | 'skills' | 'agents';

export const KNOWLEDGE_SECTIONS: readonly KnowledgeSection[] = ['rules', 'skills', 'agents'];

/** A document's page: `/knowledge/rules/12-anti-aliasing`, `/knowledge/skills/draw`. */
export const knowledgePath = (section: KnowledgeSection, slug: string) =>
	`/knowledge/${section}/${slug}`;
