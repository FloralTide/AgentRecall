// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { InstalledSkill } from "../../../../core/skill-manager";
import { useSkillsController } from "./use-skills-controller";

describe("useSkillsController deletion feedback", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    Reflect.deleteProperty(window, "sessionSearch");
    vi.restoreAllMocks();
  });

  it("keeps the retained backup path visible when the post-delete refresh fails", async () => {
    const retainedBackupPath = "/tmp/.fixture.agent-recall-delete-backup";
    const deleteSkill = vi.fn(async () => ({
      deletedPath: "/library/fixture-skill",
      skillName: "Fixture Skill",
      retainedBackupPaths: [retainedBackupPath],
    }));
    const listSkills = vi.fn(async () => {
      throw new Error("simulated refresh failure");
    });
    const getSkillSyncSnapshot = vi.fn(async () => ({
      status: { kind: "unconfigured" as const, setupSql: "", remediation: "settings" as const, message: "" },
      remoteSkillGroups: [],
      bindings: [],
      scannedAt: 0,
    }));
    Object.defineProperty(window, "sessionSearch", {
      configurable: true,
      value: { deleteSkill, listSkills, getSkillSyncSnapshot },
    });

    let controller!: ReturnType<typeof useSkillsController>;
    function Harness() {
      controller = useSkillsController("en");
      return null;
    }

    await act(async () => root.render(createElement(Harness)));
    await act(async () => controller.deleteSkill(fixtureSkill()));

    expect(deleteSkill).toHaveBeenCalledWith("/library/fixture-skill/SKILL.md");
    expect(controller.loading).toBe(false);
    expect(controller.feedback?.kind).toBe("warning");
    expect(controller.feedback?.message).toContain(retainedBackupPath);
    expect(controller.feedback?.message).toContain("simulated refresh failure");
  });
});

function fixtureSkill(): InstalledSkill {
  return {
    id: "agent-recall-v2:fixture-skill",
    name: "Fixture Skill",
    description: "Fixture",
    agent: "codex",
    source: "agent-recall-v2",
    path: "/library/fixture-skill/SKILL.md",
    directoryPath: "/library/fixture-skill",
    rootPath: "/library",
    markdown: "# Fixture Skill\n",
    mtimeMs: 0,
  };
}
