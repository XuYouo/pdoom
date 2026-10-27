// Pass this file's text as workflow.script; use game-review.meta.json as meta.
const targets = args.targets;
if (!Array.isArray(targets) || !targets.length || targets.some(x => typeof x !== 'string')) {
  throw new Error('args.targets must be a nonempty array of workspace-relative paths.');
}
const roles = ['engine/API correctness', 'gameplay and input edge cases', 'asset loading and lifecycle', 'performance and frame-time risks'];
phase('Independent review');
const results = await pipeline(roles, async role => agent(
  `READ-ONLY game review. Scope: ${JSON.stringify(targets)}. Verified engine: ${args.engineVersion ?? 'unknown; inspect it'}. Focus: ${role}. Load router and only relevant skills. Do not modify files, run project scripts, install, publish, or touch live Aseprite. Inspect real code; cite file paths and lines. Separate verified defects from hypotheses.`,
  { label: role, schema: { type: 'object', properties: {
    findings: { type: 'array', items: { type: 'object', properties: {
      severity: { type: 'string', enum: ['high', 'medium', 'low'] },
      location: { type: 'string' }, evidence: { type: 'string' }, recommendation: { type: 'string' }
    }, required: ['severity', 'location', 'evidence', 'recommendation'], additionalProperties: false } },
    limits: { type: 'array', items: { type: 'string' } }
  }, required: ['findings', 'limits'], additionalProperties: false } }
));
phase('Consolidation');
const completed = results.filter(Boolean);
return { requested: roles.length, completed: completed.length, incomplete: completed.length !== roles.length, reviews: completed };
