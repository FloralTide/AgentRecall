import { describe, expect, it, vi } from "vitest";
import type { McpServerDefinition } from "../../automation/contracts";
import { McpAutomationModule } from "./mcp-automation-module";

function server(overrides: Partial<McpServerDefinition> = {}): McpServerDefinition {
  return {
    id: "docs",
    name: "Docs",
    transport: "stdio",
    command: "node",
    args: ["server.js"],
    env: {},
    enabled: true,
    tools: [
      { name: "search", description: "Search docs", inputSchema: { type: "object" } },
      { name: "write", description: "Write docs", inputSchema: { type: "object" } },
    ],
    disabledTools: [],
    status: "connected",
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function moduleFixture(items: McpServerDefinition[]) {
  const invokeTool = vi.fn(async () => ({ content: [{ type: "text", text: "ok" }] }));
  const module = new McpAutomationModule({
    registry: {
      list: vi.fn(async () => items),
      upsert: vi.fn(async (value) => value),
      recordTest: vi.fn(),
      delete: vi.fn(async () => true),
    } as never,
    runtime: {
      listConfiguredAgents: vi.fn(() => []),
      setMcpServers: vi.fn(),
      updateConfiguredAgents: vi.fn(() => ({ configuredAgents: [] })),
      flushPersistence: vi.fn(async () => undefined),
    } as never,
    invokeTool,
  });
  return { module, invokeTool };
}

describe("McpAutomationModule Gateway index", () => {
  it("returns a compact, scoped, paginated index of enabled tools", async () => {
    const { module } = moduleFixture([
      server({ disabledTools: ["write"] }),
      server({ id: "issues", name: "Issues", tools: [{ name: "list", inputSchema: {} }] }),
      server({ id: "off", enabled: false }),
    ]);

    await expect(module.searchGatewayTools({ sourceId: "docs", limit: 1 })).resolves.toEqual({
      items: [{
        toolRef: "docs/search",
        sourceId: "docs",
        sourceName: "Docs",
        name: "search",
        description: "Search docs",
      }],
    });
    await expect(module.searchGatewayTools({ limit: 1 })).resolves.toMatchObject({
      items: [{ toolRef: "docs/search" }],
      nextCursor: "1",
    });
  });

  it("loads details before invoking the selected toolRef", async () => {
    const { module, invokeTool } = moduleFixture([server()]);

    await expect(module.getGatewayTool({ toolRef: "docs/search" })).resolves.toMatchObject({
      toolRef: "docs/search",
      inputSchema: { type: "object" },
    });
    await module.callGatewayTool({ toolRef: "docs/search", arguments: { query: "mcp" } });

    expect(invokeTool).toHaveBeenCalledWith(
      expect.objectContaining({ id: "docs" }),
      "search",
      { query: "mcp" },
      undefined,
    );
  });

  it("rejects disabled and stale toolRefs", async () => {
    const { module, invokeTool } = moduleFixture([server({ disabledTools: ["write"] })]);

    await expect(module.getGatewayTool({ toolRef: "docs/write" })).rejects.toThrow(/disabled/i);
    await expect(module.callGatewayTool({ toolRef: "missing/tool" })).rejects.toThrow(/unavailable/i);
    expect(invokeTool).not.toHaveBeenCalled();
  });

  it("uses the same source and tool enable switches for direct tools", async () => {
    const { module } = moduleFixture([
      server({ id: "agent-recall-skills", enabled: false }),
      server({ id: "agent-recall-session-search", disabledTools: ["get_session"] }),
    ]);

    await expect(module.assertGatewayDirectToolEnabled("agent-recall-skills", "list_skills"))
      .rejects.toThrow(/disabled/i);
    await expect(module.assertGatewayDirectToolEnabled("agent-recall-session-search", "get_session"))
      .rejects.toThrow(/disabled/i);
    await expect(module.assertGatewayDirectToolEnabled("agent-recall-session-search", "search_sessions"))
      .resolves.toBeUndefined();
  });
});

describe("McpAutomationModule catalog refresh", () => {
  it("discovers tools when a custom source is added", async () => {
    const draft = server({ tools: [], status: "untested" });
    const recordTest = vi.fn(async (saved: McpServerDefinition, tools: McpServerDefinition["tools"], error?: string) => ({
      ...saved,
      tools,
      status: error ? "error" as const : "connected" as const,
      ...(error ? { lastError: error } : {}),
    }));
    const discoverTools = vi.fn(async () => [{ name: "search", inputSchema: { type: "object" } }]);
    const module = new McpAutomationModule({
      registry: {
        list: vi.fn(async () => []),
        upsert: vi.fn(async (value) => value),
        recordTest,
        delete: vi.fn(),
      } as never,
      runtime: {
        listConfiguredAgents: vi.fn(() => []),
        setMcpServers: vi.fn(),
        updateConfiguredAgents: vi.fn(),
        flushPersistence: vi.fn(),
      } as never,
      discoverTools: discoverTools as never,
    });

    await expect(module.save(draft)).resolves.toMatchObject({
      status: "connected",
      tools: [{ name: "search" }],
    });
    expect(discoverTools).toHaveBeenCalledWith(draft);
  });

  it("keeps the last catalog when refresh fails", async () => {
    const existing = server();
    const changed = server({ command: "bun" });
    const recordTest = vi.fn(async (saved: McpServerDefinition, tools: McpServerDefinition["tools"], error?: string) => ({
      ...saved,
      tools,
      status: error ? "error" as const : "connected" as const,
      ...(error ? { lastError: error } : {}),
    }));
    const module = new McpAutomationModule({
      registry: {
        list: vi.fn(async () => [existing]),
        upsert: vi.fn(async (value) => value),
        recordTest,
        delete: vi.fn(),
      } as never,
      runtime: {
        listConfiguredAgents: vi.fn(() => []),
        setMcpServers: vi.fn(),
        updateConfiguredAgents: vi.fn(),
        flushPersistence: vi.fn(),
      } as never,
      discoverTools: vi.fn(async () => { throw new Error("offline"); }) as never,
    });

    await expect(module.save(changed)).resolves.toMatchObject({
      status: "error",
      lastError: "offline",
      tools: existing.tools,
    });
    expect(recordTest).toHaveBeenCalledWith(changed, existing.tools, "offline");
  });

  it("keeps the last catalog when a manual retest fails", async () => {
    const existing = server();
    const recordTest = vi.fn(async (saved: McpServerDefinition, tools: McpServerDefinition["tools"], error?: string) => ({
      ...saved,
      tools,
      status: error ? "error" as const : "connected" as const,
    }));
    const module = new McpAutomationModule({
      registry: {
        list: vi.fn(async () => [existing]),
        upsert: vi.fn(),
        recordTest,
        delete: vi.fn(),
      } as never,
      runtime: {
        listConfiguredAgents: vi.fn(() => []),
        setMcpServers: vi.fn(),
        updateConfiguredAgents: vi.fn(),
        flushPersistence: vi.fn(),
      } as never,
      discoverTools: vi.fn(async () => { throw new Error("offline"); }) as never,
    });

    await module.test(existing);
    expect(recordTest).toHaveBeenCalledWith(existing, existing.tools, "offline");
  });
});
