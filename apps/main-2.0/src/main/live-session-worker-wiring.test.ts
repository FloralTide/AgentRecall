import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
const viteConfigSource = readFileSync(new URL("../../electron.vite.config.ts", import.meta.url), "utf8");

describe("main process live-session worker wiring", () => {
  it("builds and uses the local live-session worker behind the existing cache", () => {
    expect(viteConfigSource).toContain(
      '"live-session-worker": resolve("src/main/live-session-worker.ts")',
    );
    expect(mainSource).toContain(
      'new LocalLiveSessionService(\n  path.join(__dirname, "live-session-worker.js"),',
    );
    expect(mainSource).toContain(
      "const loadCachedLocalLiveSessionSnapshot = createCachedLiveSessionSnapshotLoader({\n"
      + "  load: (options) => localLiveSessionService.load(options),\n"
      + "});",
    );
  });

  it("keeps remote merging in the main process and stops the worker during quit", () => {
    const localLoad = mainSource.indexOf("loadCachedLocalLiveSessionSnapshot(options)");
    const remoteLoad = mainSource.indexOf("loadRemoteLiveSessions(", localLoad);
    const quitStarted = mainSource.indexOf("automationQuitStarted = true;");
    const stopWorker = mainSource.indexOf("localLiveSessionService.stop();", quitStarted);

    expect(localLoad).toBeGreaterThan(-1);
    expect(remoteLoad).toBeGreaterThan(localLoad);
    expect(stopWorker).toBeGreaterThan(quitStarted);
  });
});
