import mutableFs, * as fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
  AGENT_RECALL_BUILTIN_SKILLS,
  ManagedSkillLibrary,
  type SkillInstallTarget,
} from "./managed-skill-library";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function createManagedSkillFixture() {
  const fixtureRoot = fs.mkdtempSync(path.join(tmpdir(), "agent-recall-managed-skill-"));
  temporaryDirectories.push(fixtureRoot);
  const homeDir = path.join(fixtureRoot, "home");
  const library = new ManagedSkillLibrary({
    libraryRoot: path.join(fixtureRoot, "library"),
    homeDir,
  });
  const imported = library.importFiles({
    suggestedId: "fixture-skill",
    origin: { kind: "local", label: "Test fixture" },
    files: [{ relativePath: "SKILL.md", contents: "# Fixture Skill\n" }],
  });
  return {
    fixtureRoot,
    homeDir,
    library,
    managedId: imported.managedId,
    managedSkillPath: imported.skill.directoryPath,
  };
}

function replaceSymlinkSync(replacement: typeof fs.symlinkSync): () => void {
  const original = mutableFs.symlinkSync;
  mutableFs.symlinkSync = replacement;
  syncBuiltinESMExports();
  return () => {
    mutableFs.symlinkSync = original;
    syncBuiltinESMExports();
  };
}

function replaceRmSync(replacement: typeof fs.rmSync): () => void {
  const original = mutableFs.rmSync;
  mutableFs.rmSync = replacement;
  syncBuiltinESMExports();
  return () => {
    mutableFs.rmSync = original;
    syncBuiltinESMExports();
  };
}

function replaceRenameSync(replacement: typeof fs.renameSync): () => void {
  const original = mutableFs.renameSync;
  mutableFs.renameSync = replacement;
  syncBuiltinESMExports();
  return () => {
    mutableFs.renameSync = original;
    syncBuiltinESMExports();
  };
}

describe("AgentRecall bundled Skills", () => {
  it("ships aihot as an official built-in Skill", () => {
    expect(AGENT_RECALL_BUILTIN_SKILLS).toContainEqual({
      id: "aihot",
      installId: "aihot",
      sourceUrl: "https://github.com/KKKKhazix/khazix-skills/tree/main/aihot",
    });
    expect(
      fs.existsSync(fileURLToPath(new URL("../../assets/bundled-skills/aihot/SKILL.md", import.meta.url))),
    ).toBe(true);
  });

  it("ships resume-optimization as an official built-in Skill", () => {
    expect(AGENT_RECALL_BUILTIN_SKILLS).toContainEqual({
      id: "resume-optimization",
      installId: "resume-optimization",
      sourceUrl: "https://github.com/melodic-software/claude-code-plugins/tree/main/plugins/soft-skills/skills/resume-optimization",
    });
    const bundledSkillUrl = new URL("../../assets/bundled-skills/resume-optimization/", import.meta.url);
    expect(fs.existsSync(fileURLToPath(new URL("SKILL.md", bundledSkillUrl)))).toBe(true);
    expect(fs.existsSync(fileURLToPath(new URL("SKILL.zh.md", bundledSkillUrl)))).toBe(true);
    expect(fs.existsSync(fileURLToPath(new URL("metadata.json", bundledSkillUrl)))).toBe(true);
    expect(fs.existsSync(fileURLToPath(new URL("LICENSE", bundledSkillUrl)))).toBe(true);
  });

  it("imports aihot into a fresh managed library with built-in origin metadata", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(tmpdir(), "agent-recall-builtin-skill-"));
    temporaryDirectories.push(fixtureRoot);
    const library = new ManagedSkillLibrary({
      libraryRoot: path.join(fixtureRoot, "skills"),
      homeDir: path.join(fixtureRoot, "home"),
    });
    const bundledRoot = fileURLToPath(new URL("../../assets/bundled-skills", import.meta.url));

    library.ensureBuiltinSkills(bundledRoot);

    expect(library.list().skills.find((skill) => skill.managedId === "aihot")?.origin).toEqual({
      kind: "builtin",
      label: "AgentRecall",
      url: "https://github.com/KKKKhazix/khazix-skills/tree/main/aihot",
    });
    expect(library.list().skills.find((skill) => skill.managedId === "resume-optimization")?.origin).toEqual({
      kind: "builtin",
      label: "AgentRecall",
      url: "https://github.com/melodic-software/claude-code-plugins/tree/main/plugins/soft-skills/skills/resume-optimization",
    });
  });

  it("installs a managed Skill into the shared Codex agents directory", () => {
    const fixtureRoot = fs.mkdtempSync(path.join(tmpdir(), "agent-recall-shared-skill-"));
    temporaryDirectories.push(fixtureRoot);
    const homeDir = path.join(fixtureRoot, "home");
    const library = new ManagedSkillLibrary({
      libraryRoot: path.join(fixtureRoot, "skills"),
      homeDir,
    });
    const bundledRoot = fileURLToPath(new URL("../../assets/bundled-skills", import.meta.url));

    library.ensureBuiltinSkills(bundledRoot);
    const updated = library.updateTargets("grill-me", ["codex-shared"]);
    const installation = updated.installations.find((item) => item.target === "codex-shared");

    expect(installation?.state).toBe("installed");
    expect(installation?.path).toBe(path.join(homeDir, ".agents", "skills", "grill-me"));
  });
});

describe("ManagedSkillLibrary conflicting installation targets", () => {
  it("force replaces a real directory conflict with the managed Skill link", () => {
    const fixture = createManagedSkillFixture();
    const targetPath = path.join(fixture.homeDir, ".codex", "skills", fixture.managedId);
    fs.mkdirSync(targetPath, { recursive: true });
    fs.writeFileSync(path.join(targetPath, "local-only.txt"), "keep unless forced");

    const updated = fixture.library.updateTargets(
      fixture.managedId,
      ["codex"],
      ["codex"],
    );

    expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(targetPath)).toBe(fs.realpathSync(fixture.managedSkillPath));
    expect(fs.existsSync(path.join(targetPath, "local-only.txt"))).toBe(false);
    expect(updated.installations.find((item) => item.target === "codex")?.state).toBe("installed");
  });

  it("rejects a target whose linked parent resolves into the managed library", () => {
    const fixture = createManagedSkillFixture();
    const libraryRoot = path.dirname(fixture.managedSkillPath);
    const skillsParent = path.join(fixture.homeDir, ".codex", "skills");
    const libraryEntriesBefore = fs.readdirSync(libraryRoot).sort();
    fs.mkdirSync(path.dirname(skillsParent), { recursive: true });
    fs.symlinkSync(
      libraryRoot,
      skillsParent,
      process.platform === "win32" ? "junction" : "dir",
    );

    expect(() => fixture.library.updateTargets(
      fixture.managedId,
      ["codex"],
      ["codex"],
    )).toThrow("overlapping managed Skill target");

    expect(fs.lstatSync(skillsParent).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(fixture.managedSkillPath).isDirectory()).toBe(true);
    expect(fs.lstatSync(fixture.managedSkillPath).isSymbolicLink()).toBe(false);
    expect(fs.readFileSync(path.join(fixture.managedSkillPath, "SKILL.md"), "utf8"))
      .toBe("# Fixture Skill\n");
    expect(fs.readdirSync(libraryRoot).sort()).toEqual(libraryEntriesBefore);
    expect(fs.readdirSync(libraryRoot).some((entry) =>
      entry.includes(".agent-recall-backup-"))).toBe(false);
  });

  it("installs a normal target and force replaces a conflicting target in one update", () => {
    const fixture = createManagedSkillFixture();
    const codexTargetPath = path.join(fixture.homeDir, ".codex", "skills", fixture.managedId);
    const claudeTargetPath = path.join(fixture.homeDir, ".claude", "skills", fixture.managedId);
    fs.mkdirSync(path.dirname(codexTargetPath), { recursive: true });
    fs.writeFileSync(codexTargetPath, "conflicting file");

    const updated = fixture.library.updateTargets(
      fixture.managedId,
      ["codex", "claude"],
      ["codex"],
    );

    expect(fs.lstatSync(codexTargetPath).isSymbolicLink()).toBe(true);
    expect(fs.lstatSync(claudeTargetPath).isSymbolicLink()).toBe(true);
    expect(updated.installations.find((item) => item.target === "codex")?.state).toBe("installed");
    expect(updated.installations.find((item) => item.target === "claude")?.state).toBe("installed");
  });

  it.each(["wrong", "dangling"] as const)(
    "force replaces a %s symlink conflict",
    (kind) => {
      const fixture = createManagedSkillFixture();
      const targetPath = path.join(fixture.homeDir, ".codex", "skills", fixture.managedId);
      const otherDirectory = path.join(fixture.fixtureRoot, "other-skill");
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.mkdirSync(otherDirectory, { recursive: true });
      fs.symlinkSync(
        otherDirectory,
        targetPath,
        process.platform === "win32" ? "junction" : "dir",
      );
      if (kind === "dangling") fs.rmSync(otherDirectory, { recursive: true });

      fixture.library.updateTargets(fixture.managedId, ["codex"], ["codex"]);

      expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(true);
      expect(fs.realpathSync(targetPath)).toBe(fs.realpathSync(fixture.managedSkillPath));
    },
  );

  it("rejects an unforced conflict without changing it or other selected targets", () => {
    const fixture = createManagedSkillFixture();
    const codexTargetPath = path.join(fixture.homeDir, ".codex", "skills", fixture.managedId);
    const claudeTargetPath = path.join(fixture.homeDir, ".claude", "skills", fixture.managedId);
    fs.mkdirSync(codexTargetPath, { recursive: true });
    fs.writeFileSync(path.join(codexTargetPath, "local-only.txt"), "untouched");

    expect(() => fixture.library.updateTargets(
      fixture.managedId,
      ["codex", "claude"],
    )).toThrow("requires explicit force installation");

    expect(fs.lstatSync(codexTargetPath).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(codexTargetPath, "local-only.txt"), "utf8")).toBe("untouched");
    expect(fs.existsSync(claudeTargetPath)).toBe(false);
  });

  it("rejects forced targets that are unknown or not selected", () => {
    const fixture = createManagedSkillFixture();
    const claudeTargetPath = path.join(fixture.homeDir, ".claude", "skills", fixture.managedId);

    expect(() => fixture.library.updateTargets(
      fixture.managedId,
      ["claude"],
      ["codex"],
    )).toThrow("must also be selected");
    expect(() => fixture.library.updateTargets(
      fixture.managedId,
      ["claude"],
      ["unknown" as SkillInstallTarget],
    )).toThrow("Unknown Skill installation target");
    expect(fs.existsSync(claudeTargetPath)).toBe(false);
  });

  it("restores the original conflict when managed link creation fails", () => {
    const fixture = createManagedSkillFixture();
    const targetPath = path.join(fixture.homeDir, ".codex", "skills", fixture.managedId);
    fs.mkdirSync(targetPath, { recursive: true });
    fs.writeFileSync(path.join(targetPath, "local-only.txt"), "restore me");
    const restoreSymlinkSync = replaceSymlinkSync(() => {
      throw new Error("simulated symlink failure");
    });

    try {
      expect(() => fixture.library.updateTargets(
        fixture.managedId,
        ["codex"],
        ["codex"],
      )).toThrow("simulated symlink failure");
    } finally {
      restoreSymlinkSync();
    }

    expect(fs.lstatSync(targetPath).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(targetPath, "local-only.txt"), "utf8")).toBe("restore me");
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual([fixture.managedId]);
    expect(
      fixture.library.list().skills[0].installations.find((item) => item.target === "codex")?.state,
    ).toBe("conflict");
  });

  it("rolls back a normal install when a later forced target fails", () => {
    const fixture = createManagedSkillFixture();
    const codexTargetPath = path.join(fixture.homeDir, ".codex", "skills", fixture.managedId);
    const claudeTargetPath = path.join(fixture.homeDir, ".claude", "skills", fixture.managedId);
    fs.mkdirSync(claudeTargetPath, { recursive: true });
    fs.writeFileSync(path.join(claudeTargetPath, "local-only.txt"), "restore mixed conflict");
    const originalSymlinkSync = mutableFs.symlinkSync;
    let symlinkCalls = 0;
    const restoreSymlinkSync = replaceSymlinkSync((target, linkPath, type) => {
      symlinkCalls += 1;
      if (symlinkCalls === 2) throw new Error("simulated second symlink failure");
      originalSymlinkSync(target, linkPath, type);
    });

    try {
      expect(() => fixture.library.updateTargets(
        fixture.managedId,
        ["codex", "claude"],
        ["claude"],
      )).toThrow("simulated second symlink failure");
    } finally {
      restoreSymlinkSync();
    }

    expect(fs.existsSync(codexTargetPath)).toBe(false);
    expect(fs.lstatSync(claudeTargetPath).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(claudeTargetPath, "local-only.txt"), "utf8"))
      .toBe("restore mixed conflict");
  });

  it("restores every conflict when the second forced target fails", () => {
    const fixture = createManagedSkillFixture();
    const codexTargetPath = path.join(fixture.homeDir, ".codex", "skills", fixture.managedId);
    const claudeTargetPath = path.join(fixture.homeDir, ".claude", "skills", fixture.managedId);
    fs.mkdirSync(codexTargetPath, { recursive: true });
    fs.mkdirSync(claudeTargetPath, { recursive: true });
    fs.writeFileSync(path.join(codexTargetPath, "local-only.txt"), "restore codex");
    fs.writeFileSync(path.join(claudeTargetPath, "local-only.txt"), "restore claude");
    const originalSymlinkSync = mutableFs.symlinkSync;
    let symlinkCalls = 0;
    const restoreSymlinkSync = replaceSymlinkSync((target, linkPath, type) => {
      symlinkCalls += 1;
      if (symlinkCalls === 2) throw new Error("simulated second force failure");
      originalSymlinkSync(target, linkPath, type);
    });

    try {
      expect(() => fixture.library.updateTargets(
        fixture.managedId,
        ["codex", "claude"],
        ["codex", "claude"],
      )).toThrow("simulated second force failure");
    } finally {
      restoreSymlinkSync();
    }

    expect(fs.lstatSync(codexTargetPath).isDirectory()).toBe(true);
    expect(fs.lstatSync(claudeTargetPath).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(codexTargetPath, "local-only.txt"), "utf8")).toBe("restore codex");
    expect(fs.readFileSync(path.join(claudeTargetPath, "local-only.txt"), "utf8")).toBe("restore claude");
  });

  it("restores an owned link staged for removal when a later install fails", () => {
    const fixture = createManagedSkillFixture();
    const codexTargetPath = path.join(fixture.homeDir, ".codex", "skills", fixture.managedId);
    const claudeTargetPath = path.join(fixture.homeDir, ".claude", "skills", fixture.managedId);
    fixture.library.updateTargets(fixture.managedId, ["codex"]);
    const restoreSymlinkSync = replaceSymlinkSync(() => {
      throw new Error("simulated replacement install failure");
    });

    try {
      expect(() => fixture.library.updateTargets(
        fixture.managedId,
        ["claude"],
      )).toThrow("simulated replacement install failure");
    } finally {
      restoreSymlinkSync();
    }

    expect(fs.lstatSync(codexTargetPath).isSymbolicLink()).toBe(true);
    expect(fs.realpathSync(codexTargetPath)).toBe(fs.realpathSync(fixture.managedSkillPath));
    expect(fs.existsSync(claudeTargetPath)).toBe(false);
  });

  it("preserves a path that replaces an owned link immediately before removal staging", () => {
    const fixture = createManagedSkillFixture();
    const targetPath = path.join(fixture.homeDir, ".codex", "skills", fixture.managedId);
    fixture.library.updateTargets(fixture.managedId, ["codex"]);
    const originalRenameSync = mutableFs.renameSync;
    let simulatedRace = false;
    const restoreRenameSync = replaceRenameSync((oldPath, newPath) => {
      if (!simulatedRace && String(oldPath) === targetPath) {
        simulatedRace = true;
        mutableFs.unlinkSync(targetPath);
        mutableFs.mkdirSync(targetPath);
        mutableFs.writeFileSync(path.join(targetPath, "external.txt"), "appeared during update");
      }
      originalRenameSync(oldPath, newPath);
    });

    try {
      expect(() => fixture.library.updateTargets(fixture.managedId, []))
        .toThrow("changed during the update");
    } finally {
      restoreRenameSync();
    }

    expect(fs.lstatSync(targetPath).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(targetPath, "external.txt"), "utf8")).toBe("appeared during update");
    expect(fs.readdirSync(path.dirname(targetPath))).toEqual([fixture.managedId]);
  });

  it("keeps the committed target state when hidden backup cleanup fails", () => {
    const fixture = createManagedSkillFixture();
    const targetPath = path.join(fixture.homeDir, ".codex", "skills", fixture.managedId);
    fs.mkdirSync(targetPath, { recursive: true });
    fs.writeFileSync(path.join(targetPath, "local-only.txt"), "cleanup failure fixture");
    const originalRmSync = mutableFs.rmSync;
    const restoreRmSync = replaceRmSync((rmPath, options) => {
      if (String(rmPath).includes(".agent-recall-backup-")) {
        throw new Error("simulated backup cleanup failure");
      }
      originalRmSync(rmPath, options);
    });

    let updated;
    try {
      updated = fixture.library.updateTargets(fixture.managedId, ["codex"], ["codex"]);
    } finally {
      restoreRmSync();
    }

    expect(updated.installations.find((item) => item.target === "codex")?.state).toBe("installed");
    expect(fs.lstatSync(targetPath).isSymbolicLink()).toBe(true);
    expect(fs.readdirSync(path.dirname(targetPath)).some((entry) =>
      entry.includes(".agent-recall-backup-"))).toBe(true);
  });
});
