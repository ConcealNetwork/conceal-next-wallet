import {
  createAccount,
  createWalletState,
  type OwnedDeposit,
  type WalletTransaction,
} from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import {
  buildSpendTxMap,
  depRef,
  resolveDepHeight,
  uiDepStatus,
} from "@/lib/deposits/deposit-status";
import { mapDeposits } from "@/lib/services/real-sdk/mappers";

const TERM = 21_900;
const NETWORK = 500_000;

function makeDep(id: number, overrides: Partial<OwnedDeposit> = {}): OwnedDeposit {
  const blockHeight = 400_000 + id * 1_000;
  return {
    amount: 1_000_000_000 * (id + 1),
    globalIndex: 100 + id,
    outputIndex: 0,
    txPublicKey: "aa".repeat(32),
    publicKey: "bb".repeat(32),
    keys: ["bb".repeat(32)],
    term: TERM,
    blockHeight,
    txHash: `dep-${id}`,
    interest: 50_000_000,
    unlockHeight: blockHeight + TERM,
    ...overrides,
  };
}

function makeWithdrawTx(hash: string, height: number): WalletTransaction {
  return {
    hash,
    height,
    timestamp: height,
    amount: 1,
    kind: "withdrawal",
    direction: "in",
  };
}

function makeDepositTx(hash: string, height: number): WalletTransaction {
  return {
    hash,
    height,
    timestamp: height,
    amount: 1,
    kind: "deposit",
    direction: "out",
  };
}

describe("deposit-status (wallet-core parity)", () => {
  const acct = createAccount("english");

  it("resolves block height from the deposit creation tx when scan stored 0", () => {
    const deposit = makeDep(0, { blockHeight: 0, txHash: "dep-0" });
    const state = {
      ...createWalletState(acct),
      deposits: [deposit],
      transactions: [makeDepositTx("dep-0", 413_401)],
    };
    expect(resolveDepHeight(deposit, state)).toBe(413_401);
  });

  it("classifies 1 locked, 2 withdrawable, 9 spent (12 deposits)", () => {
    const locked = makeDep(0, { blockHeight: 490_000, globalIndex: 1, amount: 1_000 });
    const openA = makeDep(1, { blockHeight: 400_000, globalIndex: 2, amount: 2_000 });
    const openB = makeDep(2, { blockHeight: 410_000, globalIndex: 3, amount: 3_000 });
    const spent = Array.from({ length: 9 }, (_, i) =>
      makeDep(10 + i, {
        blockHeight: 400_000,
        globalIndex: 10 + i,
        amount: 10_000 + i,
        txHash: `spent-${i}`,
      }),
    );

    const withdrawals = spent.map((_d, i) => makeWithdrawTx(`w-${i}`, 450_000 + i));

    const state = {
      ...createWalletState(acct),
      deposits: [locked, openA, openB, ...spent],
      spentDepositRefs: spent.map((d) => `${d.txHash}:${d.globalIndex}`),
      transactions: withdrawals,
    };

    const spendMap = buildSpendTxMap(state);
    expect(uiDepStatus(locked, NETWORK, state, spendMap)).toBe("active");
    expect(uiDepStatus(openA, NETWORK, state, spendMap)).toBe("unlocked");
    expect(uiDepStatus(openB, NETWORK, state, spendMap)).toBe("unlocked");
    for (const dep of spent) {
      expect(uiDepStatus(dep, NETWORK, state, spendMap)).toBe("spent");
    }

    const mapped = mapDeposits(state, NETWORK);
    expect(mapped.filter((d) => d.status === "active")).toHaveLength(1);
    expect(mapped.filter((d) => d.status === "unlocked")).toHaveLength(2);
    expect(mapped.filter((d) => d.status === "spent")).toHaveLength(9);
  });

  it("does not mark every deposit spent when globalIndex collides on 0", () => {
    const matureA = makeDep(0, { globalIndex: 0, blockHeight: 400_000, txHash: "a", amount: 100 });
    const matureB = makeDep(1, { globalIndex: 0, blockHeight: 410_000, txHash: "b", amount: 200 });
    const state = {
      ...createWalletState(acct),
      deposits: [matureA, matureB],
      spentDepositRefs: [`${matureA.txHash}:0`],
      transactions: [makeWithdrawTx("w-0", 450_000)],
    };

    const spendMap = buildSpendTxMap(state);
    const spentCount = state.deposits.filter(
      (d) => uiDepStatus(d, NETWORK, state, spendMap) === "spent",
    ).length;
    const openCount = state.deposits.filter(
      (d) => uiDepStatus(d, NETWORK, state, spendMap) === "unlocked",
    ).length;

    expect(spentCount).toBe(1);
    expect(openCount).toBe(1);
  });

  it("reads legacy spentTx from raw.deposits", () => {
    const dep = makeDep(0, { txHash: "legacy-dep", globalIndex: 42 });
    const state = { ...createWalletState(acct), deposits: [dep], spentDepositRefs: [] };
    const raw = {
      deposits: [{ txHash: "legacy-dep", globalOutputIndex: 42, spentTx: "spent-hash" }],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
    };

    const spendMap = buildSpendTxMap(state, raw);
    expect(spendMap.get(depRef(dep))).toBe("spent-hash");
    expect(uiDepStatus(dep, NETWORK, state, spendMap)).toBe("spent");
  });

  it("matches withdrawals by principal + globalOutputIndex from raw.withdrawals", () => {
    const dep = makeDep(0, { amount: 5_000, globalIndex: 77, txHash: "dep-x" });
    const state = { ...createWalletState(acct), deposits: [dep], spentDepositRefs: [] };
    const raw = {
      deposits: [],
      withdrawals: [
        { txHash: "w-x", amount: 5_000, globalOutputIndex: 77, blockHeight: 450_000, term: TERM },
      ],
      transactions: [],
      lastHeight: 0,
      nonce: "",
    };

    const spendMap = buildSpendTxMap(state, raw);
    expect(uiDepStatus(dep, NETWORK, state, spendMap)).toBe("spent");
  });
});
