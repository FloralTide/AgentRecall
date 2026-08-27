import { describe, expect, it } from "vitest";
import type { SessionSearchResult } from "./types";
import {
  defaultSettings,
  getRemoteMigrationCliVersionCommand,
  getResumeCommand,
  mergeAppSettings,
  openNativeApp,
} from "./platform";

describe("app settings", () => {
  it("loads NVM before probing a migration CLI over SSH", () => {
    expect(getRemoteMigrationCliVersionCommand("codex", ["--version"])).toBe(
      'bash -lc \'if [ -s "$HOME/.nvm/nvm.sh" ]; then . "$HOME/.nvm/nvm.sh"; fi; codex --version\'',
    );
  });

  it("keeps WorkBuddy indexing opt-in while accepting an explicit enable", () => {
    expect(defaultSettings.includeWorkBuddy).toBe(false);
    expect(mergeAppSettings(defaultSettings, { includeWorkBuddy: true }).includeWorkBuddy).toBe(true);
  });

  it("keeps StepCode opt-in and resumes Codex and Claude sessions through the StepCode wrapper", () => {
    expect(defaultSettings.includeStepcode).toBe(false);
    const session = {
      source: "stepcode-codex",
      rawId: "native-codex-session",
      projectPath: "/repo",
      environmentId: "local",
      environmentKind: "local",
    } as SessionSearchResult;

    expect(getResumeCommand(session, {
      ...defaultSettings,
      includeStepcode: true,
      stepcodeBinary: "/opt/stepcode",
    }, { platform: "darwin" })).toBe(
      "cd /repo && /opt/stepcode codex resume native-codex-session",
    );

    expect(getResumeCommand({
      ...session,
      source: "stepcode-claude",
      rawId: "native-claude-session",
    }, {
      ...defaultSettings,
      includeStepcode: true,
      stepcodeBinary: "/opt/stepcode",
    }, { platform: "darwin" })).toBe(
      "cd /repo && /opt/stepcode claude --resume native-claude-session",
    );
  });

  it("resumes Qoder CLI sessions with the qoder binary while leaving IDE tasks alone", () => {
    const session = {
      source: "qoder-cli",
      rawId: "5a5f525e-99bc-4c95-9f03-de30ef8c9a32",
      projectPath: "/repo",
      environmentId: "local",
      environmentKind: "local",
    } as SessionSearchResult;

    expect(getResumeCommand(session, defaultSettings, { platform: "darwin" })).toBe(
      "cd /repo && qoder --resume 5a5f525e-99bc-4c95-9f03-de30ef8c9a32",
    );
    // Qoder IDE ids are `<slug>/<taskId>` pairs the CLI cannot take.
    expect(() => getResumeCommand({ ...session, source: "qoder", rawId: "demo-app-1a2b/task-fe3" }, defaultSettings, {
      platform: "darwin",
    })).toThrow("Resume is not supported for Qoder sessions yet.");
  });

  it("opens the Qoder desktop app only for Qoder IDE sessions", async () => {
    const launched: string[][] = [];
    const runProcess = async (file: string, args: string[]) => {
      launched.push([file, ...args]);
    };

    await openNativeApp({ source: "qoder", rawId: "demo-app-1a2b/task-fe3" }, { platform: "darwin", runProcess });
    expect(launched).toEqual([["/usr/bin/open", "-a", "Qoder"]]);

    await expect(
      openNativeApp({ source: "qoder-cli", rawId: "5a5f525e-99bc-4c95-9f03-de30ef8c9a32" }, { platform: "darwin", runProcess }),
    ).rejects.toThrow("Native app opening is not configured for Qoder CLI sessions yet.");
  });

  it("starts every summary source on the machine's own config directory", () => {
    expect(defaultSettings.summarySource).toBe("codex");
    expect(defaultSettings.summaryCodexConfigDir).toBe("");
    expect(defaultSettings.summaryClaudeConfigDir).toBe("");
    expect(defaultSettings.summaryCodexModel).toBe("");
    expect(defaultSettings.summaryClaudeModel).toBe("");
  });

  it("keeps the Codex and Claude summary directories independent of each other", () => {
    const merged = mergeAppSettings(defaultSettings, { summaryClaudeConfigDir: "~/alt-claude" });
    expect(merged.summaryClaudeConfigDir).toBe("~/alt-claude");
    // Pointing the Claude source somewhere must not drag the Codex source along with it, or the
    // two sources stop being independent the moment the user switches between them.
    expect(merged.summaryCodexConfigDir).toBe("");
    expect(merged.apiConfig.customConfigDir).toBe(defaultSettings.apiConfig.customConfigDir);
    expect(merged.claudeApiConfig.customConfigDir).toBe(defaultSettings.claudeApiConfig.customConfigDir);
  });

  it("keeps an unrecognized reasoning effort out of the summary request", () => {
    expect(mergeAppSettings(defaultSettings, { summaryReasoningEffort: "high" }).summaryReasoningEffort)
      .toBe("high");
    // "" is the real "let the model decide" choice, so anything unknown has to land there rather
    // than on an arbitrary level the upstream may reject.
    expect(mergeAppSettings(defaultSettings, { summaryReasoningEffort: "" }).summaryReasoningEffort).toBe("");
    expect(
      mergeAppSettings(defaultSettings, { summaryReasoningEffort: "turbo" as never }).summaryReasoningEffort,
    ).toBe("");
  });

  it("adopts the OpenViking effort once so an existing install keeps the level it had", () => {
    const legacy = { ...defaultSettings, openVikingExtractionReasoningEffort: "ultra" as const };
    delete (legacy as Partial<typeof legacy>).summaryReasoningEffort;

    const merged = mergeAppSettings(legacy as typeof defaultSettings, {});

    expect(merged.summaryReasoningEffort).toBe("ultra");
    // Seeding is one-way: the two settings are separate features and must not track each other
    // afterwards, or changing the memory-extraction effort would silently rewrite summaries.
    expect(
      mergeAppSettings(merged, { openVikingExtractionReasoningEffort: "low" }).summaryReasoningEffort,
    ).toBe("ultra");
  });

  it("trims the summary directories so a stray space is not read as a custom path", () => {
    const merged = mergeAppSettings(defaultSettings, {
      summaryCodexConfigDir: "  ",
      summaryClaudeModel: "  claude-opus-4-8  ",
    });
    expect(merged.summaryCodexConfigDir).toBe("");
    expect(merged.summaryClaudeModel).toBe("claude-opus-4-8");
  });
});
