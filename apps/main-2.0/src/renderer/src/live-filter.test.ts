import { describe, expect, it } from "vitest";
import type { LiveSessionSnapshot } from "../../core/types";
import {
  LiveSessionSnapshotRefreshCoordinator,
  liveSessionKeyForSession,
} from "./live-filter";

describe("live session filtering", () => {
  it("treats an unknown persisted source as non-live", () => {
    expect(liveSessionKeyForSession({
      source: "legacy-source" as never,
      rawId: "session-1",
      lastActivityAt: Date.now(),
    })).toBeNull();
  });

  it("keeps the rendered snapshot when only non-filtering details change", async () => {
    const coordinator = new LiveSessionSnapshotRefreshCoordinator();
    const original = snapshot([
      { family: "claude", rawId: "alpha", pid: 1 },
      { family: "codex", rawId: "beta", pid: 2 },
    ]);
    let current = original;

    await coordinator.refresh(
      async () => snapshot([
        { family: "codex", rawId: "beta", pid: 20, environmentId: "remote" },
        { family: "claude", rawId: "alpha", pid: 10 },
      ], "2026-08-18T01:00:00.000Z"),
      (updater) => {
        current = updater(current);
      },
    );

    expect(current).toBe(original);
  });

  it("applies changes to the live key set and error state", async () => {
    const coordinator = new LiveSessionSnapshotRefreshCoordinator();
    let current = snapshot([{ family: "claude", rawId: "alpha", pid: 1 }]);
    const failed = snapshot(
      [{ family: "claude", rawId: "alpha", pid: 1 }],
      "2026-08-18T01:00:00.000Z",
      "live detection failed",
    );
    const changed = snapshot([{ family: "claude", rawId: "beta", pid: 1 }]);
    const update = (updater: (value: LiveSessionSnapshot) => LiveSessionSnapshot) => {
      current = updater(current);
    };

    await coordinator.refresh(async () => failed, update);
    expect(current).toBe(failed);
    await coordinator.refresh(async () => changed, update);
    expect(current).toBe(changed);
  });

  it("keeps the rendered failure state when only diagnostic text changes", async () => {
    const coordinator = new LiveSessionSnapshotRefreshCoordinator();
    const original = snapshot([], "2026-08-18T00:00:00.000Z", "first failure");
    let current = original;

    await coordinator.refresh(
      async () => snapshot([], "2026-08-18T01:00:00.000Z", "second failure"),
      (updater) => {
        current = updater(current);
      },
    );

    expect(current).toBe(original);
  });

  it("ignores an older refresh that finishes after a newer snapshot", async () => {
    const coordinator = new LiveSessionSnapshotRefreshCoordinator();
    let resolveOlder!: (snapshot: LiveSessionSnapshot) => void;
    const olderResult = new Promise<LiveSessionSnapshot>((resolve) => {
      resolveOlder = resolve;
    });
    let current = snapshot([]);
    const update = (updater: (value: LiveSessionSnapshot) => LiveSessionSnapshot) => {
      current = updater(current);
    };

    const olderRefresh = coordinator.refresh(() => olderResult, update);
    const newer = snapshot([{ family: "codex", rawId: "newer", pid: 2 }]);
    await coordinator.refresh(async () => newer, update);
    resolveOlder(snapshot([{ family: "codex", rawId: "older", pid: 1 }]));
    await olderRefresh;

    expect(current).toBe(newer);
  });

  it("converts the latest rejected refresh into an error snapshot", async () => {
    const coordinator = new LiveSessionSnapshotRefreshCoordinator(
      () => new Date("2026-08-18T02:00:00.000Z"),
    );
    let current = snapshot([]);

    await coordinator.refresh(
      async () => {
        throw new Error("live detection failed");
      },
      (updater) => {
        current = updater(current);
      },
    );

    expect(current).toEqual({
      generatedAt: "2026-08-18T02:00:00.000Z",
      sessions: [],
      error: "live detection failed",
    });
  });
});

function snapshot(
  sessions: LiveSessionSnapshot["sessions"],
  generatedAt = "2026-08-18T00:00:00.000Z",
  error?: string,
): LiveSessionSnapshot {
  return { generatedAt, sessions, ...(error ? { error } : {}) };
}
