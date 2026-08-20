import { describe, expect, it, vi } from "vitest";
import { defaultSettings, type AppSettings } from "../../core/platform";
import { ProviderService, type ProviderServiceOperations } from "./provider-service";

function cloneSettings(): AppSettings {
  return structuredClone(defaultSettings);
}

function createHarness(settings: AppSettings = cloneSettings()) {
  const keys = new Map<string, string>();
  const savedSettings = new Map<string, unknown>();
  const operations: Partial<ProviderServiceOperations> = {
    providerConfigDirectoryExists: vi.fn(async () => true),
    loadCodexProfileDefaults: vi.fn(async () => ({})),
    loadClaudeApiConfigDefaults: vi.fn(async () => ({})),
    loadCodexConfigSnapshot: vi.fn(async () => ({
      codexHome: "/tmp/codex",
      configPath: "/tmp/codex/config.toml",
      exists: false,
      activeProviderId: "openai",
      activeModel: "",
      activeProvider: null,
      providers: [],
      credentialSource: null,
      hasApiKey: false,
    })),
    loadClaudeConfigSnapshot: vi.fn(async () => ({
      claudeHome: "/tmp/claude",
      settingsPath: "/tmp/claude/settings.json",
      exists: false,
      route: {},
      credentialSource: null,
      hasApiKey: false,
    })),
    probeCodexModels: vi.fn(async () => ({
      models: ["codex-model-a"],
      endpoint: "https://api.example/v1/models",
      endpoints: ["https://api.example/v1/models"],
      credentialSource: "API key field",
    })),
    probeClaudeModels: vi.fn(async () => ({
      models: ["claude-model-a"],
      endpoint: "https://api.example/v1/models",
      endpoints: ["https://api.example/v1/models"],
      credentialSource: "API key field",
    })),
    resolveCodexProviderCredential: vi.fn(async ({ apiKey }) => ({
      apiKey: apiKey || "",
      source: apiKey ? "API key field" : null,
    })),
    resolveClaudeProviderCredential: vi.fn(async ({ apiKey }) => ({
      apiKey: apiKey || "",
      source: apiKey ? "API key field" : null,
    })),
    requestSummaryCompletion: vi.fn(async () => "OK"),
  };
  const service = new ProviderService({
    getSettings: () => settings,
    keys: {
      get: async (target, providerId) => keys.get(`${target}:${providerId}`) ?? "",
      set: async (target, providerId, apiKey) => {
        keys.set(`${target}:${providerId}`, apiKey);
      },
    },
    settings: {
      has: (path) => savedSettings.has(path),
      get: (path) => savedSettings.get(path),
      set: (path, value) => {
        savedSettings.set(path, value);
      },
    },
    logError: vi.fn(),
    operations,
  });
  return { service, settings, keys, savedSettings, operations };
}

describe("ProviderService local config directories", () => {
  it("drops deleted saved config directories and reloads the machine-local profiles", async () => {
    const settings = cloneSettings();
    settings.apiConfig.customConfigDir = "/deleted/codex-home";
    settings.claudeApiConfig.customConfigDir = "/deleted/claude-home";
    const harness = createHarness(settings);
    vi.mocked(harness.operations.providerConfigDirectoryExists!).mockResolvedValue(false);

    const hydrated = await harness.service.hydrateSettings();

    expect(hydrated.apiConfig.customConfigDir).toBe("");
    expect(hydrated.claudeApiConfig.customConfigDir).toBe("");
    expect(harness.operations.loadCodexProfileDefaults).toHaveBeenCalledWith(undefined);
    expect(harness.operations.loadClaudeApiConfigDefaults).toHaveBeenCalledWith(undefined);
    expect(harness.savedSettings.get("apiConfig.customConfigDir")).toBe("");
    expect(harness.savedSettings.get("claudeApiConfig.customConfigDir")).toBe("");
  });

  it("lets active local profiles replace stale saved provider fields", async () => {
    const settings = cloneSettings();
    settings.apiConfig = {
      ...settings.apiConfig,
      activeProvider: "custom",
      customProviderId: "custom",
      customProviderName: "Saved Codex",
      customBaseUrl: "https://saved.example/v1",
      customModel: "saved-codex-model",
    };
    settings.claudeApiConfig = {
      ...settings.claudeApiConfig,
      activeProvider: "custom",
      customProviderId: "custom",
      customProviderName: "Saved Claude",
      customBaseUrl: "https://saved.example/anthropic",
      customModel: "saved-claude-model",
    };
    const harness = createHarness(settings);
    for (const [path, value] of [
      ["apiConfig.customProviderName", settings.apiConfig.customProviderName],
      ["apiConfig.customBaseUrl", settings.apiConfig.customBaseUrl],
      ["apiConfig.customModel", settings.apiConfig.customModel],
      ["claudeApiConfig.customProviderName", settings.claudeApiConfig.customProviderName],
      ["claudeApiConfig.customBaseUrl", settings.claudeApiConfig.customBaseUrl],
      ["claudeApiConfig.customModel", settings.claudeApiConfig.customModel],
    ] as const) harness.savedSettings.set(path, value);
    vi.mocked(harness.operations.loadCodexProfileDefaults!).mockResolvedValue({
      activeProvider: "custom",
      customProviderId: "custom",
      customProviderName: "Local Codex",
      customBaseUrl: "https://local.example/v1",
      customModel: "local-codex-model",
      customApiFormat: "openai_responses",
    });
    vi.mocked(harness.operations.loadClaudeApiConfigDefaults!).mockResolvedValue({
      activeProvider: "custom",
      customProviderId: "custom",
      customProviderName: "Local Claude",
      customBaseUrl: "https://local.example/anthropic",
      customModel: "local-claude-model",
      customApiFormat: "anthropic",
    });

    const hydrated = await harness.service.hydrateSettings();

    expect(hydrated.apiConfig).toMatchObject({
      customProviderName: "Local Codex",
      customBaseUrl: "https://local.example/v1",
      customModel: "local-codex-model",
    });
    expect(hydrated.claudeApiConfig).toMatchObject({
      customProviderName: "Local Claude",
      customBaseUrl: "https://local.example/anthropic",
      customModel: "local-claude-model",
    });
  });
});

describe("summary Claude route isolation", () => {
  it("probes with the summary key store and the summary config directory", async () => {
    const settings = cloneSettings();
    settings.claudeApiConfig = {
      ...settings.claudeApiConfig,
      customProviderId: "claude-tab-provider",
      customConfigDir: "/tmp/claude-tab",
    };
    settings.summaryClaudeConfigDir = "/tmp/summary-claude";
    settings.summaryApiConfig = { ...settings.summaryApiConfig, customProviderId: "summary-provider" };
    const harness = createHarness(settings);
    harness.keys.set("claude:claude-tab-provider", "claude-tab-key");
    harness.keys.set("summary:summary-provider", "summary-key");

    await harness.service.probeClaudeModels({
      baseUrl: "https://summary.example",
      apiKey: "",
      apiFormat: "anthropic",
      apiKeyField: "ANTHROPIC_AUTH_TOKEN",
      keyTarget: "summary",
    });

    // Reading the Claude tab's key or directory here would make the summary panel report a
    // route the summary run never uses.
    expect(harness.operations.probeClaudeModels).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "summary-key",
      claudeHome: "/tmp/summary-claude",
      apiKeySource: "AgentRecall summary key store",
    }));
  });

  it("leaves the Claude tab probe on the Claude key store and directory", async () => {
    const settings = cloneSettings();
    settings.claudeApiConfig = {
      ...settings.claudeApiConfig,
      customProviderId: "claude-tab-provider",
      customConfigDir: "/tmp/claude-tab",
    };
    settings.summaryClaudeConfigDir = "/tmp/summary-claude";
    const harness = createHarness(settings);
    harness.keys.set("claude:claude-tab-provider", "claude-tab-key");
    harness.keys.set("summary:claude-tab-provider", "summary-key");

    await harness.service.probeClaudeModels({
      baseUrl: "https://claude.example",
      apiKey: "",
      apiFormat: "anthropic",
      apiKeyField: "ANTHROPIC_AUTH_TOKEN",
    });

    expect(harness.operations.probeClaudeModels).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "claude-tab-key",
      claudeHome: "/tmp/claude-tab",
    }));
  });

  it("treats an empty summary directory as the machine's own ~/.claude", async () => {
    const settings = cloneSettings();
    settings.claudeApiConfig = { ...settings.claudeApiConfig, customConfigDir: "/tmp/claude-tab" };
    settings.summaryClaudeConfigDir = "";
    const harness = createHarness(settings);

    await harness.service.probeClaudeModels({
      baseUrl: "https://summary.example",
      apiKey: "",
      apiFormat: "anthropic",
      apiKeyField: "ANTHROPIC_AUTH_TOKEN",
      keyTarget: "summary",
    });

    // Falling through to the Claude tab's directory would silently make "follow this machine"
    // mean "follow the other tab".
    expect(harness.operations.probeClaudeModels).toHaveBeenCalledWith(expect.objectContaining({
      claudeHome: undefined,
    }));
  });

  it("keeps the summary Codex probe off the Codex tab's directory", async () => {
    const settings = cloneSettings();
    settings.apiConfig = { ...settings.apiConfig, customConfigDir: "/tmp/codex-tab" };
    settings.summaryCodexConfigDir = "/tmp/summary-codex";
    const harness = createHarness(settings);

    await harness.service.probeCodexModels({
      baseUrl: "https://summary.example",
      apiKey: "",
      keyTarget: "summary",
    });

    expect(harness.operations.probeCodexModels).toHaveBeenCalledWith(expect.objectContaining({
      codexHome: "/tmp/summary-codex",
    }));
  });
});

describe("Provider connection tests", () => {
  it("uses each official CLI without requiring AgentRecall to read an API key", async () => {
    const settings = cloneSettings();
    settings.codexBinary = "custom-codex";
    settings.claudeBinary = "custom-claude";
    const harness = createHarness(settings);

    const codex = await harness.service.testProviderConnection({
      target: "codex",
      apiConfig: { activeProvider: "official", customConfigDir: "/tmp/provider-codex" },
    });
    const claude = await harness.service.testProviderConnection({
      target: "claude",
      apiConfig: { activeProvider: "official", customConfigDir: "/tmp/provider-claude" },
    });

    expect(harness.operations.resolveCodexProviderCredential).not.toHaveBeenCalled();
    expect(harness.operations.resolveClaudeProviderCredential).not.toHaveBeenCalled();
    expect(harness.operations.requestSummaryCompletion).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        apiFormat: "codex_exec",
        command: "custom-codex",
        env: { CODEX_HOME: "/tmp/provider-codex" },
        cliArgs: ["--ignore-user-config"],
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(harness.operations.requestSummaryCompletion).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        apiFormat: "claude_exec",
        command: "custom-claude",
        env: expect.objectContaining({ CLAUDE_CONFIG_DIR: "/tmp/provider-claude", ANTHROPIC_BASE_URL: "" }),
        cliArgs: expect.arrayContaining(["--settings"]),
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(codex.credentialSource).toBe("Codex CLI authentication");
    expect(claude.credentialSource).toBe("Claude Code CLI authentication");
  });

  it("tests an unsaved Codex route with read-only CLI overrides and a stored key", async () => {
    const harness = createHarness();
    harness.keys.set("codex:gateway", "stored-key");
    vi.mocked(harness.operations.resolveCodexProviderCredential!).mockResolvedValue({
      apiKey: "stored-key",
      source: "AgentRecall codex key store",
    });

    const result = await harness.service.testProviderConnection({
      target: "codex",
      apiConfig: {
        activeProvider: "custom",
        customProviderId: "gateway",
        customConfigDir: "/tmp/provider-codex",
        customProviderName: "Gateway",
        customBaseUrl: "https://gateway.example/v1/",
        customApiKey: "",
        customModel: "gpt-test",
        customApiFormat: "openai_responses",
      },
    });

    expect(harness.operations.resolveCodexProviderCredential).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: "stored-key",
      apiKeySource: "AgentRecall codex key store",
      codexHome: "/tmp/provider-codex",
    }));
    expect(harness.operations.requestSummaryCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        apiFormat: "codex_exec",
        modelArg: "gpt-test",
        env: {
          CODEX_HOME: "/tmp/provider-codex",
          OPENAI_API_KEY: "stored-key",
        },
        cliArgs: expect.arrayContaining([
          "model_provider=\"gateway\"",
          "model_providers.gateway.base_url=\"https://gateway.example/v1\"",
        ]),
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(result.credentialSource).toBe("AgentRecall codex key store");
  });

  it("preserves an existing Codex provider's CLI-managed authentication", async () => {
    const harness = createHarness();
    vi.mocked(harness.operations.loadCodexConfigSnapshot!).mockResolvedValue({
      codexHome: "/tmp/provider-codex",
      configPath: "/tmp/provider-codex/config.toml",
      exists: true,
      activeProviderId: "gateway",
      activeModel: "gpt-test",
      activeProvider: null,
      providers: [{
        id: "gateway",
        name: "Gateway",
        baseUrl: "https://gateway.example/v1",
        wireApi: "responses",
        envKey: "",
        requiresOpenaiAuth: false,
        hasApiKey: true,
        credentialSource: "config.toml gateway.auth",
      }],
      credentialSource: "config.toml gateway.auth",
      hasApiKey: true,
    });

    const result = await harness.service.testProviderConnection({
      target: "codex",
      apiConfig: {
        activeProvider: "custom",
        customProviderId: "gateway",
        customConfigDir: "/tmp/provider-codex",
        customProviderName: "Gateway",
        customBaseUrl: "https://gateway.example/v1",
        customApiKey: "",
        customModel: "gpt-test",
        customApiFormat: "openai_responses",
      },
    });

    expect(harness.operations.requestSummaryCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        env: { CODEX_HOME: "/tmp/provider-codex" },
        cliArgs: ["-c", 'model_provider="gateway"'],
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(result.credentialSource).toBe("config.toml gateway.auth");
  });

  it("does not send official CLI authentication to a new third-party route", async () => {
    const harness = createHarness();

    await expect(harness.service.testProviderConnection({
      target: "codex",
      apiConfig: {
        activeProvider: "custom",
        customProviderId: "unwritten",
        customProviderName: "Unwritten",
        customBaseUrl: "https://unwritten.example/v1",
        customApiKey: "",
        customModel: "gpt-test",
        customApiFormat: "openai_responses",
      },
    })).rejects.toThrow(/Write this route to Codex config/);
    expect(harness.operations.requestSummaryCompletion).not.toHaveBeenCalled();
  });

  it("lets Claude Code resolve credentials that are not readable from its settings file", async () => {
    const harness = createHarness();
    vi.mocked(harness.operations.loadClaudeConfigSnapshot!).mockResolvedValue({
      claudeHome: "/tmp/provider-claude",
      settingsPath: "/tmp/provider-claude/settings.json",
      exists: true,
      route: {
        activeProvider: "custom",
        customBaseUrl: "https://gateway.example/anthropic",
      },
      credentialSource: "settings.json apiKeyHelper",
      hasApiKey: true,
    });

    const result = await harness.service.testProviderConnection({
      target: "claude",
      apiConfig: {
        activeProvider: "custom",
        customProviderId: "gateway",
        customConfigDir: "/tmp/provider-claude",
        customProviderName: "Gateway",
        customBaseUrl: "https://gateway.example/anthropic/",
        customApiKey: "",
        customModel: "claude-test",
        customApiFormat: "anthropic",
        customApiKeyField: "ANTHROPIC_AUTH_TOKEN",
      },
    });

    expect(harness.operations.requestSummaryCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        apiFormat: "claude_exec",
        modelArg: "claude-test",
        env: { CLAUDE_CONFIG_DIR: "/tmp/provider-claude" },
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(result.credentialSource).toBe("settings.json apiKeyHelper");
  });
});

describe("summary connection test credentials", () => {
  it("tests the Codex source through the same CLI path as real summaries", async () => {
    const settings = cloneSettings();
    settings.codexBinary = "custom-codex";
    settings.summaryCodexConfigDir = "";
    const harness = createHarness(settings);

    const result = await harness.service.testSummaryProviderConnection({
      source: "codex",
      baseUrl: "https://unused.example/v1",
      apiKey: "",
      model: "gpt-test",
      apiFormat: "openai_responses",
    });

    expect(harness.operations.resolveCodexProviderCredential).not.toHaveBeenCalled();
    expect(harness.operations.requestSummaryCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        apiFormat: "codex_exec",
        command: "custom-codex",
        model: "gpt-test",
        modelArg: "gpt-test",
      }),
      expect.anything(),
      expect.anything(),
    );
    expect(result.credentialSource).toBe("Codex CLI");
  });

  it("resolves the Claude source against its own directory and key slot", async () => {
    const settings = cloneSettings();
    settings.summaryClaudeConfigDir = "/tmp/summary-claude";
    settings.claudeApiConfig = { ...settings.claudeApiConfig, customConfigDir: "/tmp/claude-tab" };
    const harness = createHarness(settings);
    harness.keys.set("summary:claude-provider", "summary-key");
    vi.mocked(harness.operations.resolveClaudeProviderCredential!).mockResolvedValue({
      apiKey: "summary-key",
      source: "AgentRecall summary key store",
    });

    const result = await harness.service.testSummaryProviderConnection({
      source: "claude",
      baseUrl: "https://summary.example/v1",
      apiKey: "",
      model: "claude-opus-4-8",
      providerId: "claude-provider",
      apiFormat: "anthropic",
      apiKeyField: "ANTHROPIC_AUTH_TOKEN",
    });

    expect(harness.operations.resolveClaudeProviderCredential).toHaveBeenCalledWith(expect.objectContaining({
      claudeHome: "/tmp/summary-claude",
      apiKey: "summary-key",
    }));
    expect(result.credentialSource).toBe("AgentRecall summary key store");
  });

  it("borrows the Codex tab's credential only when the custom source inherits", async () => {
    const settings = cloneSettings();
    settings.apiConfig = { ...settings.apiConfig, customConfigDir: "/tmp/codex-tab" };
    const harness = createHarness(settings);
    harness.keys.set("codex:shared-provider", "codex-tab-key");
    harness.keys.set("summary:shared-provider", "summary-key");
    vi.mocked(harness.operations.resolveCodexProviderCredential!).mockResolvedValue({
      apiKey: "codex-tab-key",
      source: "AgentRecall codex key store",
    });

    await harness.service.testSummaryProviderConnection({
      source: "custom",
      baseUrl: "https://summary.example/v1",
      apiKey: "",
      model: "summary-model",
      providerId: "shared-provider",
      apiFormat: "openai_chat",
      inherit: true,
    });

    expect(harness.operations.resolveCodexProviderCredential).toHaveBeenCalledWith(expect.objectContaining({
      codexHome: "/tmp/codex-tab",
      apiKey: "codex-tab-key",
    }));
  });

  it("uses the summary key slot for a custom source that does not inherit", async () => {
    const harness = createHarness();
    harness.keys.set("codex:shared-provider", "codex-tab-key");
    harness.keys.set("summary:shared-provider", "summary-key");

    const result = await harness.service.testSummaryProviderConnection({
      source: "custom",
      baseUrl: "https://summary.example/v1",
      apiKey: "",
      model: "summary-model",
      providerId: "shared-provider",
      apiFormat: "openai_chat",
    });

    // A non-inheriting custom route resolves its key directly, without consulting the Codex tab.
    expect(harness.operations.resolveCodexProviderCredential).not.toHaveBeenCalled();
    expect(result.credentialSource).toBe("AgentRecall summary key store");
    expect(harness.operations.requestSummaryCompletion).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: "summary-key", model: "summary-model" }),
      expect.anything(),
      expect.anything(),
    );
  });

  it("refuses the Gemini native format instead of testing a different one", async () => {
    const harness = createHarness();
    harness.keys.set("summary:gemini-provider", "summary-key");
    vi.mocked(harness.operations.resolveClaudeProviderCredential!).mockResolvedValue({
      apiKey: "summary-key",
      source: "AgentRecall summary key store",
    });

    await expect(harness.service.testSummaryProviderConnection({
      source: "claude",
      baseUrl: "https://summary.example/v1",
      apiKey: "",
      model: "gemini-3-pro",
      providerId: "gemini-provider",
      apiFormat: "gemini_native",
      apiKeyField: "ANTHROPIC_AUTH_TOKEN",
    })).rejects.toThrow(/Gemini native format/);
    expect(harness.operations.requestSummaryCompletion).not.toHaveBeenCalled();
  });
});
