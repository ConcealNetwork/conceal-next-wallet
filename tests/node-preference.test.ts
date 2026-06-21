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
  const { setPreferredNode } = await import("@/lib/network/node-preference");
  setPreferredNode(null); // reset the module's in-memory cache between tests
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

describe("nodeUrlFromRaw precedence", () => {
  it("custom node > device-local preferred > default", async () => {
    const { nodeUrlFromRaw, defaultNodeUrl } = await import("@/lib/services/real-sdk/runtime");
    const { setPreferredNode } = await import("@/lib/network/node-preference");
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

    // Device-local preferred node is honored.
    setPreferredNode("https://preferred.node/");
    expect(nodeUrlFromRaw(base)).toBe("https://preferred.node/");

    // An explicit per-wallet custom node still wins over the device-local preference.
    const custom = { ...base, options: { customNode: true, nodeUrl: "https://custom.node/" } };
    expect(nodeUrlFromRaw(custom)).toBe("https://custom.node/");
  });
});
