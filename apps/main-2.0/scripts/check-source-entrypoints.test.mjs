import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("production source modules are reachable from declared entry points", () => {
  const result = spawnSync(process.execPath, ["scripts/check-source-entrypoints.mjs"], {
    cwd: appRoot,
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Source entrypoint check passed/);
});
