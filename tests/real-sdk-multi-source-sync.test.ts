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
  getWalletSyncData: (start: number, end: number, includeMinerTxs?: boolean) => Promise<unknown[]>;
};

/** A coinbase-shaped daemon tx (a `gen` input) for each block in HALF-OPEN [start, end). */
function coinbaseTxsFor(start: number, end: number) {
  const out = [];
  for (let h = start; h < end; h++) {
    out.push({
      transaction: { extra: "", vout: [], vin: [{ gen: { height: h } }] },
      timestamp: 1_700_000_000 + h,
      outputIndexes: [],
      height: h,
      blockHash: "bb".repeat(32),
      hash: `cb${h}`,
      fee: 0,
    });
  }
  return out;
}

function installRuntime(
  runtimeMod: typeof import("@/lib/services/real-sdk/runtime"),
  daemon: DaemonStub,
  options: Record<string, unknown> = {},
) {
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

/**
 * Home daemon stub that behaves like the real daemon: returns a coinbase per block ONLY when
 * `includeMinerTxs` is set (multi-source verification forces it on); otherwise sparse (no owned
 * txs). Records every range it actually serves.
 */
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
      getWalletSyncData: async (start: number, end: number, includeMinerTxs?: boolean) => {
        ranges.push([start, end]);
        // Clamp at the chain height like the real daemon — block `height` (the count) does not
        // exist, so a healthy node never returns it. This makes the tip-batch coverage cap real.
        return includeMinerTxs ? coinbaseTxsFor(start, Math.min(end, height)) : [];
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
  });

  it("idle-at-tip sync completes (does not wedge) when the home clamps the past-tip request", async () => {
    // Liveness guard: the tip batch passes end = height + 1, but block `height` (the count) never
    // exists — a real (clamping) daemon won't return it. The coverage cap must not require it, or
    // every sync would throw at the tip. Here the wallet is already at the tip; one idle poll.
    const height = 500;
    const home = homeDaemon(height); // clamps at height (no block 500)
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    const acct = createAccount("english");
    runtimeMod._setRuntimeForTest({
      account: acct,
      raw: {
        deposits: [],
        withdrawals: [],
        transactions: [],
        lastHeight: 0,
        nonce: "",
        options: {},
        creationHeight: 0,
      },
      state: { ...createWalletState(acct), scannedHeight: height }, // caught up to the tip
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: home.stub as any,
      password: "pw",
      viewOnly: false,
    });

    // Must resolve cleanly (a missing block `height` would throw "incomplete range" and wedge).
    expect(await runtimeMod.sync()).toBe(height);
  });

  it("incremental (not-far-behind) sync uses the LIGHT path — no forced miner-txs", async () => {
    // Regression guard: an already-synced wallet's polls must NOT force include_miner_txs (the
    // coverage marker). Forcing it on every poll fetched a coinbase per block + ran the worker
    // pool for tiny batches — slower than the original sparse path. Heavy machinery is far-behind only.
    const minerFlags: boolean[] = [];
    const height = 300; // < FAR_BEHIND_THRESHOLD (2000)
    const daemon: DaemonStub = {
      nodeUrl: "https://explorer.conceal.network/daemon/",
      getHeight: () => Promise.resolve(height),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: async (_s: number, _e: number, includeMinerTxs?: boolean) => {
        minerFlags.push(Boolean(includeMinerTxs));
        return []; // sparse — the light path
      },
    };
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    installRuntime(runtimeMod, daemon);

    expect(await runtimeMod.sync()).toBe(height);
    expect(fetchSmartNodesMock).not.toHaveBeenCalled(); // no multi-source
    expect(minerFlags.length).toBeGreaterThan(0);
    expect(minerFlags.every((flag) => flag === false)).toBe(true); // never forced miner-txs
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
    const covered = new Set<number>();
    for (const [s, e] of home.ranges) for (let b = s; b < e; b++) covered.add(b);
    const missed: number[] = [];
    for (let b = 1; b < 6000; b++) if (!covered.has(b)) missed.push(b);
    expect(missed).toEqual([]);
  });

  it("distributes the bulk across home + peer and keeps the tip on home — full contiguous coverage", async () => {
    const height = 6000;
    const home = homeDaemon(height);
    fetchSmartNodesMock.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: minimal SmartNode for the test
      { id: "p", name: "peer", url: "https://peer.test/", poolHost: "peer.test" } as any,
    ]);
    probeNodesMock.mockResolvedValue([
      { url: "https://peer.test/", reachable: true, latencyMs: 5, height },
    ]);

    // Peer is a REAL SDK client (built via buildDaemon) using global fetch — serve a coinbase per
    // block so its batches pass coverage verification. Record the ranges it served.
    const peerRanges: Array<[number, number]> = [];
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse((init?.body as string) ?? "{}");
      const [s, e] = body.heights as [number, number];
      peerRanges.push([s, e]);
      return {
        ok: true,
        json: async () => ({ status: "OK", transactions: coinbaseTxsFor(s, Math.min(e, height)) }),
      };
      // biome-ignore lint/suspicious/noExplicitAny: minimal fetch stub
    }) as any;

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    installRuntime(runtimeMod, home.stub);

    expect(await runtimeMod.sync()).toBe(height);

    const covered = new Set<number>();
    for (const [s, e] of [...home.ranges, ...peerRanges])
      for (let b = s; b < e; b++) covered.add(b);
    const missed: number[] = [];
    for (let b = 1; b < height; b++) if (!covered.has(b)) missed.push(b);
    expect(missed).toEqual([]);

    expect(peerRanges.length).toBeGreaterThan(0); // peer took bulk work
    expect(peerRanges.every(([, e]) => e <= height - 100)).toBe(true); // peer never served the tip
    expect(home.ranges.some(([, e]) => e > height - 100)).toBe(true); // home served the tip
  });

  it("single-node DEEP sync verifies coverage too — a truncating home throws (no silent skip)", async () => {
    // The residual hole flagged in #177 re-review: the single-node pipeline (custom node, or the
    // multi-source fallback/tip) also trusts a load-balanced home. Far-behind single-node fetches
    // are now verified, so a home that drops a block answers loud (sync rejects + retries) instead
    // of silently advancing the cursor past it.
    const height = 6000; // far behind → single-node path now verifies
    const home = homeDaemon(height);
    const base = home.stub.getWalletSyncData;
    home.stub.getWalletSyncData = async (s: number, e: number, miner?: boolean) => {
      const txs = (await base(s, e, miner)) as Array<{ height: number }>;
      // Drop the last block of every verified (miner-txs) range the home serves.
      return miner ? txs.filter((t) => t.height !== e - 1) : txs;
    };
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    installRuntime(runtimeMod, home.stub, { customNode: true, nodeUrl: "https://my.node/" });

    await expect(runtimeMod.sync()).rejects.toThrow(/incomplete range/i);
  });

  it("a peer that probes high but FETCHES SHORT cannot skip blocks — verification fails it over to home", async () => {
    // THE fund-safety regression for #177: a peer reports a tip height (passes height-gating) but a
    // load-balanced backend answers with a truncated range. Without coverage verification, the sync
    // would advance past the missing blocks and silently lose any txs there.
    const height = 6000;
    const home = homeDaemon(height);
    fetchSmartNodesMock.mockResolvedValue([
      // biome-ignore lint/suspicious/noExplicitAny: minimal SmartNode for the test
      { id: "p", name: "liar", url: "https://liar.test/", poolHost: "liar.test" } as any,
    ]);
    probeNodesMock.mockResolvedValue([
      { url: "https://liar.test/", reachable: true, latencyMs: 1, height }, // claims the full tip
    ]);

    const homeServedBlocks = new Set<number>();
    globalThis.fetch = (async (_url: string, init?: { body?: string }) => {
      const body = JSON.parse((init?.body as string) ?? "{}");
      const [s, e] = body.heights as [number, number];
      // Truncate: drop the LAST block of every range the peer is asked for.
      return {
        ok: true,
        json: async () => ({ status: "OK", transactions: coinbaseTxsFor(s, Math.max(s, e - 1)) }),
      };
      // biome-ignore lint/suspicious/noExplicitAny: minimal fetch stub
    }) as any;

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    // Wrap the home stub to record exactly which blocks home re-served (with miner txs).
    const baseGet = home.stub.getWalletSyncData;
    home.stub.getWalletSyncData = async (s: number, e: number, miner?: boolean) => {
      if (miner) for (let b = s; b < e; b++) homeServedBlocks.add(b);
      return baseGet(s, e, miner);
    };
    installRuntime(runtimeMod, home.stub);

    expect(await runtimeMod.sync()).toBe(height);

    // Coverage must be complete despite the truncating peer: every block the peer dropped was
    // re-fetched from the home node (verification → failover), so nothing is skipped.
    const covered = new Set<number>(homeServedBlocks);
    // Peer's verified-good batches don't exist here (it truncates every range), so home covers the
    // whole bulk. Assert the full range is accounted for via home + the tip.
    for (const [s, e] of home.ranges) for (let b = s; b < e; b++) covered.add(b);
    const missed: number[] = [];
    for (let b = 1; b < height; b++) if (!covered.has(b)) missed.push(b);
    expect(missed).toEqual([]);
  });
});

describe("fetchVerifiedRange", () => {
  function daemonReturning(txsFor: (s: number, e: number) => unknown[]) {
    return {
      getWalletSyncData: async (s: number, e: number) => txsFor(s, e),
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub
    } as any;
  }

  it("returns the range with coinbases filtered out for a non-mining wallet", async () => {
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    const daemon = daemonReturning((s, e) => coinbaseTxsFor(s, e));
    const result = await runtimeMod.fetchVerifiedRange(daemon, 10, 15, false, 1000);
    // All five blocks were coinbase-only → filtered → nothing to fold, but coverage passed.
    expect(result).toEqual([]);
  });

  it("KEEPS coinbases for a solo-mining wallet (checkMinerTx on)", async () => {
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    const daemon = daemonReturning((s, e) => coinbaseTxsFor(s, e));
    const result = await runtimeMod.fetchVerifiedRange(daemon, 10, 13, true, 1000);
    expect(result).toHaveLength(3); // coinbases kept (heights 10,11,12)
  });

  it("THROWS when a block is missing from the returned range (incomplete node)", async () => {
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    // Drop block 12 from [10, 15).
    const daemon = daemonReturning((s, e) =>
      coinbaseTxsFor(s, e).filter((t) => (t as { height: number }).height !== 12),
    );
    await expect(runtimeMod.fetchVerifiedRange(daemon, 10, 15, false, 1000)).rejects.toThrow(
      /incomplete range|block 12 missing/i,
    );
  });
});
