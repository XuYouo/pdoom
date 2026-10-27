import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const OWN_DIR = path.dirname(fileURLToPath(import.meta.url));

/** A require anchored where the plugin lives, so resolution follows its tree. */
function requireFrom(dir) {
  return createRequire(pathToFileURL(path.join(dir, "index.mjs")));
}

// Sibling tree first (a checkout). `opencode plugin add …::path:opencode` keeps
// only this subdirectory, though, so the published package — declared as a
// dependency — is the fallback that carries hooks/ and skills/.
async function loadShared(pluginDir = OWN_DIR) {
  const sibling = path.join(pluginDir, "..", "hooks", "shared.mjs");
  const target = existsSync(sibling)
    ? sibling
    : requireFrom(pluginDir).resolve("@pebbly/aseprite-ai-artist/hooks/shared.mjs");
  return import(pathToFileURL(target).href);
}

export function isPixelMutation(toolName) {
  return typeof toolName === "string" && /^aseprite(-ai-artist)?_(draw|recolor|transform)$/.test(toolName);
}

// Sibling tree first (a checkout); then the published package; otherwise null
// and setup stays alive with a warning.
export function resolveSkillsDir(pluginDir = OWN_DIR) {
  const sibling = path.join(pluginDir, "..", "skills");
  if (existsSync(path.join(sibling, "studio", "SKILL.md"))) return path.resolve(sibling);
  try {
    const pkg = requireFrom(pluginDir).resolve("@pebbly/aseprite-ai-artist/package.json");
    const bundled = path.join(path.dirname(pkg), "skills");
    if (existsSync(path.join(bundled, "studio", "SKILL.md"))) return bundled;
  } catch { /* not installed — the caller reports */ }
  return null;
}

export default {
  id: "aseprite",
  async setup(ctx) {
    let shared;
    try {
      shared = await loadShared();
    } catch {
      // A plugin load must not take the session down; the MCP tools and
      // resources work without us.
      process.stderr.write("[aseprite-ai-artist] shared code not found next to the plugin or in @pebbly/aseprite-ai-artist; /aseprite:* commands and skills are skipped. See docs/INSTALL.md.\n");
      return;
    }
    const skillsDir = resolveSkillsDir();
    if (!skillsDir) {
      process.stderr.write("[aseprite-ai-artist] skills not found next to the plugin; /aseprite:* commands and skills are skipped. See docs/INSTALL.md.\n");
      return;
    }
    const commands = shared.loadSkillCommands(skillsDir);
    const statusSent = new Set();
    // The one look-nudge per session, split across two hooks: `execute.after`
    // detects the pixel mutation, and `context` delivers the reminder into the
    // next model call's system prompt. See the note on the `context` hook below
    // for why delivery does not happen in `execute.after` itself.
    const nudged = new Set();
    const pendingNudge = new Set();

    await ctx.skill.transform((editor) => {
      for (const command of commands) {
        editor.add({
          id: command.skill,
          name: command.skill,
          description: command.description,
          path: path.join(skillsDir, command.skill, "SKILL.md"),
          content: command.body,
        });
      }
    });

    await ctx.command.transform((editor) => {
      for (const command of commands) {
        editor.add({
          name: command.name,
          description: command.description,
          execute: async ({ sessionID, prompt, delivery }) => {
            await ctx.session.prompt({ ...prompt, sessionID, text: shared.skillPrompt(command, prompt.text ?? ""), delivery });
          },
        });
      }
    });

    await ctx.session.hook("context", async (event) => {
      if (!statusSent.has(event.sessionID)) {
        statusSent.add(event.sessionID);
        event.system.push({ type: "text", text: await shared.bridgeStatusMessage() });
      }
      if (pendingNudge.has(event.sessionID)) {
        pendingNudge.delete(event.sessionID);
        nudged.add(event.sessionID);
        event.system.push({ type: "text", text: shared.LOOK_NUDGE });
      }
    });

    await ctx.tool.hook("execute.after", (event) => {
      // Delivery happens on the next `context` hook, not here. OpenCode hands a
      // tool result back to the model two ways: the direct tool-call path keeps
      // the `content` blocks, but Code Mode — the build agent's default — decodes
      // only the structured `output` and drops anything appended to `content`, so
      // mutating `event.result` here never reaches the model on that path. The
      // `context` hook is prepended to every model call on both paths, so it is
      // the one reliable channel.
      if (event.status !== "completed" || !isPixelMutation(event.tool)) return;
      if (nudged.has(event.sessionID) || pendingNudge.has(event.sessionID)) return;
      // A malformed result must not spend the session's one nudge.
      if (!Array.isArray(event.result?.content)) return;
      pendingNudge.add(event.sessionID);
    });
  },
};
