// @vitest-environment node
import {
  createAccount,
  createWalletState,
  crypto,
  type OwnedDeposit,
  type RawWalletV1,
  type transactions as txns,
  type WalletKeys,
  type WalletTransaction,
} from "conceal-wallet-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { addPendingRecord } from "@/lib/services/real-sdk/pending-store";

/**
 * Deposit-gating constraints: the advertised max must reflect what a real createDeposit
 * can actually SELECT (pretty, non-dust, unreserved outputs minus all fees), and
 * `hasPendingDeposit` must read the optimistic pending store — state.deposits only ever
 * comes from mined scans, so a blockHeight-0 check there is always false.
 */

type DaemonStub = {
  nodeUrl: string;
  getHeight: () => Promise<number>;
  getNodeFeeAddress: () => Promise<string>;
  sendRawTransaction: (hex: string) => Promise<{ status: string }>;
  getRandomOuts: () => Promise<never[]>;
  getWalletSyncData: (start: number, end: number) => Promise<unknown>;
};

function fundOwnedOutput(owner: WalletKeys, amount: number): txns.SpendableOutput {
  const txKeys = crypto.generateKeys(crypto.randomSeed());
  const txPublicKey = txKeys.pub;
  const outputIndex = 0;
  const derivation = crypto.generateKeyDerivation(txPublicKey, owner.view.sec);
  const publicKey = crypto.derivePublicKey(derivation, outputIndex, owner.spend.pub);
  const ephemeralSecret = crypto.deriveSecretKey(derivation, outputIndex, owner.spend.sec);
  const keyImage = crypto.generateKeyImage(publicKey, ephemeralSecret);
  return { amount, globalIndex: 1000, outputIndex, txPublicKey, publicKey, keyImage };
}

function fakeOwnedDeposit(amount: number): OwnedDeposit {
  const txKeys = crypto.generateKeys(crypto.randomSeed());
  return {
    amount,
    globalIndex: 2000,
    outputIndex: 0,
    txPublicKey: txKeys.pub,
    publicKey: txKeys.pub,
    keys: [txKeys.pub],
    term: 2_600,
    blockHeight: 100,
    txHash: `deposit-tx-${amount}`,
    interest: 0,
    unlockHeight: 2_700,
  };
}

function emptyRaw(): RawWalletV1 {
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    lastHeight: 0,
    nonce: "",
    options: {},
  };
}

type Scenario = {
  outputs?: txns.SpendableOutput[];
  deposits?: OwnedDeposit[];
  pending?: RawWalletV1;
  transactions?: WalletTransaction[];
  nodeFeeAddress?: string;
};

async function constraintsFor(scenario: Scenario) {
  const alice = createAccount("english");
  const daemon: DaemonStub = {
    nodeUrl: "https://node.test/",
    getHeight: () => Promise.resolve(2000),
    getNodeFeeAddress: () => Promise.resolve(scenario.nodeFeeAddress ?? ""),
    sendRawTransaction: () => Promise.resolve({ status: "OK" }),
    getRandomOuts: () => Promise.resolve([]),
    getWalletSyncData: () => Promise.resolve([]),
  };

  const runtimeMod = await import("@/lib/services/real-sdk/runtime");
  runtimeMod._setRuntimeForTest({
    account: alice,
    raw: scenario.pending ?? emptyRaw(),
    state: {
      ...createWalletState(alice),
      scannedHeight: 2000,
      outputs: scenario.outputs ?? [],
      deposits: scenario.deposits ?? [],
      transactions: scenario.transactions ?? [],
    },
    // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
    daemon: daemon as any,
    password: "pw",
    viewOnly: false,
  });

  const { realSdkDepositService } = await import("@/lib/services/real-sdk/deposit.service");
  return realSdkDepositService.getDepositConstraints();
}

afterEach(async () => {
  const { _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
  _setRuntimeForTest(null);
});

describe("getDepositConstraints gating math", () => {
  it("disables deposits when funds sit only in non-pretty (unmixable) outputs", async () => {
    const alice = createAccount("english");
    // 1.5 CCX in a single unmixable output: the old spendable-based gate advertised
    // max 1 CCX, but input selection can never pick it — the gate must agree.
    const constraints = await constraintsFor({
      outputs: [fundOwnedOutput(alice.keys, 1_500_000)],
    });
    expect(constraints.maxDepositAmount).toBe(0);
    expect(constraints.isDepositDisabled).toBe(true);
  });

  it("needs 1 CCX principal PLUS the network fee before enabling a deposit", async () => {
    const alice = createAccount("english");
    const exactBalance = await constraintsFor({
      outputs: [fundOwnedOutput(alice.keys, 1_000_000)],
    });
    expect(exactBalance.maxDepositAmount).toBe(0);
    expect(exactBalance.isDepositDisabled).toBe(true);

    const withHeadroom = await constraintsFor({
      outputs: [fundOwnedOutput(alice.keys, 1_000_000), fundOwnedOutput(alice.keys, 100_000)],
    });
    expect(withHeadroom.maxDepositAmount).toBe(1);
    expect(withHeadroom.isDepositDisabled).toBe(false);
  });

  it("ignores dust below the spend dust threshold", async () => {
    const alice = createAccount("english");
    const constraints = await constraintsFor({
      outputs: [fundOwnedOutput(alice.keys, 5), fundOwnedOutput(alice.keys, 7)],
    });
    expect(constraints.maxDepositAmount).toBe(0);
    expect(constraints.isDepositDisabled).toBe(true);
  });

  it("disables when the only value is locked in an active deposit", async () => {
    const constraints = await constraintsFor({ deposits: [fakeOwnedDeposit(5_000_000)] });
    expect(constraints.maxDepositAmount).toBe(0);
    expect(constraints.isDepositDisabled).toBe(true);
  });

  it("budgets the remote-node fee into the advertised max", async () => {
    const alice = createAccount("english");
    const outputs = [fundOwnedOutput(alice.keys, 1_000_000), fundOwnedOutput(alice.keys, 10_000)];
    const withoutFee = await constraintsFor({ outputs });
    expect(withoutFee.maxDepositAmount).toBe(1);
    expect(withoutFee.isDepositDisabled).toBe(false);

    // A node that charges its 10_000-atomic fee pushes the same wallet under the line.
    const withFee = await constraintsFor({
      outputs,
      nodeFeeAddress: "node-fee-recipient",
    });
    expect(withFee.maxDepositAmount).toBe(0);
    expect(withFee.isDepositDisabled).toBe(true);
  });

  it("excludes outputs reserved by a live pending deposit", async () => {
    const alice = createAccount("english");
    const outputs = [fundOwnedOutput(alice.keys, 1_000_000), fundOwnedOutput(alice.keys, 100_000)];
    const pending = addPendingRecord(emptyRaw(), {
      hash: "dep-tx",
      type: "deposit",
      amountAtomic: 1_001_000,
      timestampIso: new Date().toISOString(),
      address: alice.address,
      spentKeyImages: outputs.map((out) => out.keyImage),
    });
    const constraints = await constraintsFor({ outputs, pending });
    expect(constraints.maxDepositAmount).toBe(0);
    expect(constraints.isDepositDisabled).toBe(true);
    expect(constraints.hasPendingDeposit).toBe(true);
  });
});

describe("hasPendingDeposit", () => {
  function depositPendingRecord(raw: RawWalletV1, address: string): RawWalletV1 {
    return addPendingRecord(raw, {
      hash: "dep-tx",
      type: "deposit",
      amountAtomic: 1_001_000,
      timestampIso: new Date().toISOString(),
      address,
      spentKeyImages: [],
    });
  }

  it("is true while a deposit-typed pending record is unmined", async () => {
    const alice = createAccount("english");
    const constraints = await constraintsFor({
      pending: depositPendingRecord(emptyRaw(), alice.address),
    });
    expect(constraints.hasPendingDeposit).toBe(true);
  });

  it("is false once the deposit tx mines into scanned state", async () => {
    const alice = createAccount("english");
    const constraints = await constraintsFor({
      pending: depositPendingRecord(emptyRaw(), alice.address),
      transactions: [{ hash: "dep-tx" } as WalletTransaction],
    });
    expect(constraints.hasPendingDeposit).toBe(false);
  });

  it("is false for pending sends and withdrawals", async () => {
    const alice = createAccount("english");
    const pending = addPendingRecord(emptyRaw(), {
      hash: "send-tx",
      type: "send",
      amountAtomic: 500,
      timestampIso: new Date().toISOString(),
      address: alice.address,
      spentKeyImages: [],
    });
    const constraints = await constraintsFor({ pending });
    expect(constraints.hasPendingDeposit).toBe(false);
  });
});
