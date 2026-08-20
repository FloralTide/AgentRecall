import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listInstalledSkills } from "./skill-manager";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

describe("listInstalledSkills", () => {
  it("skips only root-level managed Skill backup directories", () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-recall-skill-scan-"));
    temporaryDirectories.push(homeDir);
    const codexHome = path.join(homeDir, ".codex");
    const skillsRoot = path.join(codexHome, "skills");
    const backupUuid = "123e4567-e89b-12d3-a456-426614174000";
    const nestedBackupUuid = "223e4567-e89b-12d3-a456-426614174000";

    writeSkill(
      path.join(skillsRoot, `.managed-skill.agent-recall-backup-${backupUuid}`),
      "Root backup",
    );
    writeSkill(
      path.join(skillsRoot, `.nested-backup.agent-recall-backup-${nestedBackupUuid}`, "child"),
      "Nested inside root backup",
    );
    writeSkill(path.join(skillsRoot, ".hidden-skill"), "Hidden Skill");
    writeSkill(
      path.join(skillsRoot, ".similar.agent-recall-backup-not-a-uuid"),
      "Similar non-backup Skill",
    );
    writeSkill(
      path.join(skillsRoot, "collection", `.nested.agent-recall-backup-${backupUuid}`),
      "Nested reserved-like Skill",
    );

    const snapshot = listInstalledSkills({
      homeDir,
      codexHome,
      projectDirs: [],
      claudePluginsDir: path.join(homeDir, ".claude", "plugins"),
    });

    expect(snapshot.skills.map((skill) => skill.name)).toEqual([
      "Hidden Skill",
      "Nested reserved-like Skill",
      "Similar non-backup Skill",
    ]);
    expect(snapshot.skills.some((skill) => skill.name === "Root backup")).toBe(false);
    expect(snapshot.skills.some((skill) => skill.name === "Nested inside root backup")).toBe(false);
    expect(snapshot.roots.find((root) => root.source === "codex-user")?.skillCount).toBe(3);
  });
});

function writeSkill(directoryPath: string, name: string): void {
  fs.mkdirSync(directoryPath, { recursive: true });
  fs.writeFileSync(
    path.join(directoryPath, "SKILL.md"),
    `---\nname: ${name}\ndescription: fixture\n---\n# ${name}\n`,
    "utf8",
  );
}
