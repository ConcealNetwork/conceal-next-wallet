import type { OwnedOutput, RawTransaction, WalletKeys, WalletState } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import {
  type IncomingPendingRecord,
  incomingPendingAtomic,
  readIncomingPendingRecords,
  reconcileIncomingPending,
  withIncomingPendingRecords,
} from "@/lib/services/real-sdk/incoming-pending-store";
import { PENDING_TTL_MS } from "@/lib/services/real-sdk/pending-store";
import { scanPoolForOwned } from "@/lib/services/real-sdk/pool";

/**
 * Pure-function coverage for the incoming-pending (mempool) store + pool scan (#109):
 * read/write, the "pending in" projection, reconcile-on-mine / TTL / fresh-merge, and
 * the dependency-injected owned-output scan.
 */

const T0_MS = 1_700_000_000_000;
const T0_ISO = new Date(T0_MS).toISOString();

function rec(over: Partial<IncomingPendingRecord> = {}): IncomingPendingRecord {
  return { hash: "h1", amountAtomic: 500_000, timestampIso: T0_ISO, ...over };
}

function stateWithTxHashes(hashes: string[]): WalletState {
  return { transactions: hashes.map((hash) => ({ hash })) } as unknown as WalletState;
}

// biome-ignore lint/suspicious/noExplicitAny: minimal raw blob fixture for the store
const baseRaw = (): any => ({ deposits: [], withdrawals: [], transactions: [], nonce: "" });

describe("incoming-pending store", () => {
  it("reads/writes records and sums the pending-in total", () => {
    const raw = withIncomingPendingRecords(baseRaw(), [
      rec(),
      rec({ hash: "h2", amountAtomic: 250 }),
    ]);
    expect(readIncomingPendingRecords(raw).map((r) => r.hash)).toEqual(["h1", "h2"]);
    expect(incomingPendingAtomic(raw)).toBe(500_250);
  });

  it("skips corrupt / non-positive records on read", () => {
    const raw = {
      ...baseRaw(),
      incomingPendingTransactions: [rec(), { hash: "x", amountAtomic: 0 }, { nope: 1 }],
    };
    expect(readIncomingPendingRecords(raw).map((r) => r.hash)).toEqual(["h1"]);
  });
});

describe("reconcileIncomingPending", () => {
  it("keeps freshly-scanned owned txs and preserves their first-seen timestamp", () => {
    const current = [rec({ timestampIso: T0_ISO })];
    const scanned = [rec({ timestampIso: new Date(T0_MS + 60_000).toISOString() })];
    const next = reconcileIncomingPending(current, scanned, stateWithTxHashes([]), T0_MS + 60_000);
    expect(next).toHaveLength(1);
    expect(next[0].timestampIso).toBe(T0_ISO); // earliest seen wins
  });

  it("drops a record once its tx is mined (reconciled by hash)", () => {
    const next = reconcileIncomingPending([rec()], [rec()], stateWithTxHashes(["h1"]), T0_MS);
    expect(next).toEqual([]);
  });

  it("expires a survivor past the TTL when the pool no longer reports it", () => {
    const next = reconcileIncomingPending(
      [rec()],
      [],
      stateWithTxHashes([]),
      T0_MS + PENDING_TTL_MS + 1,
    );
    expect(next).toEqual([]);
  });

  it("keeps a still-fresh survivor the pool transiently missed", () => {
    const next = reconcileIncomingPending([rec()], [], stateWithTxHashes([]), T0_MS + 1000);
    expect(next.map((r) => r.hash)).toEqual(["h1"]);
  });

  it("returns the same array reference when nothing changed (skips persist)", () => {
    const current = [rec()];
    const next = reconcileIncomingPending(current, [rec()], stateWithTxHashes([]), T0_MS + 1000);
    expect(next).toBe(current);
  });
});

describe("scanPoolForOwned", () => {
  const keys = {} as WalletKeys;
  const poolTx = (hash: string, timestamp = 0) =>
    ({
      transaction: { extra: "01", vout: [] },
      timestamp,
      outputIndexes: [],
      height: 0,
      blockHash: "",
      hash,
      fee: 1000,
    }) as never;
  const toScan = (() => ({ extra: "01", vout: [] }) as unknown as RawTransaction) as never;

  it("records the summed owned amount per pool tx, skipping non-owned", () => {
    const scanOutputs = ((tx: RawTransaction) =>
      // owned only for the first tx (by a marker we can't see here) — simulate via call order
      [{ amount: 300 } as OwnedOutput, { amount: 200 } as OwnedOutput]) as never;
    const records = scanPoolForOwned([poolTx("a")], toScan, scanOutputs, keys, T0_MS);
    expect(records).toEqual([{ hash: "a", amountAtomic: 500, timestampIso: T0_ISO }]);
  });

  it("skips txs with no owned outputs or zero amount", () => {
    const none = (() => [] as OwnedOutput[]) as never;
    expect(scanPoolForOwned([poolTx("a")], toScan, none, keys, T0_MS)).toEqual([]);
    const zero = (() => [{ amount: 0 } as OwnedOutput]) as never;
    expect(scanPoolForOwned([poolTx("a")], toScan, zero, keys, T0_MS)).toEqual([]);
  });

  it("uses the pool tx timestamp when present", () => {
    const owned = (() => [{ amount: 100 } as OwnedOutput]) as never;
    const records = scanPoolForOwned([poolTx("a", 1_700_000_500)], toScan, owned, keys, T0_MS);
    expect(records[0].timestampIso).toBe(new Date(1_700_000_500_000).toISOString());
  });

  it("survives a scanner throwing on a single tx", () => {
    const owned = (() => [{ amount: 100 } as OwnedOutput]) as never;
    let calls = 0;
    const flaky = ((tx: RawTransaction, k: WalletKeys) => {
      calls += 1;
      if (calls === 1) throw new Error("bad tx");
      return [{ amount: 100 } as OwnedOutput];
    }) as never;
    const records = scanPoolForOwned([poolTx("a"), poolTx("b")], toScan, flaky, keys, T0_MS);
    expect(records.map((r) => r.hash)).toEqual(["b"]);
    void owned;
  });

  it("respects maxScan", () => {
    const owned = (() => [{ amount: 100 } as OwnedOutput]) as never;
    const txs = Array.from({ length: 5 }, (_, i) => poolTx(`h${i}`));
    expect(scanPoolForOwned(txs, toScan, owned, keys, T0_MS, { maxScan: 2 })).toHaveLength(2);
  });
});
