import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");

describe("main process session query wiring", () => {
  it("keeps heavy catalog and usage reads off the Electron main thread", () => {
    expect(source).toContain(
      'new LocalSessionQueryService(path.join(__dirname, "session-query-worker.js")',
    );
    expect(source).toContain(
      'sessionCatalogQueries().searchSessionPage(visibleSearchOptions(options))',
    );
    expect(source).toContain(
      'sessionStatsQueries().getStats(visibleStatsOptions(options))',
    );
    expect(source).toContain(
      'sessionStatsQueries().getStatsTrend(visibleStatsOptions(options))',
    );
    expect(source).toContain(
      'sessionCatalogQueries().listProjects({ ...options, ...visibleProjectOptions() })',
    );

    expect(source).not.toContain(
      'ipcMain.handle("search:session-page", (_event, options: SearchOptions) => store.searchSessionPage',
    );
    expect(source).not.toContain(
      'ipcMain.handle("stats:get", (_event, options?: SessionStatsOptions) => store.getStats',
    );
    expect(source).not.toContain(
      'ipcMain.handle("stats:trend", (_event, options?: SessionStatsOptions) => store.getStatsTrend',
    );
  });

  it("isolates usage scans from interactive catalog queries and stops both workers", () => {
    expect(source).toContain(
      "localSessionStatsQueryService ??= createLocalSessionQueryService()",
    );
    expect(source).toContain("localSessionQueryService?.stop()");
    expect(source).toContain("localSessionStatsQueryService?.stop()");
  });

  it("does not lazily create query workers after shutdown has started", () => {
    expect(source).toContain("if (quitStarted || localSessionWorkersStopping)");
    expect(source).toMatch(
      /function createLocalSessionQueryService\(\): LocalSessionQueryService \{\s+assertLocalSessionWorkersCanStart\(\);/,
    );
    expect(source).toMatch(
      /function sessionCatalogQueries\(\): LocalSessionQueryService \{\s+assertLocalSessionWorkersCanStart\(\);/,
    );
    expect(source).toMatch(
      /function sessionStatsQueries\(\): LocalSessionQueryService \{[\s\S]*?assertLocalSessionWorkersCanStart\(\);\s+localSessionStatsQueryService \?\?=/,
    );
  });
});
