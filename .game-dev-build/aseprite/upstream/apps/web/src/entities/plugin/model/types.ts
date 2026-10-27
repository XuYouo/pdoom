/** A workflow from the plugin's `skills/` folder, invoked as `/aseprite:<name>`. */
export interface Skill {
	name: string;
	title: string;
	description: string;
	/** Repository path of the SKILL.md: `skills/draw/SKILL.md`. */
	path: string;
	/** The SKILL.md on GitHub. */
	url: string;
}

/** A subagent from the plugin's `agents/` folder. */
export interface Agent {
	name: string;
	description: string;
	/** Repository path: `agents/pixel-critic.md`. */
	path: string;
	url: string;
}
