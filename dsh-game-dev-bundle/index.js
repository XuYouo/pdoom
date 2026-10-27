// Read-only developer diagnostics; no tools, skills or services are registered globally.
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

export const name = 'game-dev-inspection';
export const inject = ['cordisInspect', 'agentPresets', 'skills', 'tools'];

export function apply(ctx) {
  const fallbackCwd = dirname(dirname(fileURLToPath(import.meta.url)));
  ctx.effect(() => ctx.cordisInspect.register({
    manifest: {
      id: 'GameDev',
      description: 'Read-only preset mount and game-development catalog isolation checks; never runs tools or changes sessions.',
      methods: [{
        name: 'status',
        description: 'Compare global and per-preset game skills/MCP visibility and report preset mount diagnostics.',
        inputSchema: {
          type: 'object',
          properties: {
            cwd: { type: 'string', description: 'Workspace whose ordinary skill roots should be inspected.' },
            includeCatalog: { type: 'boolean' },
            includeRows: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        outputSchema: { description: 'Read-only preset inventory and scoped catalog counts.' },
      }],
    },
    async query(method, input = {}) {
      if (method !== 'status') throw new Error(`Unknown GameDev method: ${method}`);
      const cwd = input.cwd ?? fallbackCwd;
      const summarize = async (scope) => {
        const snapshot = await ctx.skills.snapshot({ scope, cwd });
        const catalog = snapshot.skills;
        const owned = catalog.filter((skill) => skill.provider === 'game-dev');
        const names = ctx.tools.schemas(scope).map((tool) => tool.name).sort();
        return {
          catalogComplete: snapshot.complete,
          totalSkills: catalog.length,
          gameDevSkills: owned.length,
          ...(input.includeCatalog ? { gameDevSkillNames: owned.map((skill) => skill.name).sort() } : {}),
          hasWorkflow: names.includes('workflow'),
          hasSubagent: names.includes('subagent'),
          asepriteTools: names.filter((name) => name.startsWith('mcp__aseprite__')),
          resourceTools: names.filter((name) => ['list_mcp_resources', 'list_mcp_resource_templates', 'read_mcp_resource'].includes(name)),
        };
      };
      const inventory = await ctx.agentPresets.compositionInventory();
      const presets = [];
      for (const preset of inventory) {
        let view;
        if (!preset.broken) {
          const lease = await ctx.agentPresets.acquireScope(preset.id);
          try { view = await summarize(lease.key); }
          finally { await lease[Symbol.asyncDispose](); }
        }
        const { rows, ...identity } = preset;
        presets.push({
          ...identity,
          enabledPluginCount: rows.filter(row => row.enabled).length,
          pluginProblems: rows.filter(row => row.enabled && row.fiberState !== 2),
          ...(input.includeRows ? { rows } : {}),
          ...view,
        });
      }
      return { cwd, global: await summarize(undefined), presets };
    },
  }), 'game-dev read-only inspection');
}
