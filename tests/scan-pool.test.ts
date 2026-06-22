// @vitest-environment node
import { createAccount, crypto as cc } from "conceal-wallet-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { type DaemonRawTransaction, scanRawTransaction } from "@/lib/services/real-sdk/scan";
import { scanBatch, terminateScanPool } from "@/lib/services/real-sdk/scan-pool";
import { coinbaseTxsFor } from "./test-helpers";

const me = createAccount("english");
const keys = me.keys;

// Worker-pool size requested by the "Sync speed" profile. Ultra-Violence/Nightmare pass a positive
// count; gentle levels pass 0 (in-thread). desiredPoolSize() clamps to the machine's cores.
const POOL = 8;
const INTHREAD = 0;

/** A daemon tx carrying a REAL stealth output owned by `me` — produces a POPULATED scan result. */
function ownedTx(height: number): DaemonRawTransaction {
  const txKey = cc.generateKeys(cc.scReduce32("bb".repeat(32)));
  const derivation = cc.generateKeyDerivation(keys.view.pub, txKey.sec);
  const ownedKey = cc.derivePublicKey(derivation, 0, keys.spend.pub);
  return {
    transaction: {
      extra: `01${txKey.pub}`,
      vout: [{ amount: 1_000_000, target: { type: "02", data: { key: ownedKey } } }],
      vin: [],
    },
    timestamp: 1_700_000_000 + height,
    outputIndexes: [7],
    height,
    blockHash: "bb".repeat(32),
    hash: `owned${height}`,
    fee: 0,
  };
}

// biome-ignore lint/suspicious/noExplicitAny: test reaches into the global to install a fake Worker
const g = globalThis as any;

/** Counts how many fake Workers were constructed — lets a test PROVE the in-thread gate (0 = no pool). */
let workerSpawns = 0;

afterEach(() => {
  terminateScanPool();
  g.Worker = undefined;
  workerSpawns = 0;
});

/** Drives the real scan in a fake worker — proves the worker path === the in-thread path. */
class EchoWorker {
  // biome-ignore lint/suspicious/noExplicitAny: minimal worker stub
  private listeners: ((e: any) => void)[] = [];
  constructor() {
    workerSpawns += 1;
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal worker stub
  addEventListener(type: string, fn: (e: any) => void) {
    if (type === "message") this.listeners.push(fn);
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal worker stub
  postMessage(msg: any) {
    // Round-trip through structuredClone to mirror the REAL postMessage boundary — proves both the
    // request (rawTxs + keys) and the response (RawScanResult[]) are structured-cloneable (GLM F3).
    const req = structuredClone(msg);
    queueMicrotask(() => {
      try {
        const results = req.rawTxs.map(
          // biome-ignore lint/suspicious/noExplicitAny: raw tx from the message
          (tx: any) => scanRawTransaction(tx, req.keys),
        );
        const out = structuredClone({ id: req.id, results });
        for (const l of this.listeners) l({ data: out });
      } catch (error) {
        // A non-cloneable result → mirror the real worker's DataCloneError handling.
        for (const l of this.listeners) l({ data: { id: req.id, error: String(error) } });
      }
    });
  }
  terminate() {}
}

/** Always reports an error → exercises the per-chunk in-thread fallback. */
class ErrorWorker {
  // biome-ignore lint/suspicious/noExplicitAny: minimal worker stub
  private listeners: ((e: any) => void)[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: minimal worker stub
  addEventListener(type: string, fn: (e: any) => void) {
    if (type === "message") this.listeners.push(fn);
  }
  // biome-ignore lint/suspicious/noExplicitAny: minimal worker stub
  postMessage(msg: any) {
    queueMicrotask(() => {
      for (const l of this.listeners) l({ data: { id: msg.id, error: "boom" } });
    });
  }
  terminate() {}
}

/**
 * Fails to LOAD — fires an `error` event (as a worker does when its chunk can't bootstrap) and NEVER
 * replies to a message. Exercises the {@link failPool} path: every chunk must fall back in-thread
 * IMMEDIATELY, not after CHUNK_TIMEOUT_MS. The error fires on the first postMessage, by which point
 * all chunk requests are already registered (scanBatch posts to every worker synchronously).
 */
class LoadErrorWorker {
  // biome-ignore lint/suspicious/noExplicitAny: minimal worker stub
  private errorListeners: ((e: any) => void)[] = [];
  // biome-ignore lint/suspicious/noExplicitAny: minimal worker stub
  addEventListener(type: string, fn: (e: any) => void) {
    if (type === "error" || type === "messageerror") this.errorListeners.push(fn);
  }
  postMessage() {
    queueMicrotask(() => {
      // Mirror a real Worker `error` ErrorEvent — the handler calls `preventDefault()` on it.
      for (const l of this.errorListeners) l({ preventDefault() {} });
    });
  }
  terminate() {}
}

describe("scanBatch — in-thread (workers = 0)", () => {
  it("returns results aligned 1:1 with input, identical to a direct scan", async () => {
    const txs = coinbaseTxsFor(1, 6) as Parameters<typeof scanBatch>[0]; // heights 1..5
    const got = await scanBatch(txs, keys, INTHREAD);
    expect(got).toEqual(txs.map((t) => scanRawTransaction(t, keys)));
    expect(got.map((r) => r?.scanTx.height)).toEqual([1, 2, 3, 4, 5]);
  });

  it("returns [] for an empty batch", async () => {
    expect(await scanBatch([], keys, POOL)).toEqual([]);
  });

  it("scans in-thread and spawns NO worker when workers = 0, even with a Worker present", async () => {
    g.Worker = EchoWorker;
    const txs = coinbaseTxsFor(1, 13) as Parameters<typeof scanBatch>[0];
    const got = await scanBatch(txs, keys, INTHREAD);
    // The gate proof: getPool() returns BEFORE constructing any Worker when workers <= 0.
    expect(workerSpawns).toBe(0);
    expect(got).toEqual(txs.map((t) => scanRawTransaction(t, keys)));
    expect(got).toHaveLength(12);
  });
});

describe("scanBatch — worker pool (workers > 0)", () => {
  it("distributes across workers and reassembles IN ORDER, identical to in-thread", async () => {
    g.Worker = EchoWorker;
    const txs = coinbaseTxsFor(1, 31) as Parameters<typeof scanBatch>[0]; // 30 txs across the pool
    const got = await scanBatch(txs, keys, POOL);
    // A positive worker count genuinely spawned the pool (counterpart to the in-thread proof).
    expect(workerSpawns).toBeGreaterThan(0);
    // Worker path is byte-identical to the in-thread scan (same deterministic scanRawTransaction)...
    expect(got).toEqual(txs.map((t) => scanRawTransaction(t, keys)));
    // ...and strictly in ascending input order despite being split across chunks.
    expect(got.map((r) => r?.scanTx.height)).toEqual(txs.map((t) => t.height));
  });

  it("falls back to an in-thread scan for a chunk whose worker errors (no data loss)", async () => {
    g.Worker = ErrorWorker;
    const txs = coinbaseTxsFor(1, 13) as Parameters<typeof scanBatch>[0];
    const got = await scanBatch(txs, keys, POOL);
    // Every worker errors → every chunk falls back in-thread → result still complete + correct.
    expect(got).toEqual(txs.map((t) => scanRawTransaction(t, keys)));
    expect(got).toHaveLength(12);
  });

  it("a worker that fails to LOAD falls the whole pool back in-thread immediately (no 60s wait)", async () => {
    g.Worker = LoadErrorWorker;
    const txs = coinbaseTxsFor(1, 13) as Parameters<typeof scanBatch>[0];
    // If the load-error wiring were missing, this would hang until CHUNK_TIMEOUT_MS (60s) and the
    // test would time out. It resolving at all proves the immediate `failPool` fallback works.
    const got = await scanBatch(txs, keys, POOL);
    expect(got).toEqual(txs.map((t) => scanRawTransaction(t, keys)));
    expect(got).toHaveLength(12);
  });
});

describe("RawScanResult is structured-cloneable (postMessage safety)", () => {
  it("a POPULATED result (owned output) survives structuredClone unchanged", () => {
    const result = scanRawTransaction(ownedTx(42), keys);
    expect(result?.ownedOutputs).toHaveLength(1); // genuinely populated, not an empty scan
    // structuredClone is exactly what postMessage uses; it must not throw and must round-trip.
    expect(() => structuredClone(result)).not.toThrow();
    expect(structuredClone(result)).toEqual(result);
  });

  it("worker path returns a populated owned result identical to in-thread (via clone round-trip)", async () => {
    g.Worker = EchoWorker; // EchoWorker structuredClones both request + response
    const txs = [ownedTx(10), ownedTx(11), ownedTx(12)] as Parameters<typeof scanBatch>[0];
    const got = await scanBatch(txs, keys, POOL);
    expect(got).toEqual(txs.map((t) => scanRawTransaction(t, keys)));
    expect(got.every((r) => r?.ownedOutputs.length === 1)).toBe(true);
  });
});
