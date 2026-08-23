import { useEffect, useState } from "react";
import { CheckCircle2, CircleAlert, Link2, X } from "lucide-react";
import type { Language } from "../../app/language";
import type { McpExternalClientConnections, McpExternalClientId } from "../../../../shared/mcp/types";
import { agentRecallAutomationService } from "../../app/services/agent-recall-service";

export function McpClientConnectionsDialog({
  language,
  onClose,
}: {
  language: Language;
  onClose: () => void;
}) {
  const zh = language === "zh";
  const [snapshot, setSnapshot] = useState<McpExternalClientConnections>();
  const [busy, setBusy] = useState<McpExternalClientId>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    void agentRecallAutomationService().getMcpClientConnections()
      .then(setSnapshot)
      .catch((cause) => setError(cause instanceof Error ? cause.message : String(cause)));
  }, []);

  const toggle = async (clientId: McpExternalClientId, enabled: boolean) => {
    setBusy(clientId);
    setError(undefined);
    try {
      setSnapshot(await agentRecallAutomationService().setMcpClientConnection({ clientId, enabled }));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="mcp-modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="mcp-modal mcp-client-modal"
        role="dialog"
        aria-modal="true"
        aria-label={zh ? "连接 MCP 客户端" : "Connect MCP clients"}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="mcp-modal-header">
          <div className="mcp-modal-title">
            <Link2 size={17} />
            <div>
              <strong>{zh ? "连接客户端" : "Connect clients"}</strong>
              <small>{zh ? "每个客户端只会写入一个 agent-recall Gateway。" : "Each client receives one agent-recall Gateway entry."}</small>
            </div>
          </div>
          <button className="icon-btn" type="button" onClick={onClose} aria-label={zh ? "关闭" : "Close"}>
            <X size={15} />
          </button>
        </header>
        <div className="mcp-modal-body mcp-client-list">
          {snapshot ? snapshot.clients.map((client) => {
            const connected = client.enabled && client.configured;
            return (
              <div className="mcp-client-row" key={client.clientId}>
                <span className={`mcp-client-state ${connected ? "is-connected" : ""}`}>
                  {connected ? <CheckCircle2 size={18} /> : <CircleAlert size={18} />}
                </span>
                <span className="mcp-client-copy">
                  <strong>{client.label}</strong>
                  <small>
                    {!client.detected
                      ? (zh ? "未检测到安装，仍可手动连接" : "Installation not detected; manual connection is still available")
                      : connected
                        ? (zh ? "已连接 AgentRecall Gateway" : "AgentRecall Gateway connected")
                        : client.enabled
                          ? (zh ? "配置缺失，可重新连接" : "Configuration missing; reconnect to repair")
                          : (zh ? "已断开" : "Disconnected")}
                  </small>
                  <code>{client.configPath}</code>
                </span>
                <span className="mcp-binding-switch">
                  <input
                    type="checkbox"
                    aria-label={`${zh ? "连接" : "Connect"} ${client.label}`}
                    checked={client.enabled && client.configured}
                    disabled={Boolean(busy)}
                    onChange={(event) => void toggle(client.clientId, event.currentTarget.checked)}
                  />
                  <i aria-hidden="true" />
                </span>
              </div>
            );
          }) : (
            <p className="mcp-modal-description">{zh ? "正在检查客户端配置…" : "Checking client configuration…"}</p>
          )}
          {error ? <div className="mcp-inline-error" role="alert">{error}</div> : null}
        </div>
        <footer className="mcp-modal-footer">
          <p>{zh ? "修改后请重启对应的 Codex 或 Claude Code。" : "Restart Codex or Claude Code after changing a connection."}</p>
          <button className="control-btn compact secondary" type="button" onClick={onClose}>
            {zh ? "完成" : "Done"}
          </button>
        </footer>
      </section>
    </div>
  );
}
