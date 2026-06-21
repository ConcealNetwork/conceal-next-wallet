// @vitest-environment node
import { createAccount, createWalletState, type RawWalletV1 } from "conceal-wallet-sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock only the NETWORK seams of the node pool; keep the pure helpers (rankNodes,
// nodeUrlToPoolHost) real so the wiring exercises the genuine ranking/filtering logic.
vi.mock("@/lib/network/smart-nodes", async (orig) => ({
  ...(await orig<typeof import("@/lib/network/smart-nodes")>()),
  fetchSmartNodes: vi.fn(),
}));
vi.mock("@/lib/network/node-probe", async (orig) => ({
  ...(await orig<typeof import("@/lib/network/node-probe")>()),
  probeNodes: vi.fn(),
}));

import { probeNodes } from "@/lib/network/node-probe";
import { fetchSmartNodes } from "@/lib/network/smart-nodes";

const fetchSmartNodesMock = vi.mocked(fetchSmartNodes);
const probeNodesMock = vi.mocked(probeNodes);

type DaemonStub = {
  nodeUrl: string;
  getHeight: () => Promise<number>;
  getNodeFeeAddress: () => Promise<string>;
  sendRawTransaction: (hex: string) => Promise<{ status: string }>;
  getRandomOuts: () => Promise<never[]>;
  getWalletSyncData: (start: number, end: number) => Promise<unknown[]>;
};

function installRuntime(runtimeMod: typeof import("@/lib/services/real-sdk/runtime"), daemon: DaemonStub, options: Record<string, unknown> = {}) {
  const acct = createAccount("english");
  const raw: RawWalletV1 = {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
    options,
    creationHeight: 0,
  };
  runtimeMod._setRuntimeForTest({
    account: acct,
    raw,
    state: { ...createWalletState(acct), scannedHeight: 0 },
    // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
    daemon: daemon as any,
    password: "pw",
    viewOnly: false,
  });
}

/** A home daemon stub that records every (start, end) range it serves and returns no txs. */
function homeDaemon(height: number) {
  const ranges: Array<[number, number]> = [];
  return {
    ranges,
    stub: {
      nodeUrl: "https://explorer.conceal.network/daemon/",
      getHeight: () => Promise.resolve(height),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: async (start: number, end: number) => {
        ranges.push([start, end]);
        return [];
      },
    } as DaemonStub,
  };
}

const realFetch = globalThis.fetch;
afterEach(async () => {
  const { _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
  _setRuntimeForTest(null);
  globalThis.fetch = realFetch;
  vi.clearAllMocks();
});

beforeEach(() => {
  fetchSmartNodesMock.mockReset();
  probeNodesMock.mockReset();
});

describe("syncOnce multi-source wiring (Phase 2)", () => {
  it("does NOT probe the pool for a normal (not-far-behind) sync", async () => {
    const home = homeDaemon(500); // 500 < FAR_BEHIND_THRESHOLD (2000)
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    installRuntime(runtimeMod, home.stub);

    expect(await runtimeMod.sync()).toBe(500);
    expect(fetchSmartNodesMock).not.toHaveBeenCalled();
    // home covered every block on its own.
    const covered = new Set<number>();
    for (const [s, e] of home.ranges) for (let b = s; b < e; b++) covered.add(b);
    for (let b = 1; b < 500; b++) expect(covered.has(b)).toBe(true);
  });

  it("does NOT probe the pool when the wallet uses a custom node, even if far behind", async () => {
    const home = homeDaemon(6000);
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    installRuntime(runtimeMod, home.stub, { customNode: true, nodeUrl: "https://my.node/" });

    expect(await runtimeMod.sync()).toBe(6000);
    expect(fetchSmartNodesMock).not.toHaveBeenCalled();
  });

  it("falls back to single-node (full coverage) when the pool is unavailable", async () => {
    const home = homeDaemon(6000);
    fetchSmartNodesMock.mockRejectedValue(new Error("pool down"));
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    installRuntime(runtimeMod, home.stub);

    expect(await runtimeMod.sync()).toBe(6000);
    expect(fetchSmartNodesMock).toHaveBeenCalled(); // it tried
    // The single-node pipeline still covered every block.
    const covered = new Set<number>();
    for (const [s, e] of home.ranges) for (let b = s; b < e; b++) covered.add(b);
    const missed: number[] = [];
    for (let b = 1; b < 6000; b++) if (!covered.has(b)) missed.push(b);
    expect(missed).toEqual([]);
  });

  it("distributes the bulk across home + peer and keeps the tip on home — full contiguous coverage", async () => {
    const height = 6000;
    const home = homeDaemon(height);
    // One healthy peer in the pool, at the tip.
    fetchSmartNodesMock.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: minimal SmartNode for the test
      { id: "p", name: "peer", url: "https://peer.test/", poolHost: "peer.test" } as any,
    ]);
    probeNodesMock.mockResolvedValue([
      { url: "https://peer.test/", reachable: true, latencyMs: 5, height },
    ]);

    // The peer daemon is a REAL SDK client (built via buildDaemon) that uses global fetch —
    // intercept its get_raw_transactions_by_heights POST and record the heights it served.
    const peerRanges: Array<[number, number]> = [];
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse((init?.body as string) ?? "{}");
      const [s, e] = body.heights as [number, number];
      peerRanges.push([s, e]);
      return { ok: true, json: async () => ({ status: "OK", transactions: [] }) };
      // biome-ignore lint/suspicious/noExplicitAny: minimal fetch stub
    }) as any;

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    installRuntime(runtimeMod, home.stub);

    expect(await runtimeMod.sync()).toBe(height);

    // Union of home + peer ranges must cover EVERY block in [1, height) — no gap, especially at
    // the bulk/tip handoff (bulkEnd = height - 100 = 5900).
    const covered = new Set<number>();
    for (const [s, e] of [...home.ranges, ...peerRanges]) for (let b = s; b < e; b++) covered.add(b);
    const missed: number[] = [];
    for (let b = 1; b < height; b++) if (!covered.has(b)) missed.push(b);
    expect(missed).toEqual([]);

    // The peer actually took bulk work (distribution happened)...
    expect(peerRanges.length).toBeGreaterThan(0);
    expect(peerRanges.every(([, e]) => e <= height - 100)).toBe(true); // peer never served the tip
    // ...and the home node served the TIP region (the last 100 blocks stay on home).
    expect(home.ranges.some(([, e]) => e > height - 100)).toBe(true);
  });
});
