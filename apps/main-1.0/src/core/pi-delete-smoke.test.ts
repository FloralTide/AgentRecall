import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadDefaultSessions } from "./session-loader";
import { createInMemoryStore } from "./session-store";

const temporaryHomes: string[] = [];

afterEach(() => {
  for (const homeDir of temporaryHomes.splice(0)) {
    fs.rmSync(homeDir, { recursive: true, force: true });
  }
});

describe("Pi delete smoke", () => {
  it("loads a real-layout Pi jsonl and deletes the file plus index", () => {
    const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), "agent-recall-pi-delete-smoke-v1-"));
    temporaryHomes.push(homeDir);
    const filePath = path.join(
      homeDir,
      ".pi",
      "agent",
      "sessions",
      "--work-pi-delete-smoke--",
      "2026-08-25T02-50-00-000Z_pi-delete-smoke.jsonl",
    );
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, [
      JSON.stringify({
        type: "session",
        version: 3,
        id: "pi-delete-smoke",
        timestamp: "2026-08-25T02:50:00.000Z",
        cwd: "/work/pi-delete-smoke",
      }),
      JSON.stringify({
        type: "session_info",
        id: "info-1",
        parentId: null,
        timestamp: "2026-08-25T02:50:00.000Z",
        name: "Pi delete smoke",
      }),
      JSON.stringify({
        type: "message",
        id: "user-1",
        parentId: "info-1",
        timestamp: "2026-08-25T02:50:01.000Z",
        message: { role: "user", content: [{ type: "text", text: "Can AgentRecall delete this Pi session?" }] },
      }),
      JSON.stringify({
        type: "message",
        id: "assistant-1",
        parentId: "user-1",
        timestamp: "2026-08-25T02:50:02.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Yes after the read-only guard is removed." }],
          usage: { input: 8, output: 4, cacheRead: 0, cacheWrite: 0, reasoning: 0, totalTokens: 12 },
        },
      }),
    ].join("\n"), "utf8");

    const [loaded] = loadDefaultSessions({ homeDir, includePi: true })
      .filter((item) => item.session.source === "pi-cli");
    expect(loaded.session).toMatchObject({
      sessionKey: "pi:pi-delete-smoke",
      source: "pi-cli",
      originalTitle: "Pi delete smoke",
    });

    const store = createInMemoryStore();
    store.upsertIndexedSession(loaded.session, loaded.messages);
    expect(store.deleteSession("pi:pi-delete-smoke")).toBe(true);
    expect(fs.existsSync(filePath)).toBe(false);
    expect(store.getSession("pi:pi-delete-smoke")).toBeNull();
  });
});
