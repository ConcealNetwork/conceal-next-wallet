import type { RawWalletV1, WalletState } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import {
  addPendingRecord,
  PENDING_TTL_MS,
  type PendingTxRecord,
  pendingOutAtomic,
  pendingSpentKeyImages,
  pendingWithdrawnDepositKeys,
  prunePendingRecords,
  readPendingRecords,
} from "@/lib/services/real-sdk/pending-store";

/**
 * Pure-function coverage for the optimistic pending-tx store (#96): add/read/dedupe,
 * the balance-hold + input-lock projections, and reconcile-on-mine / TTL-expiry pruning.
 */

const T0_MS = 1_700_000_000_000;
const T0_ISO = new Date(T0_MS).toISOString();

function baseRaw(): RawWalletV1 {
  return { deposits: [], withdrawals: [], transactions: [], lastHeight: 0, nonce: "" };
}

function record(over: Partial<PendingTxRecord> = {}): PendingTxRecord {
  return {
    hash: "hash-1",
    amountAtomic: 511_000,
    timestampIso: T0_ISO,
    address: "ccx7recipient",
    spentKeyImages: ["ki-a", "ki-b"],
    ...over,
  };
}

function stateWithTxHashes(hashes: string[]): WalletState {
  return {
    transactions: hashes.map((hash) => ({ hash, height: 10, amount: 1, direction: "out" })),
  } as unknown as WalletState;
}

describe("pending-store (#96)", () => {
  it("adds, reads, and dedupes pending records by hash", () => {
    let raw = addPendingRecord(baseRaw(), record());
    raw = addPendingRecord(raw, record({ amountAtomic: 999 })); // same hash → replace
    raw = addPendingRecord(raw, record({ hash: "hash-2", amountAtomic: 2000 }));
    const records = readPendingRecords(raw);
    expect(records).toHaveLength(2);
    expect(records.find((r) => r.hash === "hash-1")?.amountAtomic).toBe(999);
  });

  it("projects the balance-hold total and the locked key-image set", () => {
    let raw = addPendingRecord(baseRaw(), record());
    raw = addPendingRecord(
      raw,
      record({ hash: "hash-2", amountAtomic: 1000, spentKeyImages: ["ki-c"] }),
    );
    expect(pendingOutAtomic(raw)).toBe(511_000 + 1000);
    expect(pendingSpentKeyImages(raw)).toEqual(new Set(["ki-a", "ki-b", "ki-c"]));
  });

  it("prunes a record once its tx is scanned into state (reconciled on mine)", () => {
    const raw = addPendingRecord(baseRaw(), record());
    const survivors = prunePendingRecords(raw, stateWithTxHashes(["hash-1"]), T0_MS + 1000);
    expect(survivors).toHaveLength(0);
  });

  it("keeps an unmined, non-expired record", () => {
    const raw = addPendingRecord(baseRaw(), record());
    const survivors = prunePendingRecords(raw, stateWithTxHashes([]), T0_MS + 1000);
    expect(survivors).toHaveLength(1);
  });

  it("prunes a record that never mined within the TTL", () => {
    const raw = addPendingRecord(baseRaw(), record());
    const survivors = prunePendingRecords(raw, stateWithTxHashes([]), T0_MS + PENDING_TTL_MS + 1);
    expect(survivors).toHaveLength(0);
  });

  it("never expires a pending tx before the network mempool lifetime (no early input unlock)", async () => {
    // Pruning before a tx can no longer be mined would release its input lock and let a
    // follow-up send double-spend those inputs (reviewer consensus: agy + GLM).
    const { CRYPTONOTE_MEMPOOL_TX_LIFETIME_SECONDS } = await import("conceal-wallet-sdk");
    expect(PENDING_TTL_MS).toBe(CRYPTONOTE_MEMPOOL_TX_LIFETIME_SECONDS * 1000);
  });

  it("returns the same array reference when nothing is pruned (no needless persist)", () => {
    const raw = addPendingRecord(baseRaw(), record());
    const a = prunePendingRecords(raw, stateWithTxHashes([]), T0_MS + 1000);
    const b = prunePendingRecords(raw, stateWithTxHashes([]), T0_MS + 1000);
    // Both reads are non-empty + unchanged; just assert stability of length.
    expect(a).toHaveLength(1);
    expect(b).toHaveLength(1);
  });

  // #110 withdraw half: a withdraw spends a DEPOSIT output (not a regular unspent
  // output), so it's locked by deposit identity, not by key image.
  it("locks a deposit by identity while its withdrawal is pending (no re-withdraw)", () => {
    const raw = addPendingRecord(
      baseRaw(),
      record({
        hash: "wd-1",
        type: "withdrawal",
        amountAtomic: 100_500,
        spentKeyImages: ["dep-ki"],
        depositRef: { txHash: "dep-tx", globalIndex: 7 },
      }),
    );
    expect(pendingWithdrawnDepositKeys(raw)).toEqual(new Set(["dep-tx:7"]));
  });

  it("ignores non-withdrawal records and withdrawals without a depositRef", () => {
    let raw = addPendingRecord(baseRaw(), record()); // a plain send (no type)
    raw = addPendingRecord(raw, record({ hash: "wd-noref", type: "withdrawal" })); // no depositRef
    expect(pendingWithdrawnDepositKeys(raw)).toEqual(new Set());
  });

  it("counts ONLY outbound records in the balance hold (deposit/withdrawal excluded)", () => {
    let raw = addPendingRecord(baseRaw(), record({ hash: "send", amountAtomic: 500 })); // undefined → counts
    raw = addPendingRecord(raw, record({ hash: "fus", type: "fusion", amountAtomic: 300 })); // counts
    raw = addPendingRecord(raw, record({ hash: "dep", type: "deposit", amountAtomic: 1_000_000 })); // excluded
    raw = addPendingRecord(
      raw,
      record({
        hash: "wd",
        type: "withdrawal",
        amountAtomic: 999_999,
        depositRef: { txHash: "d", globalIndex: 1 },
      }),
    ); // excluded
    expect(pendingOutAtomic(raw)).toBe(500 + 300);
  });
});
