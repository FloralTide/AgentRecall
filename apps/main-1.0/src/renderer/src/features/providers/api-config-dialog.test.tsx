// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defaultSettings } from "../../../../core/platform";
import { ApiConfigDialog } from "./api-config-dialog";

/**
 * The eight rows the AI-summary pane promises, in order. Every source must render all eight in
 * exactly this sequence — that is the machine-checkable form of "the three sources look the same".
 */
const SUMMARY_ROWS = [
  "route-config",
  "config-dir",
  "base-url",
  "model",
  "api-key",
  "api-format",
  "reasoning-effort",
  "status",
];

function codexSnapshot() {
  return {
    codexHome: "/tmp/codex",
    configPath: "/tmp/codex/config.toml",
    exists: true,
    activeProviderId: "openai",
    activeModel: "gpt-5.6-sol",
    activeProvider: { id: "openai", name: "OpenAI", baseUrl: "https://api.openai.com/v1", wireApi: "responses" },
    providers: [],
    credentialSource: "auth.json",
    hasApiKey: true,
  };
}

function claudeSnapshot() {
  return {
    claudeHome: "/tmp/claude",
    settingsPath: "/tmp/claude/settings.json",
    exists: true,
    route: { customBaseUrl: "https://api.anthropic.com", customApiFormat: "anthropic" as const },
    credentialSource: "settings.json",
    hasApiKey: true,
  };
}

describe("AI summary source pane", () => {
  let container: HTMLDivElement;
  let root: Root;
  let testProviderConnection: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
    testProviderConnection = vi.fn(async () => ({ elapsedMs: 1, credentialSource: "runtime" }));
    Object.defineProperty(window, "sessionSearch", {
      configurable: true,
      value: {
        getApiProviderKey: vi.fn(async () => ""),
        getCodexConfig: vi.fn(async () => codexSnapshot()),
        getClaudeConfig: vi.fn(async () => claudeSnapshot()),
        pickConfigDirectory: vi.fn(async () => ""),
        probeCodexModels: vi.fn(async () => ({ models: [], endpoint: "", endpoints: [], credentialSource: "" })),
        probeClaudeModels: vi.fn(async () => ({ models: [], endpoint: "", endpoints: [], credentialSource: "" })),
        testProviderConnection,
        testSummaryProviderConnection: vi.fn(async () => ({ elapsedMs: 1, credentialSource: "" })),
      },
    });
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    container.remove();
    vi.restoreAllMocks();
  });

  async function mountDialog(settings = structuredClone(defaultSettings)): Promise<void> {
    await act(async () => root.render(createElement(ApiConfigDialog, {
      settings,
      language: "en" as const,
      feedback: null,
      onSettingsChange: vi.fn(),
      onApplyToCodex: vi.fn(),
      onApplyToClaude: vi.fn(),
      onClose: vi.fn(),
    })));
  }

  async function selectTarget(label: string): Promise<void> {
    const target = [...container.querySelectorAll<HTMLButtonElement>(".api-target-tabs button")]
      .find((button) => button.textContent?.includes(label));
    if (!target) throw new Error(`${label} tab not rendered`);
    await act(async () => target.click());
  }

  async function mountSummaryPane(): Promise<void> {
    await mountDialog();
    const summaryTab = [...container.querySelectorAll<HTMLButtonElement>(".api-target-tabs button")]
      .find((button) => button.textContent?.includes("AI Summary"));
    if (!summaryTab) throw new Error("AI summary tab not rendered");
    await act(async () => summaryTab.click());
  }

  async function selectSource(label: string): Promise<void> {
    const button = [...container.querySelectorAll<HTMLButtonElement>(".summary-provider-switch button")]
      .find((candidate) => candidate.querySelector("strong")?.textContent === label);
    if (!button) throw new Error(`summary source "${label}" not rendered`);
    await act(async () => button.click());
  }

  /**
   * React installs its own `value` setter to track changes, so assigning `input.value` directly
   * makes it treat the following event as a no-op. Going through the prototype setter is what
   * makes the typed value reach the component.
   */
  async function typeInto(input: HTMLInputElement, value: string): Promise<void> {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    setter?.call(input, value);
    await act(async () => {
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  function renderedRows(): string[] {
    return [...container.querySelectorAll("[data-summary-row]")]
      .map((element) => element.getAttribute("data-summary-row") ?? "");
  }

  it("tests the official Codex and Claude runtimes with independent status", async () => {
    await mountDialog();

    const codexTest = container.querySelector<HTMLButtonElement>('[data-provider-connection-test="codex"]');
    expect(codexTest).toBeTruthy();
    testProviderConnection.mockResolvedValueOnce({ elapsedMs: 17, credentialSource: "Codex CLI" });
    await act(async () => codexTest!.click());
    expect(testProviderConnection).toHaveBeenLastCalledWith({
      target: "codex",
      apiConfig: defaultSettings.apiConfig,
    });
    expect(container.textContent).toContain("Codex connection succeeded in 17 ms using Codex CLI.");

    await selectTarget("Claude Code");
    const claudeTest = container.querySelector<HTMLButtonElement>('[data-provider-connection-test="claude"]');
    expect(claudeTest).toBeTruthy();
    testProviderConnection.mockRejectedValueOnce(new Error("Claude CLI is not installed."));
    await act(async () => claudeTest!.click());
    expect(testProviderConnection).toHaveBeenLastCalledWith({
      target: "claude",
      apiConfig: defaultSettings.claudeApiConfig,
    });
    expect(container.textContent).toContain("Claude CLI is not installed.");

    await selectTarget("Codex");
    expect(container.textContent).toContain("Codex connection succeeded in 17 ms using Codex CLI.");
  });

  it("keeps connection testing available for custom Codex and Claude drafts", async () => {
    await mountDialog();

    const codexPreset = [...container.querySelectorAll<HTMLButtonElement>(".codex-provider-switch button")]
      .find((button) => button.querySelector("strong")?.textContent === "DeepSeek");
    if (!codexPreset) throw new Error("Codex DeepSeek preset not rendered");
    await act(async () => {
      codexPreset.click();
      await Promise.resolve();
    });
    const codexTest = container.querySelector<HTMLButtonElement>('[data-provider-connection-test="codex"]');
    await act(async () => codexTest!.click());
    expect(testProviderConnection).toHaveBeenLastCalledWith({
      target: "codex",
      apiConfig: expect.objectContaining({
        activeProvider: "custom",
        customProviderId: "deepseek",
        customBaseUrl: "https://api.deepseek.com",
      }),
    });

    await selectTarget("Claude Code");
    const claudePreset = [...container.querySelectorAll<HTMLButtonElement>(".api-provider-switch--compact button")]
      .find((button) => button.querySelector("strong")?.textContent === "DeepSeek");
    if (!claudePreset) throw new Error("Claude DeepSeek preset not rendered");
    await act(async () => {
      claudePreset.click();
      await Promise.resolve();
    });
    const claudeTest = container.querySelector<HTMLButtonElement>('[data-provider-connection-test="claude"]');
    await act(async () => claudeTest!.click());
    expect(testProviderConnection).toHaveBeenLastCalledWith({
      target: "claude",
      apiConfig: expect.objectContaining({
        activeProvider: "custom",
        customProviderId: "deepseek",
        customBaseUrl: "https://api.deepseek.com/anthropic",
      }),
    });
  });

  it("discards a connection result when the tested draft changes", async () => {
    let resolveConnection: ((result: { elapsedMs: number; credentialSource: string }) => void) | undefined;
    testProviderConnection.mockImplementationOnce(() => new Promise((resolve) => {
      resolveConnection = resolve;
    }));
    const settings = structuredClone(defaultSettings);
    settings.claudeApiConfig = {
      ...settings.claudeApiConfig,
      activeProvider: "custom",
      customProviderId: "custom",
      customProviderName: "Custom Claude",
      customBaseUrl: "https://old.example/anthropic",
      customModel: "claude-test",
    };
    await mountDialog(settings);
    await selectTarget("Claude Code");

    const button = container.querySelector<HTMLButtonElement>('[data-provider-connection-test="claude"]');
    await act(async () => button!.click());
    expect(container.textContent).toContain("Testing Claude Code connection...");
    expect(button?.disabled).toBe(true);

    const baseUrlRow = [...container.querySelectorAll<HTMLElement>(".settings-field")]
      .find((row) => row.querySelector(".settings-field-title")?.textContent === "Base URL");
    const baseUrlInput = baseUrlRow?.querySelector<HTMLInputElement>("input");
    await typeInto(baseUrlInput!, "https://new.example/anthropic");
    await act(async () => resolveConnection?.({ elapsedMs: 12, credentialSource: "stale credential" }));

    expect(container.textContent).not.toContain("stale credential");
    expect(button?.disabled).toBe(false);
  });

  it("clears hydrated Codex and Claude keys when their manual Base URLs change", async () => {
    const settings = structuredClone(defaultSettings);
    settings.apiConfig = {
      ...settings.apiConfig,
      activeProvider: "custom",
      customProviderId: "custom",
      customProviderName: "Custom Codex",
      customBaseUrl: "https://old-codex.example/v1",
      customApiKey: "hydrated-codex-key",
      customModel: "gpt-test",
    };
    settings.claudeApiConfig = {
      ...settings.claudeApiConfig,
      activeProvider: "custom",
      customProviderId: "custom",
      customProviderName: "Custom Claude",
      customBaseUrl: "https://old-claude.example/anthropic",
      customApiKey: "hydrated-claude-key",
      customModel: "claude-test",
    };
    await mountDialog(settings);

    const codexFields = [...container.querySelectorAll<HTMLElement>(".settings-field")];
    const codexBaseUrl = codexFields
      .find((row) => row.querySelector(".settings-field-title")?.textContent === "Base URL")
      ?.querySelector<HTMLInputElement>("input");
    const codexKey = codexFields
      .find((row) => row.querySelector(".settings-field-title")?.textContent === "API Key")
      ?.querySelector<HTMLInputElement>("input");
    expect(codexKey?.value).toBe("hydrated-codex-key");

    await typeInto(codexBaseUrl!, "https://new-codex.example/v1");

    expect(codexKey?.value).toBe("");
    const codexTest = container.querySelector<HTMLButtonElement>('[data-provider-connection-test="codex"]');
    await act(async () => codexTest?.click());
    expect(testProviderConnection).toHaveBeenLastCalledWith({
      target: "codex",
      apiConfig: expect.objectContaining({
        customBaseUrl: "https://new-codex.example/v1",
        customApiKey: "",
      }),
    });

    await selectTarget("Claude Code");
    const claudeFields = [...container.querySelectorAll<HTMLElement>(".settings-field")];
    const claudeBaseUrl = claudeFields
      .find((row) => row.querySelector(".settings-field-title")?.textContent === "Base URL")
      ?.querySelector<HTMLInputElement>("input");
    const claudeKey = claudeFields
      .find((row) => row.querySelector(".settings-field-title")?.textContent === "API Key")
      ?.querySelector<HTMLInputElement>("input");
    expect(claudeKey?.value).toBe("hydrated-claude-key");

    await typeInto(claudeBaseUrl!, "https://new-claude.example/anthropic");

    expect(claudeKey?.value).toBe("");
    const claudeTest = container.querySelector<HTMLButtonElement>('[data-provider-connection-test="claude"]');
    await act(async () => claudeTest?.click());
    expect(testProviderConnection).toHaveBeenLastCalledWith({
      target: "claude",
      apiConfig: expect.objectContaining({
        customBaseUrl: "https://new-claude.example/anthropic",
        customApiKey: "",
      }),
    });
  });

  it("renders the same eight rows in the same order for every source", async () => {
    await mountSummaryPane();

    for (const source of ["Codex", "Claude Code", "Custom"]) {
      await selectSource(source);
      expect(renderedRows(), `source ${source}`).toEqual(SUMMARY_ROWS);
    }
  });

  it("keeps the Claude source's reasoning control in place but inert", async () => {
    await mountSummaryPane();
    await selectSource("Claude Code");

    const row = container.querySelector('[data-summary-row="reasoning-effort"]');
    const control = row?.querySelector("select");
    // Claude Code exposes no reasoning switch, so the control stays for alignment and is disabled
    // rather than pretending to change anything.
    expect(control?.disabled).toBe(true);
  });

  it("gives each source its own model box instead of sharing one value", async () => {
    await mountSummaryPane();

    await selectSource("Codex");
    const codexModel = container.querySelector<HTMLInputElement>('[data-summary-row="model"] input');
    await typeInto(codexModel!, "codex-only-model");

    await selectSource("Claude Code");
    const claudeModel = container.querySelector<HTMLInputElement>('[data-summary-row="model"] input');
    expect(claudeModel?.value).not.toBe("codex-only-model");

    await selectSource("Codex");
    expect(container.querySelector<HTMLInputElement>('[data-summary-row="model"] input')?.value)
      .toBe("codex-only-model");
  });
});
