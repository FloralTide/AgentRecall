import { describe, expect, it } from "vitest";

import { SKILL_INSTALL_TARGETS } from "../../core/agent-skill-registry";
import { parseIpcRequest } from "./contract";
import { SKILLS_IPC } from "./skills";

describe("Skills IPC contracts", () => {
  it("accepts every registered install target and defaults force targets for legacy callers", () => {
    for (const target of SKILL_INSTALL_TARGETS) {
      expect(parseIpcRequest(SKILLS_IPC.updateTargets, ["fixture-skill", [target]])).toEqual([
        "fixture-skill",
        [target],
        [],
      ]);
    }
  });

  it("accepts registered force targets including codex-shared and pi", () => {
    expect(parseIpcRequest(SKILLS_IPC.updateTargets, [
      "fixture-skill",
      ["codex-shared", "pi"],
      ["codex-shared", "pi"],
    ])).toEqual([
      "fixture-skill",
      ["codex-shared", "pi"],
      ["codex-shared", "pi"],
    ]);
  });

  it("rejects install targets that are not present in the registry", () => {
    expect(() => parseIpcRequest(SKILLS_IPC.updateTargets, [
      "fixture-skill",
      ["unsupported-agent"],
      [],
    ])).toThrow("Invalid input for IPC channel");
  });
});
