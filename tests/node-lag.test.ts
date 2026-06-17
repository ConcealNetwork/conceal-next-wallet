import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkCustomNodeLag,
  evaluateNodeLag,
  NODE_LAG_WARN_BLOCKS,
} from "@/lib/network/node-lag";

describe("evaluateNodeLag", () => {
  it("reports the gap behind the reference, clamped at zero", () => {
    expect(evaluateNodeLag(100, 100)).toEqual({ lagBlocks: 0, isLagging: false });
    expect(evaluateNodeLag(110, 100)).toEqual({ lagBlocks: 0, isLagging: false }); // ahead → 0
    expect(evaluateNodeLag(100, 100 + NODE_LAG_WARN_BLOCKS).isLagging).toBe(false); // at threshold
    expect(evaluateNodeLag(100, 100 + NODE_LAG_WARN_BLOCKS + 1)).toEqual({
      lagBlocks: NODE_LAG_WARN_BLOCKS + 1,
      isLagging: true,
    });
  });

  it("honors a custom threshold", () => {
    expect(evaluateNodeLag(100, 103, 2)).toEqual({ lagBlocks: 3, isLagging: true });
    expect(evaluateNodeLag(100, 103, 10)).toEqual({ lagBlocks: 3, isLagging: false });
  });
});

describe("checkCustomNodeLag", () => {
  afterEach(() => vi.unstubAllGlobals());

  // testNodeUrlReachability GETs `{url}getheight` and returns the height. Stub fetch
  // to map each daemon URL to a height.
  function stubHeights(heights: Record<string, number | "fail">) {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: string) => {
        const url = String(input);
        const match = Object.keys(heights).find((u) => url.startsWith(u));
        const value = match ? heights[match] : "fail";
        if (value === "fail") return Promise.reject(new Error("unreachable"));
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ status: "OK", height: value }),
        } as Response);
      }),
    );
  }

  const CUSTOM = "https://my-node.example/daemon/";
  const REF = ["https://explorer.conceal.network/daemon/"];

  it("flags a custom node that lags well behind the reference", async () => {
    stubHeights({ [CUSTOM]: 1000, [REF[0]]: 1100 });
    expect(await checkCustomNodeLag(CUSTOM, REF)).toEqual({ lagBlocks: 100, isLagging: true });
  });

  it("does not flag a custom node in sync with the reference", async () => {
    stubHeights({ [CUSTOM]: 1100, [REF[0]]: 1101 });
    expect(await checkCustomNodeLag(CUSTOM, REF)).toEqual({ lagBlocks: 1, isLagging: false });
  });

  it("returns null when the custom node is itself a reference node (no self-compare)", async () => {
    stubHeights({ [REF[0]]: 1100 });
    expect(await checkCustomNodeLag(REF[0], REF)).toBeNull();
  });

  it("returns null when no reference node is reachable (cannot judge)", async () => {
    stubHeights({ [CUSTOM]: 1000, [REF[0]]: "fail" });
    expect(await checkCustomNodeLag(CUSTOM, REF)).toBeNull();
  });

  it("returns null when the custom node itself is unreachable", async () => {
    stubHeights({ [CUSTOM]: "fail", [REF[0]]: 1100 });
    expect(await checkCustomNodeLag(CUSTOM, REF)).toBeNull();
  });

  it("uses the highest reachable reference height as the tip", async () => {
    const refs = ["https://ref-a.example/daemon/", "https://ref-b.example/daemon/"];
    stubHeights({ [CUSTOM]: 1000, [refs[0]]: 1050, [refs[1]]: 1200 });
    expect(await checkCustomNodeLag(CUSTOM, refs)).toEqual({ lagBlocks: 200, isLagging: true });
  });
});
