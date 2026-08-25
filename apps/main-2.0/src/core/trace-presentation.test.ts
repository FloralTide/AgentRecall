import { describe, expect, it } from "vitest";
import { traceCompactionSummary, tracePresentation } from "./trace-presentation";

describe("tracePresentation", () => {
  it("classifies Qwen thoughts as reasoning", () => {
    expect(tracePresentation({ kind: "event", eventType: "qwen.thought" })).toEqual({
      category: "reasoning",
      visibility: "timeline",
    });
  });
});

describe("traceCompactionSummary", () => {
  it("returns displayable compact statistics", () => {
    expect(traceCompactionSummary({
      compaction: {
        itemCount: 27,
        itemTypes: { message: 26, function_call: 0, compaction: 1 },
        opaqueCompaction: true,
      },
    })).toEqual({
      itemCount: 27,
      itemTypes: [
        { type: "message", count: 26 },
        { type: "compaction", count: 1 },
      ],
      opaqueCompaction: true,
    });
  });

  it("rejects malformed compact statistics", () => {
    expect(traceCompactionSummary(undefined)).toBeNull();
    expect(traceCompactionSummary({ compaction: { itemCount: "27" } })).toBeNull();
  });
});
