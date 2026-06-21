// @vitest-environment node
import {
  createAccount,
  createWalletState,
  crypto,
  decodeAddress,
  type RawWalletV1,
  transactions as txns,
} from "conceal-wallet-sdk";
import { afterEach, describe, expect, it } from "vitest";

/**
 * Regression coverage for the migration-review fixes (node env — the conceal-lib-js
 * `secretbox` persist path rejects jsdom's cross-realm typed arrays):
 *   - buildState fallback: legacy blob (no creationHeight, no sdkWalletState) → 0.
 *   - sync concurrency guard: two concurrent sync() never run in parallel / lose state.
 *   - inbound message 100-atomic marker gate.
 *   - sendMessage doesn't persist a sent record when broadcast fails.
 */

type DaemonStub = {
  nodeUrl: string;
  getHeight: () => Promise<number>;
  getNodeFeeAddress: () => Promise<string>;
  sendRawTransaction: (hex: string) => Promise<{ status: string }>;
  getRandomOuts: () => Promise<never[]>;
  getWalletSyncData: (start: number, end: number) => Promise<unknown[]>;
};

function legacyRaw(spend: string, view: string, spendPub: string, viewPub: string): RawWalletV1 {
  // An OLD legacy blob: carries lastHeight (the synced tip) but NO creationHeight
  // and NO sdkWalletState — the catastrophic case from review item #1.
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 900_000,
    nonce: "",
    keys: { pub: { spend: spendPub, view: viewPub }, priv: { spend, view } },
    options: {},
  };
}

afterEach(async () => {
  const { _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
  _setRuntimeForTest(null);
});

describe("buildState fallback (review #1)", () => {
  it("seeds scannedHeight at 0 for a legacy blob with no creationHeight, NOT lastHeight", async () => {
    const acct = createAccount("english");
    const raw = legacyRaw(
      acct.keys.spend.sec,
      acct.keys.view.sec,
      acct.keys.spend.pub,
      acct.keys.view.pub,
    );

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    const rt = await runtimeMod.adopt({
      raw,
      keys: {
        pub: { spend: acct.keys.spend.pub, view: acct.keys.view.pub },
        priv: { spend: acct.keys.spend.sec, view: acct.keys.view.sec },
      },
      password: "pw",
    });

    // The fix: fall back to 0 (full re-scan), never to lastHeight (900_000), which
    // would skip the wallet's entire history.
    expect(rt.state.scannedHeight).toBe(0);
  });
});

describe("sync concurrency guard (review #2)", () => {
  it("never runs two scans in parallel and does not lose state", async () => {
    const acct = createAccount("english");
    const networkHeight = 50;

    let activeScans = 0;
    let maxConcurrent = 0;
    let syncDataCalls = 0;
    const daemon: DaemonStub = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(networkHeight),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: async () => {
        activeScans += 1;
        maxConcurrent = Math.max(maxConcurrent, activeScans);
        syncDataCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 10));
        activeScans -= 1;
        return [];
      },
    };

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    runtimeMod._setRuntimeForTest({
      account: acct,
      raw: {
        deposits: [],
        withdrawals: [],
        transactions: [],
        lastHeight: 0,
        nonce: "",
        options: {},
      },
      state: { ...createWalletState(acct), scannedHeight: networkHeight - 1 },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemon as any,
      password: "pw",
      viewOnly: false,
    });

    // Fire two concurrent syncs. They must serialize (never overlap a scan).
    const [h1, h2] = await Promise.all([runtimeMod.sync(), runtimeMod.sync()]);

    expect(h1).toBe(networkHeight);
    expect(h2).toBe(networkHeight);
    expect(maxConcurrent).toBe(1); // no parallel scan
    expect(syncDataCalls).toBeGreaterThanOrEqual(1);
    // State advanced to the tip and was not reverted by a racing writer.
    expect(runtimeMod.getRuntime()?.state.scannedHeight).toBe(networkHeight);
  });
});

describe("sync fetches contiguous block ranges (boundary-gap regression)", () => {
  it("covers every block — no gap at batch boundaries (end-exclusive daemon range)", async () => {
    const acct = createAccount("english");
    const networkHeight = 250; // spans 3 batches of 100 → boundaries at blocks 100, 200
    const calls: Array<[number, number]> = [];
    const daemon: DaemonStub = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(networkHeight),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: async (start: number, end: number) => {
        calls.push([start, end]);
        return [];
      },
    };

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
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
      state: { ...createWalletState(acct), scannedHeight: 0 },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemon as any,
      password: "pw",
      viewOnly: false,
    });

    await runtimeMod.sync();

    // The daemon's `get_raw_transactions_by_heights` range is HALF-OPEN `[start, end)`.
    // Reconstruct exactly which blocks the sync fetched and assert NO block in
    // `[1, networkHeight)` is skipped — especially boundary blocks 100 and 200, which the
    // pre-fix loop (passing an inclusive `endBlock` to a half-open RPC) silently dropped.
    const covered = new Set<number>();
    for (const [start, end] of calls) {
      for (let h = start; h < end; h++) covered.add(h);
    }
    // Cover every block through the top batch's reach (the final batch fetches up to and
    // including `networkHeight` via the clamped half-open `[201, 251)`), so the assertion
    // also pins the very-last-batch boundary, not just the interior 100/200 ones.
    const missed: number[] = [];
    for (let h = 1; h <= networkHeight; h++) if (!covered.has(h)) missed.push(h);
    expect(missed).toEqual([]);
    expect(covered.has(100)).toBe(true);
    expect(covered.has(200)).toBe(true);
    expect(covered.has(networkHeight)).toBe(true);

    // Each batch is contiguous with the previous (start_n === end_{n-1}) — no overlap, no gap.
    const ordered = [...calls].sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < ordered.length; i++) {
      expect(ordered[i][0]).toBe(ordered[i - 1][1]);
    }
  });
});

describe("sync re-scan window covers a full lag depth at the tip (count-overshoot regression)", () => {
  it("re-scans the last 10 real blocks even when scannedHeight is count-based (== height)", async () => {
    const acct = createAccount("english");
    // At the tip the sync advances scannedHeight to `height` (block COUNT, one past the top
    // real block index height-1). A tx late-indexed exactly RESCAN_LAG_BLOCKS (10) blocks back
    // must still fall inside the re-scan window.
    const height = 100;
    const calls: Array<[number, number]> = [];
    const daemon: DaemonStub = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(height),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: async (start: number, end: number) => {
        calls.push([start, end]);
        return [];
      },
    };

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
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
      // Already synced to the tip, with scannedHeight at the COUNT (height), not height-1.
      state: { ...createWalletState(acct), scannedHeight: height },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemon as any,
      password: "pw",
      viewOnly: false,
    });

    await runtimeMod.sync();

    const covered = new Set<number>();
    for (const [start, end] of calls) {
      for (let h = start; h < end; h++) covered.add(h);
    }
    // The top real block is height-1 (99); the 10th block back is height-10 (90). Both — and
    // every block between — must be re-scanned. Pre-fix the window started at height-9 (91),
    // leaving block 90 (height-10) permanently unscanned for a late-indexed tx.
    for (let h = height - 10; h <= height - 1; h++) {
      expect(covered.has(h)).toBe(true);
    }
  });
});

describe("sync fetch is resilient to over-cap batches (split + retry)", () => {
  it("splits a batch that exceeds the daemon range cap and still covers every block", async () => {
    const acct = createAccount("english");
    const networkHeight = 250; // one 250-block batch that must split under the cap
    const CAP = 100; // daemon rejects any range wider than CAP blocks (simulates the real cap)
    const ok: Array<[number, number]> = [];
    const daemon: DaemonStub = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(networkHeight),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: async (start: number, end: number) => {
        if (end - start > CAP) throw new Error("range too large (simulated daemon cap)");
        ok.push([start, end]);
        return [];
      },
    };

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
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
      state: { ...createWalletState(acct), scannedHeight: 0 },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemon as any,
      password: "pw",
      viewOnly: false,
    });

    expect(await runtimeMod.sync()).toBe(networkHeight);

    // Every block is still covered despite the cap — the over-cap batch split into pieces.
    const covered = new Set<number>();
    for (const [start, end] of ok) for (let b = start; b < end; b++) covered.add(b);
    const missed: number[] = [];
    for (let b = 1; b < networkHeight; b++) if (!covered.has(b)) missed.push(b);
    expect(missed).toEqual([]);
    expect(ok.length).toBeGreaterThanOrEqual(2); // it actually split
    expect(ok.every(([s, e]) => e - s <= CAP)).toBe(true); // every served range obeys the cap
    expect(runtimeMod.getRuntime()?.state.scannedHeight).toBe(networkHeight);
  });

  it("propagates the error when even a single-block fetch keeps failing (node down)", async () => {
    const acct = createAccount("english");
    const daemon: DaemonStub = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(50),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: async () => {
        throw new Error("ECONNREFUSED (simulated node down)");
      },
    };

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
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
      state: { ...createWalletState(acct), scannedHeight: 0 },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemon as any,
      password: "pw",
      viewOnly: false,
    });

    // A genuinely-unreachable node must NOT look like a clean sync — the error propagates so the
    // next poll retries from scannedHeight (which stays put), rather than silently skipping blocks.
    await expect(runtimeMod.sync()).rejects.toThrow(/ECONNREFUSED|node down/i);
  });

  it("fetchSyncRange splits an over-cap range and returns blocks in strict ascending order", async () => {
    const CAP = 30; // force several levels of splitting of the 250-block range
    const daemon = {
      getWalletSyncData: async (start: number, end: number) => {
        if (end - start > CAP) throw new Error("over cap");
        // One entry per block, tagged with its height (transaction:null = empty slot).
        const out: Array<{ height: number; hash: string; transaction: null }> = [];
        for (let h = start; h < end; h++) out.push({ height: h, hash: `h${h}`, transaction: null });
        return out;
      },
    };
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
    const txs = await runtimeMod.fetchSyncRange(daemon as any, 1, 251, false);
    const heights = (txs as Array<{ height: number }>).map((t) => t.height);
    // The split-and-concat covers the full half-open range [1, 251) exactly, strictly ascending —
    // the ordering that foldTransaction's sequential state machine depends on.
    expect(heights).toEqual(Array.from({ length: 250 }, (_, i) => i + 1));
  });
});

describe("sync publishes scannedHeight per batch (live progress)", () => {
  it("advances rt.state.scannedHeight between batches, not only at the end", async () => {
    const acct = createAccount("english");
    const networkHeight = 800; // > 3 batches of SYNC_BATCH_BLOCKS (250)
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    const seen: number[] = [];
    const daemon: DaemonStub = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(networkHeight),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: async () => {
        // The cursor visible to a concurrent reader (the polled getWalletInfo) at the
        // moment each batch is fetched. With the pipelined loop the next batch prefetches
        // before the current one's publish, so this lags by one batch but still climbs.
        seen.push(runtimeMod.getRuntime()?.state.scannedHeight ?? -1);
        return [];
      },
    };
    runtimeMod._setRuntimeForTest({
      account: acct,
      raw: {
        deposits: [],
        withdrawals: [],
        transactions: [],
        lastHeight: 0,
        nonce: "",
        options: {},
      },
      state: { ...createWalletState(acct), scannedHeight: 0 },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemon as any,
      password: "pw",
      viewOnly: false,
    });

    const final = await runtimeMod.sync();
    expect(final).toBe(networkHeight);
    expect(runtimeMod.getRuntime()?.state.scannedHeight).toBe(networkHeight);
    // Several batches ran with a non-decreasing published cursor, and at least one fetch
    // observed a PARTIAL cursor (0 < height < tip) — progress is committed per batch, not
    // only when the whole scan ends. (Sync is pipelined: the next batch prefetches before
    // the current batch's publish, so the cursor seen at fetch-time lags by one batch — it
    // still climbs incrementally rather than jumping straight to the final height.)
    expect(seen.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < seen.length; i += 1) {
      expect(seen[i]).toBeGreaterThanOrEqual(seen[i - 1]);
    }
    expect(seen.some((cursor) => cursor > 0 && cursor < networkHeight)).toBe(true);
    // The cursor actually climbed through multiple distinct values, not 0-then-done.
    expect(new Set(seen).size).toBeGreaterThanOrEqual(2);
  });
});

describe("inbound message classification by decryptability (review #6 / #97)", () => {
  it("treats a message tx (owned 100-atomic output) as inbound", async () => {
    const { reconstructReceivedMessage } = await import("@/lib/services/real-sdk/messages-store");
    const alice = createAccount("english");
    const bob = createAccount("english");
    const bobDecoded = decodeAddress(bob.address);

    const built = txns.buildMessageTransaction({
      keys: alice.keys,
      recipient: {
        spendPublicKey: bobDecoded.spendPublicKey,
        viewPublicKey: bobDecoded.viewPublicKey,
      },
      body: "ping",
      changeKeys: { spendPublicKey: alice.keys.spend.pub, viewPublicKey: alice.keys.view.pub },
      unspentOutputs: [fundOwnedOutput(alice, 5_000_000)],
      decoys: [fakeDecoys(5_000_000, 6)],
      fee: 1000,
      mixin: 5,
      ttlUnixSeconds: 0,
      nodeFee: null,
      messageAmount: 100,
    });

    const scanTx: txns.RawTransaction = {
      extra: built.extra,
      vout: built.outputs.map((out) => ({
        amount: out.amount,
        target: { type: "02", data: { key: out.publicKey } },
      })),
      outputIndexes: built.outputs.map((_, i) => 5000 + i),
      hash: built.hash,
      height: 10,
    };

    const inbound = reconstructReceivedMessage(scanTx, bob.keys, { sentHashes: new Set() });
    expect(inbound).not.toBeNull();
    expect(inbound?.body).toBe("ping");
  });

  it("surfaces a message attached to a real-amount payment, not only the 100-atomic marker (#97)", async () => {
    const { reconstructReceivedMessage } = await import("@/lib/services/real-sdk/messages-store");
    const alice = createAccount("english");
    const bob = createAccount("english");
    const bobDecoded = decodeAddress(bob.address);

    // A genuine message to B that rides on a real 50000-atomic payment (NOT the
    // 100-atomic marker). It decrypts with B's spend key, so it IS B's message —
    // the old exact-100 gate wrongly dropped it (the #97 bug).
    const built = txns.buildMessageTransaction({
      keys: alice.keys,
      recipient: {
        spendPublicKey: bobDecoded.spendPublicKey,
        viewPublicKey: bobDecoded.viewPublicKey,
      },
      body: "paid-message",
      changeKeys: { spendPublicKey: alice.keys.spend.pub, viewPublicKey: alice.keys.view.pub },
      unspentOutputs: [fundOwnedOutput(alice, 5_000_000)],
      decoys: [fakeDecoys(5_000_000, 6)],
      fee: 1000,
      mixin: 5,
      ttlUnixSeconds: 0,
      nodeFee: null,
      messageAmount: 50_000, // a real payment amount, not the marker
    });

    const scanTx: txns.RawTransaction = {
      extra: built.extra,
      vout: built.outputs.map((out) => ({
        amount: out.amount,
        target: { type: "02", data: { key: out.publicKey } },
      })),
      outputIndexes: built.outputs.map((_, i) => 5000 + i),
      hash: built.hash,
      height: 10,
    };

    const inbound = reconstructReceivedMessage(scanTx, bob.keys, { sentHashes: new Set() });
    expect(inbound).not.toBeNull();
    expect(inbound?.body).toBe("paid-message");
  });

  it("does NOT surface a message that decrypts for someone else (not addressed to us)", async () => {
    const { reconstructReceivedMessage } = await import("@/lib/services/real-sdk/messages-store");
    const alice = createAccount("english");
    const bob = createAccount("english");
    const carol = createAccount("english");
    const carolDecoded = decodeAddress(carol.address);

    // Alice messages CAROL. Bob scans the same tx: he owns nothing in it and the
    // 0x04 record does not decrypt with his spend key, so it is not his message.
    const built = txns.buildMessageTransaction({
      keys: alice.keys,
      recipient: {
        spendPublicKey: carolDecoded.spendPublicKey,
        viewPublicKey: carolDecoded.viewPublicKey,
      },
      body: "for-carol",
      changeKeys: { spendPublicKey: alice.keys.spend.pub, viewPublicKey: alice.keys.view.pub },
      unspentOutputs: [fundOwnedOutput(alice, 5_000_000)],
      decoys: [fakeDecoys(5_000_000, 6)],
      fee: 1000,
      mixin: 5,
      ttlUnixSeconds: 0,
      nodeFee: null,
      messageAmount: 100,
    });

    const scanTx: txns.RawTransaction = {
      extra: built.extra,
      vout: built.outputs.map((out) => ({
        amount: out.amount,
        target: { type: "02", data: { key: out.publicKey } },
      })),
      outputIndexes: built.outputs.map((_, i) => 5000 + i),
      hash: built.hash,
      height: 10,
    };

    const inbound = reconstructReceivedMessage(scanTx, bob.keys, { sentHashes: new Set() });
    expect(inbound).toBeNull();
  });
});

describe("sendMessage broadcast failure (review #5)", () => {
  it("does not persist a sent record when broadcast throws", async () => {
    const alice = createAccount("english");
    const bob = createAccount("english");

    const daemon: DaemonStub = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(10),
      getNodeFeeAddress: () => Promise.resolve(""),
      // Broadcast rejects → the optimistic sent record must NOT be persisted.
      sendRawTransaction: () => Promise.reject(new Error("relay refused")),
      getRandomOuts: () =>
        Promise.resolve([
          { amount: 5_000_000, outs: fakeDecoys(5_000_000, 6).outs },
        ] as unknown as never[]),
      getWalletSyncData: () => Promise.resolve([]),
    };

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    const fundedState = {
      ...createWalletState(alice),
      scannedHeight: 10,
      outputs: [fundOwnedOutput(alice, 5_000_000)],
    };
    runtimeMod._setRuntimeForTest({
      account: alice,
      raw: {
        deposits: [],
        withdrawals: [],
        transactions: [],
        lastHeight: 0,
        nonce: "",
        options: {},
      },
      state: fundedState,
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemon as any,
      password: "pw",
      viewOnly: false,
    });

    const { realSdkMessageService } = await import("@/lib/services/real-sdk/message.service");
    const { readSentRecords } = await import("@/lib/services/real-sdk/messages-store");

    await expect(
      realSdkMessageService.sendMessage({ recipientAddress: bob.address, body: "hi" }),
    ).rejects.toThrow();

    // No phantom sent record left behind on the blob.
    expect(readSentRecords(runtimeMod.getRuntime()?.raw as RawWalletV1)).toHaveLength(0);
  });
});

describe("createDeposit pending record (#110)", () => {
  it("records a deposit-typed pending entry that locks the deposit's spent inputs", async () => {
    const alice = createAccount("english");
    const funded = fundOwnedOutput(alice, 5_000_000);

    const daemon: DaemonStub = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(2000),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () =>
        Promise.resolve([{ amount: 5_000_000, outs: fakeDecoys(5_000_000, 6).outs }] as never[]),
      getWalletSyncData: () => Promise.resolve([]),
    };

    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => Promise.resolve(store.get(k) ?? null),
      setItem: (k: string, v: string) => {
        store.set(k, v);
        return Promise.resolve();
      },
      removeItem: (k: string) => {
        store.delete(k);
        return Promise.resolve();
      },
      keys: () => Promise.resolve([...store.keys()]),
    };

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    runtimeMod._setRuntimeForTest({
      account: alice,
      raw: {
        deposits: [],
        withdrawals: [],
        transactions: [],
        lastHeight: 0,
        nonce: "",
        options: {},
      },
      state: { ...createWalletState(alice), scannedHeight: 2000, outputs: [funded] },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemon as any,
      // biome-ignore lint/suspicious/noExplicitAny: minimal storage stub for the test
      storage: storage as any,
      password: "pw",
      viewOnly: false,
    });

    const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
    const { readPendingRecords } = await import("@/lib/services/real-sdk/pending-store");
    const { DEPOSIT_TX_FEE } = await import("conceal-wallet-sdk");

    await realSdkDepositService.createDeposit({ amount: 1, durationMonths: 1 });

    const records = readPendingRecords(runtimeMod.getRuntime()?.raw as RawWalletV1);
    expect(records).toHaveLength(1);
    // Typed "deposit" so the optimistic history entry renders correctly (not "send").
    expect(records[0].type).toBe("deposit");
    // The deposited 1 CCX + the network fee is held against the balance.
    expect(records[0].amountAtomic).toBe(1_000_000 + DEPOSIT_TX_FEE);
    // The spent input is locked so a second spend in the mempool window can't reuse it.
    expect(records[0].spentKeyImages).toContain(funded.keyImage);
  });

  it("maps a pending deposit into lockedDeposits, not the pending-outflow bucket (#110 review)", async () => {
    const alice = createAccount("english");
    const funded = fundOwnedOutput(alice, 5_000_000);
    const { mapWalletInfo } = await import("@/lib/services/real-sdk/mappers");
    const { addPendingRecord } = await import("@/lib/services/real-sdk/pending-store");

    const raw = addPendingRecord(
      { deposits: [], withdrawals: [], transactions: [], lastHeight: 0, nonce: "", options: {} },
      {
        hash: "deposit-tx",
        type: "deposit",
        amountAtomic: 1_001_000, // 1 CCX principal + 0.001 fee
        timestampIso: new Date(1_700_000_000_000).toISOString(),
        address: alice.address,
        spentKeyImages: [funded.keyImage],
      },
    );
    const runtime = {
      account: alice,
      raw,
      state: { ...createWalletState(alice), scannedHeight: 2000, outputs: [funded] },
      password: "pw",
      viewOnly: false,
      // biome-ignore lint/suspicious/noExplicitAny: minimal runtime stub for a pure mapper
    } as any;

    const info = mapWalletInfo(runtime, 2000);
    // Deposit principal shows as locked (becoming locked), NOT as a pending outflow.
    expect(info.lockedDeposits.atomic).toBe(1_001_000);
    expect(info.pending.atomic).toBe(0);
    // Its spent input is still excluded from available (double-spend protection).
    expect(info.available.atomic).toBe(0);
  });
});

// --- helpers (shared with real-sdk-messages.test.ts) -------------------------

function fundOwnedOutput(
  owner: ReturnType<typeof createAccount>,
  amount: number,
): txns.SpendableOutput {
  const txKeys = crypto.generateKeys(crypto.randomSeed());
  const txPublicKey = txKeys.pub;
  const outputIndex = 0;
  const derivation = crypto.generateKeyDerivation(txPublicKey, owner.keys.view.sec);
  const publicKey = crypto.derivePublicKey(derivation, outputIndex, owner.keys.spend.pub);
  const ephemeralSecret = crypto.deriveSecretKey(derivation, outputIndex, owner.keys.spend.sec);
  const keyImage = crypto.generateKeyImage(publicKey, ephemeralSecret);
  return { amount, globalIndex: 1000, outputIndex, txPublicKey, publicKey, keyImage };
}

function fakeDecoys(amount: number, count: number): txns.DecoySet {
  const outs = Array.from({ length: count }, (_, i) => ({
    globalIndex: 2000 + i,
    publicKey: crypto.generateKeys(crypto.randomSeed()).pub,
  }));
  return { amount, outs };
}
