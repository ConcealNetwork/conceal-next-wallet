// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal localStorage for node env (the store + readPreferredNode guard `typeof localStorage`).
function fakeLocalStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
    clear: () => map.clear(),
  };
}

beforeEach(async () => {
  vi.stubGlobal("localStorage", fakeLocalStorage()); // Node's real localStorage global is read-only
  vi.stubGlobal("sessionStorage", fakeLocalStorage()); // the auto-node slot lives in sessionStorage
  const { setPreferredNode, setAutoNode } = await import("@/lib/network/node-preference");
  setPreferredNode(null); // reset the module's in-memory cache between tests
  setAutoNode(null);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("preferred-node store", () => {
  it("set / read / clear persists to localStorage", async () => {
    const { setPreferredNode, getPreferredNode, readPreferredNode } = await import(
      "@/lib/network/node-preference"
    );
    expect(readPreferredNode()).toBeNull();
    setPreferredNode("https://my.node/");
    expect(readPreferredNode()).toBe("https://my.node/");
    expect(getPreferredNode()).toBe("https://my.node/");
    setPreferredNode(null);
    expect(readPreferredNode()).toBeNull();
  });

  it("treats blank/whitespace as unset", async () => {
    const { setPreferredNode, readPreferredNode } = await import("@/lib/network/node-preference");
    setPreferredNode("   ");
    expect(readPreferredNode()).toBeNull();
  });
});

describe("auto-node store", () => {
  it("set / read / clear persists to localStorage", async () => {
    const { setAutoNode, readAutoNode } = await import("@/lib/network/node-preference");
    expect(readAutoNode()).toBeNull();
    setAutoNode("https://fast.node/");
    expect(readAutoNode()).toBe("https://fast.node/");
    setAutoNode(null);
    expect(readAutoNode()).toBeNull();
  });

  it("treats blank/whitespace as unset", async () => {
    const { setAutoNode, readAutoNode } = await import("@/lib/network/node-preference");
    setAutoNode("   ");
    expect(readAutoNode()).toBeNull();
  });
});

describe("nodeUrlFromRaw precedence", () => {
  it("custom node > device-local preferred > auto-fastest > default", async () => {
    const { nodeUrlFromRaw, defaultNodeUrl } = await import("@/lib/services/real-sdk/runtime");
    const { setPreferredNode, setAutoNode } = await import("@/lib/network/node-preference");
    // biome-ignore lint/suspicious/noExplicitAny: minimal raw blob for the test
    const base: any = {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
      options: {},
    };

    // Nothing set → default node.
    expect(nodeUrlFromRaw(base)).toBe(defaultNodeUrl());

    // The auto-probed fastest node is used when nothing more specific is set.
    setAutoNode("https://auto.node/");
    expect(nodeUrlFromRaw(base)).toBe("https://auto.node/");

    // An explicit device-local pick wins over the auto-fastest node.
    setPreferredNode("https://preferred.node/");
    expect(nodeUrlFromRaw(base)).toBe("https://preferred.node/");

    // A per-wallet custom node still wins over everything.
    const custom = { ...base, options: { customNode: true, nodeUrl: "https://custom.node/" } };
    expect(nodeUrlFromRaw(custom)).toBe("https://custom.node/");
  });
});
