import { describe, expect, it } from "vitest";
import { fastestNodeUrl, type NodeProbe, rankNodes } from "@/lib/network/node-probe";

/** Pure ranking coverage for smart node selection (sync-speed work). */

function probe(over: Partial<NodeProbe> & { url: string }): NodeProbe {
  return { reachable: true, latencyMs: 100, height: 1000, ...over };
}

describe("rankNodes / fastestNodeUrl", () => {
  it("ranks healthy nodes fastest-first", () => {
    const ranked = rankNodes([
      probe({ url: "slow", latencyMs: 300 }),
      probe({ url: "fast", latencyMs: 40 }),
      probe({ url: "mid", latencyMs: 150 }),
    ]);
    expect(ranked.map((p) => p.url)).toEqual(["fast", "mid", "slow"]);
    expect(
      fastestNodeUrl([probe({ url: "a", latencyMs: 90 }), probe({ url: "b", latencyMs: 20 })]),
    ).toBe("b");
  });

  it("excludes unreachable nodes", () => {
    const ranked = rankNodes([
      probe({ url: "down", reachable: false, latencyMs: null, height: null }),
      probe({ url: "up", latencyMs: 200 }),
    ]);
    expect(ranked.map((p) => p.url)).toEqual(["up"]);
  });

  it("excludes a fast-but-STALE node (tip far behind the best)", () => {
    const ranked = rankNodes(
      [
        probe({ url: "fast-stale", latencyMs: 10, height: 900 }),
        probe({ url: "synced", latencyMs: 250, height: 1000 }),
      ],
      5,
    );
    expect(ranked.map((p) => p.url)).toEqual(["synced"]); // 900 << 1000-5 → dropped
  });

  it("returns null when nothing qualifies", () => {
    expect(
      fastestNodeUrl([probe({ url: "x", reachable: false, latencyMs: null, height: null })]),
    ).toBe(null);
    expect(fastestNodeUrl([])).toBe(null);
  });
});
