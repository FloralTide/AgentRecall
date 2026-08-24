import fs from "node:fs";
import * as os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadDefaultSessions } from "./session-loader";
import { deriveSessionTimeline } from "./turns/derive-turns";

const roots: string[] = [];
const originalRuntimeDir = process.env.QWEN_RUNTIME_DIR;
const originalQwenHome = process.env.QWEN_HOME;
const originalHome = process.env.HOME;
const originalUserProfile = process.env.USERPROFILE;
beforeEach(() => {
  delete process.env.QWEN_RUNTIME_DIR;
  delete process.env.QWEN_HOME;
});
afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
  if (originalRuntimeDir === undefined) delete process.env.QWEN_RUNTIME_DIR;
  else process.env.QWEN_RUNTIME_DIR = originalRuntimeDir;
  if (originalQwenHome === undefined) delete process.env.QWEN_HOME;
  else process.env.QWEN_HOME = originalQwenHome;
  if (originalHome === undefined) delete process.env.HOME;
  else process.env.HOME = originalHome;
  if (originalUserProfile === undefined) delete process.env.USERPROFILE;
  else process.env.USERPROFILE = originalUserProfile;
  vi.restoreAllMocks();
});
function fixture(): string { const root = fs.mkdtempSync(path.join(os.tmpdir(), "agentrecall-qwen-v2-")); roots.push(root); return root; }
function record(uuid: string, parentUuid: string | null, type: "user" | "assistant", text: string, extra: Record<string, unknown> = {}) { return { uuid, parentUuid, sessionId: "qwen-1", timestamp: "2026-08-23T00:00:00.000Z", type, cwd: "C:/repo", version: "0.22.0", message: { role: type, parts: [{ text }] }, ...extra }; }

describe("Qwen Code sessions", () => {
  it("reconstructs the active branch and keeps active sessions over archive", () => {
    const root = fixture(); const chats = path.join(root, ".qwen", "projects", "project", "chats"); fs.mkdirSync(path.join(chats, "archive"), { recursive: true });
    const user = record("u", null, "user", "internal", { systemPayload: { displayText: "visible" } }); const dead = record("dead", null, "user", "rewound"); const assistant = record("a", "u", "assistant", "answer", { usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 3, thoughtsTokenCount: 1 }, message: { parts: [{ thought: true, text: "thinking" }, { text: "answer" }, { functionCall: { name: "read_file", id: "c1" } }] } }); const tool = { uuid: "t", parentUuid: "a", sessionId: "qwen-1", timestamp: "2026-08-23T00:00:01.000Z", type: "tool_result", cwd: "C:/repo", message: { role: "user", parts: [{ functionResponse: { id: "c1", name: "read_file", response: { output: "done" } } }] }, toolCallResult: { callId: "c1", output: "done" } }; const metadata = { type: "system", subtype: "metadata" }; const title = { uuid: "title", parentUuid: "t", sessionId: "qwen-1", timestamp: "2026-08-23T00:00:02.000Z", type: "system", subtype: "custom_title", systemPayload: { customTitle: "Named session" } };
    fs.writeFileSync(path.join(chats, "qwen-1.jsonl"), `${[user, dead, assistant, tool, metadata, title].map((row) => JSON.stringify(row)).join("")}\ninvalid\n{"uuid":"tail"`); fs.writeFileSync(path.join(chats, "archive", "qwen-1.jsonl"), JSON.stringify(record("old", null, "user", "archive")));
    const [loaded] = loadDefaultSessions({ homeDir: root, includeQwenCode: true }); expect(loaded.session.source).toBe("qwen-code"); expect(loaded.session.originalTitle).toBe("Named session"); expect(loaded.messages.map((m) => m.content)).toEqual(["visible", "answer"]); expect(loaded.session.tokenUsage?.totalTokens).toBe(6); expect(loaded.traceEvents?.some((e) => e.kind === "tool_call")).toBe(true); expect(loaded.traceEvents?.filter((e) => e.eventType === "qwen.tool_result")).toEqual([expect.objectContaining({ callId: "c1" })]); expect(loaded.messages.some((m) => m.content === "rewound")).toBe(false);
    const toolSpans = deriveSessionTimeline({ sessionKey: loaded.session.sessionKey, messages: loaded.messages, tokenEvents: loaded.tokenEvents ?? [], traceEvents: loaded.traceEvents ?? [] }).turns.flatMap((turn) => turn.spans).filter((span) => span.callId === "c1");
    expect(toolSpans).toEqual([expect.objectContaining({ status: "completed", endedAt: expect.any(String) })]);
  });

  it("uses QWEN_RUNTIME_DIR before QWEN_HOME", () => {
    const runtime = fixture(); const home = fixture(); const syntheticHome = fixture(); for (const [base, text] of [[runtime, "runtime"], [home, "home"]] as const) { const chats = path.join(base, "projects", "p", "chats"); fs.mkdirSync(chats, { recursive: true }); fs.writeFileSync(path.join(chats, `${text}.jsonl`), JSON.stringify(record(text, null, "user", text))); }
    process.env.QWEN_HOME = home; process.env.QWEN_RUNTIME_DIR = runtime; const loaded = loadDefaultSessions({ homeDir: syntheticHome, includeQwenCode: true }).filter((item) => item.session.source === "qwen-code"); expect(loaded).toHaveLength(1); expect(loaded[0].messages[0].content).toBe("runtime");
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
    expect(loaded.tokenEvents).toEqual([{ timestamp: Date.parse(updatedAt), dedupeKey: "a", inputTokens: 6, outputTokens: 3, cachedInputTokens: 4, reasoningOutputTokens: 2, totalTokens: 15 }]);
  });

  it("recovers glued objects when the first message contains object-like braces", () => {
    const root = fixture(); const chats = path.join(root, ".qwen", "projects", "project", "chats"); fs.mkdirSync(chats, { recursive: true });
    const first = record("first", null, "user", "keep }{ together");
    const second = record("second", "first", "assistant", "second");
    fs.writeFileSync(path.join(chats, "glued.jsonl"), `${JSON.stringify(first)}${JSON.stringify(second)}\n`);
    const [loaded] = loadDefaultSessions({ homeDir: root, includeQwenCode: true });
    expect(loaded.messages.map((message) => message.content)).toEqual(["keep }{ together", "second"]);
  });

  it("uses the latest custom title", () => {
    const root = fixture(); const chats = path.join(root, ".qwen", "projects", "project", "chats"); fs.mkdirSync(chats, { recursive: true });
    const rows = [record("user", null, "user", "question"), { type: "system", subtype: "custom_title", systemPayload: { customTitle: "Old title" } }, { type: "system", subtype: "custom_title", systemPayload: { customTitle: "Latest title" } }];
    fs.writeFileSync(path.join(chats, "titles.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
    const [loaded] = loadDefaultSessions({ homeDir: root, includeQwenCode: true });
    expect(loaded.session.originalTitle).toBe("Latest title");
  });

  it("expands a QWEN_RUNTIME_DIR tilde path", () => {
    const fakeHome = fixture(); const root = fixture(); process.env.HOME = fakeHome; process.env.USERPROFILE = fakeHome;
    const chats = path.join(fakeHome, "qwen-runtime", "nested", "projects", "project", "chats"); fs.mkdirSync(chats, { recursive: true });
    fs.writeFileSync(path.join(chats, "tilde.jsonl"), JSON.stringify(record("tilde", null, "user", "tilde")));
    process.env.QWEN_RUNTIME_DIR = "~\\qwen-runtime\\nested";
    const loaded = loadDefaultSessions({ homeDir: root, includeQwenCode: true }).filter((item) => item.session.source === "qwen-code");
    expect(loaded).toHaveLength(1); expect(loaded[0].messages[0].content).toBe("tilde");
  });

  it("uses QWEN_HOME when runtime is unset even with an explicit homeDir", () => {
    const root = fixture(); const qwenHome = fixture();
    const chats = path.join(qwenHome, "projects", "project", "chats"); fs.mkdirSync(chats, { recursive: true });
    fs.writeFileSync(path.join(chats, "home.jsonl"), JSON.stringify(record("home", null, "user", "home")));
    delete process.env.QWEN_RUNTIME_DIR; process.env.QWEN_HOME = qwenHome;
    const loaded = loadDefaultSessions({ homeDir: root, includeQwenCode: true }).filter((item) => item.session.source === "qwen-code");
    expect(loaded).toHaveLength(1); expect(loaded[0].messages[0].content).toBe("home");
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

  it("normalizes numeric second and millisecond timestamps across Qwen records", () => {
    const root = fixture(); const chats = path.join(root, ".qwen", "projects", "project", "chats"); fs.mkdirSync(chats, { recursive: true });
    const userSeconds = 1787443200; const assistantMilliseconds = userSeconds * 1000 + 1000; const toolMilliseconds = assistantMilliseconds + 1000;
    const user = record("u", null, "user", "question", { timestamp: userSeconds });
    const assistant = record("a", "u", "assistant", "answer", {
      timestamp: assistantMilliseconds,
      usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 3 },
      message: { parts: [{ text: "answer" }, { functionCall: { name: "read_file", id: "call-1" } }] },
    });
    const tool = { uuid: "t", parentUuid: "a", sessionId: "qwen-1", timestamp: toolMilliseconds, type: "tool_result", cwd: "C:/repo", message: { role: "user", parts: [] }, toolCallResult: { callId: "call-1", output: "done" } };
    fs.writeFileSync(path.join(chats, "numeric.jsonl"), `${JSON.stringify(user)}\n${JSON.stringify(assistant)}\n${JSON.stringify(tool)}\n`);

    const [loaded] = loadDefaultSessions({ homeDir: root, includeQwenCode: true });
    expect(loaded.session.timestamp).toBe(userSeconds * 1000);
    expect(loaded.messages.map((message) => message.timestamp)).toEqual([
      new Date(userSeconds * 1000).toISOString(),
      new Date(assistantMilliseconds).toISOString(),
    ]);
    expect(loaded.tokenEvents?.[0]).toMatchObject({ timestamp: assistantMilliseconds, dedupeKey: "a" });
    expect(loaded.traceEvents?.find((event) => event.eventType === "qwen.functionCall")).toMatchObject({ timestamp: new Date(assistantMilliseconds).toISOString() });
    expect(loaded.traceEvents?.filter((event) => event.eventType === "qwen.tool_result")).toEqual([expect.objectContaining({ callId: "call-1", timestamp: new Date(toolMilliseconds).toISOString() })]);
  });

  it("falls back to valid file-order rows when a parent chain is broken", () => {
    const root = fixture(); const chats = path.join(root, ".qwen", "projects", "project", "chats"); fs.mkdirSync(chats, { recursive: true });
    const rows = [
      record("early", null, "user", "early", { timestamp: "2026-08-23T00:00:00.000Z" }),
      record("orphan", "missing", "assistant", "later", { usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 }, message: { parts: [{ text: "later" }, { functionCall: { name: "read_file", id: "call-1" } }] } }),
      { uuid: "tool", parentUuid: "orphan", sessionId: "qwen-1", timestamp: "2026-08-23T00:00:02.000Z", type: "tool_result", cwd: "C:/repo", message: { role: "user", parts: [] }, toolCallResult: { output: "done" } },
      record("leaf", "tool", "assistant", "leaf", { usageMetadata: { promptTokenCount: 6, candidatesTokenCount: 3 } }),
    ];
    fs.writeFileSync(path.join(chats, "broken.jsonl"), `${JSON.stringify(rows[0])}\nnot-json\n${rows.slice(1).map((row) => JSON.stringify(row)).join("\n")}\n`);
    const [loaded] = loadDefaultSessions({ homeDir: root, includeQwenCode: true });
    expect(loaded.messages.map((message) => message.content)).toEqual(["early", "later", "leaf"]);
    expect(loaded.tokenEvents?.map((event) => event.dedupeKey)).toEqual(["orphan", "leaf"]);
    expect(loaded.traceEvents?.some((event) => event.eventType === "qwen.tool_result")).toBe(true);
    expect(loaded.session.timestamp).toBe(Date.parse("2026-08-23T00:00:00.000Z"));
  });

  it("falls back to file-order rows when UUIDs are duplicated", () => {
    const root = fixture(); const chats = path.join(root, ".qwen", "projects", "project", "chats"); fs.mkdirSync(chats, { recursive: true });
    const rows = [
      record("early", null, "user", "early"),
      record("dup", "early", "assistant", "first", { usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 } }),
      record("dup", "missing", "assistant", "second", { usageMetadata: { promptTokenCount: 2, candidatesTokenCount: 2 }, message: { parts: [{ text: "second" }, { functionCall: { name: "read_file", id: "dup-call" } }] } }),
      { type: "system", subtype: "metadata", usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 100 } },
    ];
    fs.writeFileSync(path.join(chats, "duplicate.jsonl"), `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`);
    const [loaded] = loadDefaultSessions({ homeDir: root, includeQwenCode: true });
    expect(loaded.messages.map((message) => message.content)).toEqual(["early", "first", "second"]);
    expect(loaded.tokenEvents?.map((event) => event.dedupeKey)).toEqual(["dup"]);
    expect(loaded.tokenEvents?.[0].totalTokens).toBe(4);
    expect(loaded.traceEvents?.some((event) => event.eventType === "qwen.functionCall")).toBe(true);
  });
});
