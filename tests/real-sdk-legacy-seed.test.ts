import {
  encodeAddress,
  getBalance,
  getLockedDeposits,
  getTransactions,
  getUnspentOutputs,
  type RawWalletV1,
} from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { seedStateFromLegacyBlob } from "@/lib/services/real-sdk/legacy-state-seed";

/**
 * The seeder must reproduce, from a wallet-core (`lib/wallet-core`) blob's
 * already-scanned `transactions`/`deposits`, exactly the {@link WalletState} a
 * full live re-sync would produce — so opening an existing legacy wallet under
 * the SDK engine is instant (resumes at `lastHeight`) instead of rescanning from
 * genesis. Balance math here mirrors legacy `TransactionsExplorer` parity
 * (`getBalance` = Σ unspent owned outputs; spends matched by key image).
 */

// A deterministic account (the seeder only reads `account.address`).
const account = {
  address: encodeAddress(
    "0000000000000000000000000000000000000000000000000000000000000001",
    "0000000000000000000000000000000000000000000000000000000000000002",
  ),
  keys: {
    spend: { sec: "", pub: "00".repeat(32) },
    view: { sec: "", pub: "00".repeat(32) },
  },
};

/** A minimal legacy blob: receive 100 @ h10, receive 50 @ h20, spend the 100 @ h30. */
function legacyBlob(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [
      {
        blockHeight: 10,
        txPubKey: "aa".repeat(32),
        hash: "tx-recv-100",
        timestamp: 1_700_000_010,
        outs: [
          {
            amount: 100,
            keyImage: "ki-100",
            outputIdx: 0,
            globalIndex: 1000,
            type: "02",
            pubKey: "pk-100",
          },
        ],
      },
      {
        blockHeight: 20,
        txPubKey: "bb".repeat(32),
        hash: "tx-recv-50",
        timestamp: 1_700_000_020,
        outs: [
          {
            amount: 50,
            keyImage: "ki-50",
            outputIdx: 0,
            globalIndex: 2000,
            type: "02",
            pubKey: "pk-50",
          },
        ],
      },
      {
        blockHeight: 30,
        txPubKey: "cc".repeat(32),
        hash: "tx-spend-100",
        timestamp: 1_700_000_030,
        ins: [{ amount: 100, keyImage: "ki-100", type: "02" }],
      },
    ],
    lastHeight: 35,
    nonce: "",
  };
}

describe("seedStateFromLegacyBlob", () => {
  it("returns null when there is no scanned legacy history to seed from", () => {
    const empty: RawWalletV1 = {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
    };
    expect(seedStateFromLegacyBlob(account, empty)).toBeNull();
  });

  it("returns null for a tip-only blob (lastHeight set, no transactions/deposits)", () => {
    // Resuming at this tip would hide any balance whose history is absent — the
    // catastrophic 0-balance case. The seeder must defer to a safe full re-scan.
    const tipOnly: RawWalletV1 = {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 900_000,
      nonce: "",
    };
    expect(seedStateFromLegacyBlob(account, tipOnly)).toBeNull();
  });

  it("reproduces balance, unspent set, history and scannedHeight from the legacy blob", () => {
    const state = seedStateFromLegacyBlob(account, legacyBlob());
    expect(state).not.toBeNull();
    if (state === null) return;

    // 100 received then spent, 50 received and unspent → spendable 50.
    expect(getBalance(state).total).toBe(50);
    const unspent = getUnspentOutputs(state);
    expect(unspent).toHaveLength(1);
    expect(unspent[0].keyImage).toBe("ki-50");
    expect(unspent[0].globalIndex).toBe(2000);
    expect(unspent[0].publicKey).toBe("pk-50");

    // Both owned outputs are recorded; the 100 is marked spent by its key image.
    expect(state.outputs).toHaveLength(2);
    expect(state.spentKeyImages).toContain("ki-100");

    // Three history entries (two receives + one spend), and we resume at lastHeight.
    expect(getTransactions(state)).toHaveLength(3);
    expect(state.scannedHeight).toBe(35);
    expect(state.address).toBe(account.address);
  });

  it("seeds owned deposits (locked principal stays out of spendable balance)", () => {
    const blob = legacyBlob();
    const withDeposit: RawWalletV1 = {
      ...blob,
      deposits: [
        {
          term: 5040,
          txHash: "dep-tx",
          amount: 1_000_000,
          interest: 1234,
          timestamp: 1_700_000_040,
          blockHeight: 25,
          unlockHeight: 25 + 5040,
          globalOutputIndex: 3000,
          indexInVout: 0,
          txPubKey: "dd".repeat(32),
          keys: ["dep-pub"],
          spentTx: "",
        },
      ],
    };
    const state = seedStateFromLegacyBlob(account, withDeposit);
    expect(state).not.toBeNull();
    if (state === null) return;

    // Deposit principal is NOT in spendable balance.
    expect(getBalance(state).total).toBe(50);
    expect(state.deposits).toHaveLength(1);
    expect(state.deposits[0].amount).toBe(1_000_000);
    expect(state.deposits[0].globalIndex).toBe(3000);
    expect(getLockedDeposits(state, 100).length).toBe(1);
  });
});
