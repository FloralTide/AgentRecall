import * as path from "node:path";

import {
  AGENT_SKILL_REGISTRY,
  agentEntry,
  type SkillAgent,
  type SkillInstallTarget,
} from "./agent-skill-registry";

/** Node-only path helpers for the browser-safe Skill registry. */
export function agentSkillDir(id: SkillAgent, homeDir: string): string | null {
  const dir = agentEntry(id).skillDir;
  return dir ? path.join(homeDir, dir) : null;
}

export function agentInstallTargetDir(target: SkillInstallTarget, homeDir: string, codexHome?: string): string {
  if (target === "codex") return path.join(codexHome ?? path.join(homeDir, ".codex"), "skills");
  if (target === "codex-shared") return path.join(homeDir, ".agents", "skills");
  const entry = AGENT_SKILL_REGISTRY.find((candidate) => candidate.installTarget === target);
  if (!entry?.skillDir) throw new Error(`Unknown install target: ${target}`);
  return path.join(homeDir, entry.skillDir);
}
