import { describe, expect, it, vi } from "vitest";
import { fastestNodeUrl, type NodeProbe, probeNode, rankNodes } from "@/lib/network/node-probe";
import { testNodeUrlReachability } from "@/lib/validation/node-url";

vi.mock("@/lib/validation/node-url", () => ({ testNodeUrlReachability: vi.fn() }));

/** Ranking + probe coverage for smart node selection (sync-speed work). */

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

  it("a bogus-high node does not exclude honest nodes (median reference, not max)", () => {
    const probes = [
      probe({ url: "liar", latencyMs: 500, height: 9_999_999 }),
      probe({ url: "honest-a", latencyMs: 40, height: 1000 }),
      probe({ url: "honest-b", latencyMs: 60, height: 1001 }),
    ];
    // Max-based ranking would drop both honest nodes as "stale"; median keeps them.
    expect(rankNodes(probes, 5).map((p) => p.url)).toContain("honest-a");
    expect(fastestNodeUrl(probes, 5)).toBe("honest-a");
  });
});

describe("probeNode", () => {
  it("returns reachable + a non-negative latency + the height for a live node", async () => {
    vi.mocked(testNodeUrlReachability).mockResolvedValueOnce(1234);
    const result = await probeNode("https://node.test/", () => 5);
    expect(result).toMatchObject({ reachable: true, height: 1234 });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("never throws — an unreachable node resolves to nulls", async () => {
    vi.mocked(testNodeUrlReachability).mockRejectedValueOnce(new Error("down"));
    expect(await probeNode("https://down.test/")).toEqual({
      url: "https://down.test/",
      reachable: false,
      latencyMs: null,
      height: null,
    });
  });
});
