import { createRequire } from "node:module";
import type { DatabaseSync as DatabaseSyncType } from "node:sqlite";
import { mergeCodexDesktopProjects, readCodexDesktopProjects } from "../core/codex-projects";
import { SessionStore } from "../core/session-store";
import type {
  SessionQueryWorkerInput,
  SessionQueryWorkerRequest,
  SessionQueryWorkerResult,
} from "./session-query-worker-protocol";

const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite") as { DatabaseSync: typeof DatabaseSyncType };

export class SessionQueryWorkerRunner {
  private readonly store: SessionStore;
  private closed = false;

  constructor(private readonly input: SessionQueryWorkerInput) {
    const db = new DatabaseSync(input.dbPath, { readOnly: true });
    try {
      this.store = new SessionStore(db, { initializeSchema: false });
      db.exec("PRAGMA query_only = ON");
    } catch (error) {
      db.close();
      throw error;
    }
  }

  execute(request: SessionQueryWorkerRequest): SessionQueryWorkerResult {
    if (this.closed) throw new Error("Session query worker runner is closed.");

    switch (request.method) {
      case "searchSessions":
        return this.store.searchSessions(request.options);
      case "searchSessionPage":
        return this.store.searchSessionPage(request.options);
      case "getStats":
        return this.store.getStats(request.options);
      case "getStatsTrend":
        return this.store.getStatsTrend(request.options);
      case "listTags":
        return this.store.listTags(request.options);
      case "listProjects": {
        const indexed = this.store.listProjects(request.options);
        const environmentId = request.options.environmentId;
        if (environmentId && environmentId !== "all" && environmentId !== "local") return indexed;
        return mergeCodexDesktopProjects(indexed, readCodexDesktopProjects(this.input.codexHome));
      }
      case "listTagsByProject":
        return this.store.listTagsByProject(request.options);
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.store.close();
  }
}
