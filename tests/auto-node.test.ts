// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Minimal localStorage for node env (the node-preference store guards `typeof localStorage`).
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

beforeEach(() => {
  vi.resetModules(); // refreshAutoNode has module-level `refreshed` state — fresh per test
  vi.stubGlobal("localStorage", fakeLocalStorage());
  vi.stubGlobal("sessionStorage", fakeLocalStorage()); // the auto-node slot lives in sessionStorage
  vi.stubGlobal("window", {}); // refreshAutoNode early-returns when `typeof window === "undefined"`
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.doUnmock("@/lib/network/smart-nodes");
  vi.doUnmock("@/lib/network/node-probe");
});

describe("refreshAutoNode", () => {
  it("probes official + community nodes and caches the fastest", async () => {
    vi.doMock("@/lib/network/smart-nodes", () => ({
      fetchSmartNodes: vi.fn(async () => [{ url: "https://community.node/", name: "C" }]),
    }));
    vi.doMock("@/lib/network/node-probe", () => ({
      // biome-ignore lint/suspicious/noExplicitAny: minimal probe stub
      probeNodes: vi.fn(async (urls: string[]) => urls.map((url) => ({ url }) as any)),
      // Pretend the LAST candidate (the community node) wins.
      // biome-ignore lint/suspicious/noExplicitAny: minimal probe stub
      fastestNodeUrl: vi.fn((probes: any[]) => probes.at(-1)?.url ?? null),
    }));
    const { refreshAutoNode } = await import("@/lib/network/auto-node");
    const { readAutoNode } = await import("@/lib/network/node-preference");

    await refreshAutoNode();
    expect(readAutoNode()).toBe("https://community.node/");
  });

  it("is idempotent per session — probes at most once", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: minimal probe stub
    const probeSpy = vi.fn(async (urls: string[]) => urls.map((url) => ({ url }) as any));
    vi.doMock("@/lib/network/smart-nodes", () => ({ fetchSmartNodes: vi.fn(async () => []) }));
    vi.doMock("@/lib/network/node-probe", () => ({
      probeNodes: probeSpy,
      fastestNodeUrl: vi.fn(() => "https://x/"),
    }));
    const { refreshAutoNode } = await import("@/lib/network/auto-node");

    await refreshAutoNode();
    await refreshAutoNode();
    expect(probeSpy).toHaveBeenCalledTimes(1);
  });

  it("still ranks the official nodes when the community pool is unreachable", async () => {
    vi.doMock("@/lib/network/smart-nodes", () => ({
      fetchSmartNodes: vi.fn(async () => {
        throw new Error("pool down");
      }),
    }));
    vi.doMock("@/lib/network/node-probe", () => ({
      // biome-ignore lint/suspicious/noExplicitAny: minimal probe stub
      probeNodes: vi.fn(async (urls: string[]) => urls.map((url) => ({ url }) as any)),
      // biome-ignore lint/suspicious/noExplicitAny: minimal probe stub
      fastestNodeUrl: vi.fn((probes: any[]) => probes[0]?.url ?? null),
    }));
    const { refreshAutoNode } = await import("@/lib/network/auto-node");
    const { readAutoNode } = await import("@/lib/network/node-preference");
    const { DEFAULT_DAEMON_NODES } = await import("@/lib/config/config");

    await refreshAutoNode();
    // Pool threw → urls fall back to the official list; the first official node ranks fastest here.
    expect(readAutoNode()).toBe(DEFAULT_DAEMON_NODES[0]);
  });

  it("is best-effort — a probe failure never throws and caches nothing", async () => {
    vi.doMock("@/lib/network/smart-nodes", () => ({
      fetchSmartNodes: vi.fn(async () => {
        throw new Error("pool down");
      }),
    }));
    vi.doMock("@/lib/network/node-probe", () => ({
      probeNodes: vi.fn(async () => {
        throw new Error("probe down");
      }),
      fastestNodeUrl: vi.fn(() => null),
    }));
    const { refreshAutoNode } = await import("@/lib/network/auto-node");
    const { readAutoNode } = await import("@/lib/network/node-preference");

    await expect(refreshAutoNode()).resolves.toBeUndefined();
    expect(readAutoNode()).toBeNull();
  });

  it("retries after a transient probe failure (latches only on success)", async () => {
    // First probe throws; the success latch must NOT be set, so a later call retries and succeeds.
    let attempt = 0;
    const probeNodes = vi.fn(async (urls: string[]) => {
      attempt += 1;
      if (attempt === 1) throw new Error("transient blip");
      // biome-ignore lint/suspicious/noExplicitAny: minimal probe stub
      return urls.map((url) => ({ url }) as any);
    });
    vi.doMock("@/lib/network/smart-nodes", () => ({ fetchSmartNodes: vi.fn(async () => []) }));
    vi.doMock("@/lib/network/node-probe", () => ({
      probeNodes,
      // biome-ignore lint/suspicious/noExplicitAny: minimal probe stub
      fastestNodeUrl: vi.fn((probes: any[]) => probes[0]?.url ?? null),
    }));
    const { refreshAutoNode } = await import("@/lib/network/auto-node");
    const { readAutoNode } = await import("@/lib/network/node-preference");
    const { DEFAULT_DAEMON_NODES } = await import("@/lib/config/config");

    await refreshAutoNode();
    expect(readAutoNode()).toBeNull(); // first attempt threw → nothing cached, not latched

    await refreshAutoNode();
    expect(readAutoNode()).toBe(DEFAULT_DAEMON_NODES[0]); // retry succeeded
    expect(probeNodes).toHaveBeenCalledTimes(2);
  });
});
