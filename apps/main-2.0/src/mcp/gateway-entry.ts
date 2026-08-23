import { startStdioMcpServer } from "../automation/engine/mcp/server";

process.env.AGENT_RECALL_MCP_MODE = "gateway";
startStdioMcpServer();
