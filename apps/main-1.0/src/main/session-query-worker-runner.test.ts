import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SessionStore } from "../core/session-store";
import type { IndexedSession, SessionMessage } from "../core/types";
import { SessionQueryWorkerRunner } from "./session-query-worker-runner";

const roots: string[] = [];

function createRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "agent-recall-query-runner-"));
  roots.push(root);
  return root;
}

function indexedSession(
  sessionKey: string,
  projectPath: string,
  timestamp: number,
): IndexedSession {
  return {
    sessionKey,
    rawId: sessionKey,
    source: "codex-cli",
    projectPath,
    filePath: path.join(projectPath, `${sessionKey}.jsonl`),
    originalTitle: `Title ${sessionKey}`,
    firstQuestion: `Question ${sessionKey}`,
    timestamp,
    fileMtimeMs: timestamp,
    fileSize: 100,
    prUrl: null,
    prNumber: null,
  };
}

function messages(timestamp: number): SessionMessage[] {
  return [{
    role: "user",
    content: "persistent worker searchable text",
    timestamp: new Date(timestamp).toISOString(),
    index: 0,
  }];
}

afterEach(() => {
  for (const root of roots.splice(0)) fs.rmSync(root, { recursive: true, force: true });
});

describe("SessionQueryWorkerRunner", () => {
  it("runs every catalog query on a persistent connection with cloneable results", () => {
    const root = createRoot();
    const dbPath = path.join(root, "session-search.sqlite");
    const codexHome = path.join(root, ".codex");
    const projectPath = path.join(root, "indexed-project");
    const desktopOnlyPath = path.join(root, "desktop-only");
    const now = Date.now();
    fs.mkdirSync(codexHome, { recursive: true });
    fs.writeFileSync(path.join(codexHome, ".codex-global-state.json"), JSON.stringify({
      "project-order": [projectPath, desktopOnlyPath],
      "electron-workspace-root-labels": {
        [projectPath]: "Pinned indexed project",
        [desktopOnlyPath]: "Desktop only",
      },
    }));

    const writer = new SessionStore(dbPath);
    writer.upsertIndexedSession(
      indexedSession("codex:worker", projectPath, now),
      messages(now),
      [{
        timestamp: now,
        dedupeKey: "tokens",
        inputTokens: 10,
        outputTokens: 5,
        cachedInputTokens: 0,
        reasoningOutputTokens: 0,
        totalTokens: 15,
      }],
    );
    writer.addTag("codex:worker", "worker-tag");
    writer.close();

    const runner = new SessionQueryWorkerRunner({ dbPath, codexHome });
    try {
      const search = runner.execute({
        type: "request",
        requestId: 1,
        method: "searchSessions",
        options: { query: "searchable" },
      });
      const page = runner.execute({
        type: "request",
        requestId: 2,
        method: "searchSessionPage",
        options: { limit: 10 },
      });
      const stats = runner.execute({
        type: "request",
        requestId: 3,
        method: "getStats",
        options: { period: "allTime" },
      });
      const trend = runner.execute({
        type: "request",
        requestId: 4,
        method: "getStatsTrend",
        options: { period: "today" },
      });
      const tags = runner.execute({
        type: "request",
        requestId: 5,
        method: "listTags",
        options: {},
      });
      const projects = runner.execute({
        type: "request",
        requestId: 6,
        method: "listProjects",
        options: {},
      });
      const projectTags = runner.execute({
        type: "request",
        requestId: 7,
        method: "listTagsByProject",
        options: {},
      });

      expect(search).toEqual([
        expect.objectContaining({ sessionKey: "codex:worker", matchSnippet: expect.any(String) }),
      ]);
      expect(page).toMatchObject({ totalCount: 1, hasMore: false });
      expect(stats).toMatchObject({ total: { sessionCount: 1, totalTokens: 15 } });
      expect(trend).toMatchObject({ period: "today", granularity: "day" });
      expect(tags).toEqual(["worker-tag"]);
      expect(projects).toEqual(expect.arrayContaining([
        expect.objectContaining({ path: projectPath, label: "Pinned indexed project", sessionCount: 1 }),
        expect.objectContaining({ path: desktopOnlyPath, label: "Desktop only", sessionCount: 0 }),
      ]));
      expect(projectTags).toEqual([{
        environmentId: "local",
        projectPath,
        tags: ["worker-tag"],
      }]);

      for (const result of [search, page, stats, trend, tags, projects, projectTags]) {
        expect(() => structuredClone(result)).not.toThrow();
      }
    } finally {
      runner.close();
    }
  });

  it("keeps the read-only connection alive and observes later WAL commits", () => {
    const root = createRoot();
    const dbPath = path.join(root, "session-search.sqlite");
    const initialWriter = new SessionStore(dbPath);
    initialWriter.close();
    const runner = new SessionQueryWorkerRunner({
      dbPath,
      codexHome: path.join(root, ".codex"),
    });

    try {
      expect(runner.execute({
        type: "request",
        requestId: 1,
        method: "searchSessions",
        options: {},
      })).toEqual([]);

      const writer = new SessionStore(dbPath, { initializeSchema: false });
      writer.upsertIndexedSession(
        indexedSession("codex:later", path.join(root, "later-project"), Date.now()),
        messages(Date.now()),
      );
      writer.close();

      expect(runner.execute({
        type: "request",
        requestId: 2,
        method: "searchSessions",
        options: {},
      })).toEqual([
        expect.objectContaining({ sessionKey: "codex:later" }),
      ]);
    } finally {
      runner.close();
    }
  });

  it("does not create a missing database and refuses queries after close", () => {
    const root = createRoot();
    const dbPath = path.join(root, "missing.sqlite");

    expect(() => new SessionQueryWorkerRunner({
      dbPath,
      codexHome: path.join(root, ".codex"),
    })).toThrow();
    expect(fs.existsSync(dbPath)).toBe(false);

    const existingPath = path.join(root, "existing.sqlite");
    new SessionStore(existingPath).close();
    const runner = new SessionQueryWorkerRunner({
      dbPath: existingPath,
      codexHome: path.join(root, ".codex"),
    });
    runner.close();
    expect(() => runner.execute({
      type: "request",
      requestId: 1,
      method: "listTags",
      options: {},
    })).toThrow("closed");
  });
});
