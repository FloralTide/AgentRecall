import { describe, expect, it } from "vitest";
import { canDeleteSessionLocally } from "./session-environment";

describe("session environment", () => {
  it("treats externally managed Kimi and Qwen sessions as read-only", () => {
    expect(canDeleteSessionLocally({
      environmentKind: "local",
      environmentId: "local",
      source: "kimi-cli",
    })).toBe(false);
    expect(canDeleteSessionLocally({
      environmentKind: "local",
      environmentId: "local",
      source: "qwen-code",
    })).toBe(false);
  });

  it("allows deleting local Pi session files", () => {
    expect(canDeleteSessionLocally({
      environmentKind: "local",
      environmentId: "local",
      source: "pi-cli",
    })).toBe(true);
  });
});
