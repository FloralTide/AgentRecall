// @vitest-environment happy-dom

import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

const service = vi.hoisted(() => ({
  getMcpClientConnections: vi.fn(async () => ({
    clients: [
      {
        clientId: "codex" as const,
        label: "Codex",
        configPath: "/tmp/.codex/config.toml",
        detected: true,
        enabled: true,
        configured: true,
      },
      {
        clientId: "claude" as const,
        label: "Claude Code",
        configPath: "/tmp/.claude.json",
        detected: false,
        enabled: false,
        configured: false,
      },
    ],
  })),
  setMcpClientConnection: vi.fn(async (request: { clientId: "codex" | "claude"; enabled: boolean }) => ({
    clients: [{
      clientId: request.clientId,
      label: request.clientId === "codex" ? "Codex" : "Claude Code",
      configPath: "/tmp/config",
      detected: true,
      enabled: request.enabled,
      configured: request.enabled,
    }],
  })),
}));

vi.mock("../../app/services/agent-recall-service", () => ({
  agentRecallAutomationService: () => service,
}));

import { McpClientConnectionsDialog } from "./McpClientConnectionsDialog";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.innerHTML = "";
  vi.clearAllMocks();
});

describe("McpClientConnectionsDialog", () => {
  it("shows Codex and Claude Code status and connects from the modal", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => root.render(<McpClientConnectionsDialog language="zh" onClose={() => undefined} />));
    await act(async () => undefined);

    expect(container.textContent).toContain("Codex");
    expect(container.textContent).toContain("Claude Code");
    expect(container.textContent).toContain("已连接 AgentRecall Gateway");
    expect(container.textContent).toContain("未检测到安装，仍可手动连接");
    expect(container.textContent).toContain("/tmp/.codex/config.toml");

    const claudeToggle = container.querySelector<HTMLInputElement>('input[aria-label="连接 Claude Code"]');
    expect(claudeToggle).not.toBeNull();
    expect(claudeToggle?.disabled).toBe(false);
    await act(async () => claudeToggle?.click());

    expect(service.setMcpClientConnection).toHaveBeenCalledWith({ clientId: "claude", enabled: true });
    await act(async () => root.unmount());
  });
});
