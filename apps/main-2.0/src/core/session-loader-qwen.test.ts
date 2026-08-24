import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadDefaultSessions } from "./session-loader";

const roots: string[] = [];
const originalRuntimeDir = process.env.QWEN_RUNTIME_DIR;
const originalQwenHome = process.env.QWEN_HOME;
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  if (originalRuntimeDir === undefined) delete process.env.QWEN_RUNTIME_DIR;
  else process.env.QWEN_RUNTIME_DIR = originalRuntimeDir;
  if (originalQwenHome === undefined) delete process.env.QWEN_HOME;
  else process.env.QWEN_HOME = originalQwenHome;
  vi.restoreAllMocks();
});
function fixture(): string { const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentrecall-qwen-v2-")); roots.push(root); return root; }
function record(uuid: string, parentUuid: string | null, type: "user" | "assistant", text: string, extra: Record<string, unknown> = {}) { return { uuid, parentUuid, sessionId: "qwen-1", timestamp: "2026-08-23T00:00:00.000Z", type, cwd: "C:/repo", version: "0.22.0", message: { role: type, parts: [{ text }] }, ...extra }; }

describe("Qwen Code sessions", () => {
  it("reconstructs the active branch and keeps active sessions over archive", () => {
    const root = fixture(); const chats = path.join(root, ".qwen", "projects", "project", "chats"); fs.mkdirSync(path.join(chats, "archive"), { recursive: true });
    const user = record("u", null, "user", "internal", { systemPayload: { displayText: "visible" } }); const dead = record("dead", null, "user", "rewound"); const assistant = record("a", "u", "assistant", "answer", { usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, thoughtsTokenCount: 1 }, message: { parts: [{ thought: true, text: "thinking" }, { text: "answer" }, { functionCall: { name: "read_file", id: "c1" } }] } }); const tool = { uuid: "t", parentUuid: "a", sessionId: "qwen-1", timestamp: "2026-08-23T00:00:01.000Z", type: "tool_result", cwd: "C:/repo", message: { role: "user", parts: [] }, toolCallResult: { output: "done" } }; const title = { uuid: "title", parentUuid: "t", sessionId: "qwen-1", timestamp: "2026-08-23T00:00:02.000Z", type: "system", subtype: "custom_title", systemPayload: { customTitle: "Named session" } };
    fs.writeFileSync(path.join(chats, "qwen-1.jsonl"), `${[user, dead, assistant, tool, title].map((row) => JSON.stringify(row)).join("")}\ninvalid\n{"uuid":"tail"`); fs.writeFileSync(path.join(chats, "archive", "qwen-1.jsonl"), JSON.stringify(record("old", null, "user", "archive")));
    const [loaded] = loadDefaultSessions({ homeDir: root, includeQwenCode: true }); expect(loaded.session.source).toBe("qwen-code"); expect(loaded.session.originalTitle).toBe("Named session"); expect(loaded.messages.map((m) => m.content)).toEqual(["visible", "answer"]); expect(loaded.session.tokenUsage?.totalTokens).toBe(6); expect(loaded.traceEvents?.some((e) => e.kind === "tool_call")).toBe(true); expect(loaded.traceEvents?.some((e) => e.eventType === "qwen.tool_result")).toBe(true); expect(loaded.messages.some((m) => m.content === "rewound")).toBe(false);
  });

  it("uses QWEN_RUNTIME_DIR before QWEN_HOME", () => {
    const runtime = fixture(); const home = fixture(); const syntheticHome = fixture(); vi.spyOn(os, "homedir").mockReturnValue(syntheticHome); for (const [base, text] of [[runtime, "runtime"], [home, "home"]] as const) { const chats = path.join(base, "projects", "p", "chats"); fs.mkdirSync(chats, { recursive: true }); fs.writeFileSync(path.join(chats, `${text}.jsonl`), JSON.stringify(record(text, null, "user", text))); }
    process.env.QWEN_HOME = home; process.env.QWEN_RUNTIME_DIR = runtime; const loaded = loadDefaultSessions({ includeQwenCode: true }).filter((item) => item.session.source === "qwen-code"); expect(loaded).toHaveLength(1); expect(loaded[0].messages[0].content).toBe("runtime");
  });

  it("keeps braces inside valid JSON text and normalizes cached tokens and creation time", () => {
    const root = fixture(); const chats = path.join(root, ".qwen", "projects", "project", "chats"); fs.mkdirSync(chats, { recursive: true });
    const createdAt = "2026-08-23T00:00:00.000Z"; const updatedAt = "2026-08-23T01:00:00.000Z";
    const user = record("u", null, "user", "keep }{ together", { timestamp: createdAt });
    const assistant = record("a", "u", "assistant", "answer", { timestamp: updatedAt, usageMetadata: { promptTokenCount: 10, cachedContentTokenCount: 4, candidatesTokenCount: 3, thoughtsTokenCount: 2 } });
    fs.writeFileSync(path.join(chats, "tokens.jsonl"), `${JSON.stringify(user)}\n${JSON.stringify(assistant)}\n`);

    const [loaded] = loadDefaultSessions({ homeDir: root, includeQwenCode: true });
    expect(loaded.messages.map((message) => message.content)).toEqual(["keep }{ together", "answer"]);
    expect(loaded.session.timestamp).toBe(Date.parse(createdAt));
    expect(loaded.session.tokenUsage).toMatchObject({ inputTokens: 6, cachedInputTokens: 4, outputTokens: 3, reasoningOutputTokens: 2, totalTokens: 15 });
  });

  it("does not let an archive copy replace a skipped active session", () => {
    const root = fixture(); const chats = path.join(root, ".qwen", "projects", "project", "chats"); fs.mkdirSync(path.join(chats, "archive"), { recursive: true });
    const activePath = path.join(chats, "same.jsonl");
    fs.writeFileSync(activePath, JSON.stringify(record("active", null, "user", "active")));
    fs.writeFileSync(path.join(chats, "archive", "same.jsonl"), JSON.stringify(record("archive", null, "user", "archive")));
    const onSkippedFile = vi.fn();

    const loaded = loadDefaultSessions({ homeDir: root, includeQwenCode: true, shouldSkipFile: (filePath) => filePath === activePath, onSkippedFile });
    expect(loaded.filter((item) => item.session.source === "qwen-code")).toEqual([]);
    expect(onSkippedFile).toHaveBeenCalledWith(activePath, expect.any(Object));
  });
});
