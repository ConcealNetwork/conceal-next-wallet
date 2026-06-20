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
