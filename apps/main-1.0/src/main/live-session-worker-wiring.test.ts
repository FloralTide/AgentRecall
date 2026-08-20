import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const buildConfig = readFileSync(new URL("../../electron.vite.config.ts", import.meta.url), "utf8");

describe("main process live session worker wiring", () => {
  it("loads local live sessions through the persistent worker without changing cache or remote merging", () => {
    expect(buildConfig).toContain(
      '"live-session-worker": resolve("src/main/live-session-worker.ts")',
    );
    expect(source).toContain(
      'new LocalLiveSessionService(\n    path.join(__dirname, "live-session-worker.js"),',
    );
    expect(source).toContain("load: (options) => localLiveSessions().load(options)");
    expect(source).toContain("loadCachedLocalLiveSessionSnapshot(options)");
    expect(source).toContain("loadRemoteLiveSessions(");
  });

  it("stops the live session worker during application shutdown", () => {
    expect(source).toContain("localLiveSessionService?.stop()");
    expect(source.indexOf("localSessionWorkersStopping = true")).toBeLessThan(
      source.indexOf("localLiveSessionService?.stop()"),
    );
  });
});
