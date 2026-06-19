// @vitest-environment node
import {
  type Account,
  createAccount,
  createWalletState,
  crypto,
  decodeAddress,
  type RawWalletV1,
  transactions as txns,
} from "conceal-wallet-sdk";
import { afterEach, describe, expect, it } from "vitest";

/**
 * End-to-end inbound-message parity: build a genuine A→B message transaction via the
 * SDK, feed it through the runtime sync/scan path with a fake daemon, and assert B's
 * `listMessages()` surfaces the decrypted inbound body. Exercises the real crypto
 * (`buildMessageTransaction` → scan → `readMessageFromTransaction`), not a stub.
 *
 * Runs in the `node` environment (not jsdom): the conceal-lib-js `secretbox`
 * `instanceof Uint8Array` guard rejects jsdom's cross-realm typed arrays, and this
 * test exercises the real envelope persist path. No DOM is needed here.
 */

const MESSAGE_BODY = "hello from A";

/** A fake spendable output that account `owner` genuinely owns (real key image). */
function fundOwnedOutput(owner: Account, amount: number): txns.SpendableOutput {
  const txKeys = crypto.generateKeys(crypto.randomSeed());
  const txPublicKey = txKeys.pub;
  const outputIndex = 0;
  // Receiver-side derivation: D = generate_key_derivation(R, owner.view.sec).
  const derivation = crypto.generateKeyDerivation(txPublicKey, owner.keys.view.sec);
  const publicKey = crypto.derivePublicKey(derivation, outputIndex, owner.keys.spend.pub);
  const ephemeralSecret = crypto.deriveSecretKey(derivation, outputIndex, owner.keys.spend.sec);
  const keyImage = crypto.generateKeyImage(publicKey, ephemeralSecret);
  return { amount, globalIndex: 1000, outputIndex, txPublicKey, publicKey, keyImage };
}

/** Decoys for an amount: `count` random ring members (distinct global indexes). */
function fakeDecoys(amount: number, count: number): txns.DecoySet {
  const outs = Array.from({ length: count }, (_, i) => ({
    globalIndex: 2000 + i,
    publicKey: crypto.generateKeys(crypto.randomSeed()).pub,
  }));
  return { amount, outs };
}

/** Convert a built (signed) tx into the daemon `getWalletSyncData` per-tx shape. */
function toDaemonRawTransaction(built: txns.BuiltTransaction, height: number, timestamp: number) {
  return {
    transaction: {
      version: 1,
      unlock_time: 0,
      extra: built.extra,
      vin: [],
      vout: built.outputs.map((out) => ({
        amount: out.amount,
        target: { type: "02", data: { key: out.publicKey } },
      })),
    },
    timestamp,
    outputIndexes: built.outputs.map((_, i) => 5000 + i),
    height,
    blockHash: "00".repeat(32),
    hash: built.hash,
    fee: 1000,
  };
}

describe("real-sdk inbound message reconstruction", () => {
  afterEach(async () => {
    const { _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
    _setRuntimeForTest(null);
  });

  it("surfaces a decrypted inbound message in B's listMessages", async () => {
    // --- A builds a real message tx to B -------------------------------------
    const alice = createAccount("english");
    const bob = createAccount("english");

    const aliceOutput = fundOwnedOutput(alice, 5_000_000);
    const bobDecoded = decodeAddress(bob.address);

    const built = txns.buildMessageTransaction({
      keys: alice.keys,
      recipient: {
        spendPublicKey: bobDecoded.spendPublicKey,
        viewPublicKey: bobDecoded.viewPublicKey,
      },
      body: MESSAGE_BODY,
      changeKeys: { spendPublicKey: alice.keys.spend.pub, viewPublicKey: alice.keys.view.pub },
      unspentOutputs: [aliceOutput],
      decoys: [fakeDecoys(aliceOutput.amount, 6)],
      fee: 1000,
      mixin: 5,
      ttlUnixSeconds: 0,
      nodeFee: null,
      messageAmount: 100,
    });

    // Sanity: B can decrypt the message straight from the built tx's extra.
    const directScan = txns.readMessageFromTransaction(
      {
        extra: built.extra,
        vout: built.outputs.map((out) => ({
          amount: out.amount,
          target: { type: "02", data: { key: out.publicKey } },
        })),
        outputIndexes: built.outputs.map((_, i) => 5000 + i),
        hash: built.hash,
        height: 42,
      },
      bob.keys,
    );
    expect(directScan?.body).toBe(MESSAGE_BODY);

    // --- Install B's runtime with a fake daemon serving that tx --------------
    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    const networkHeight = 42;
    const fakeDaemon = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(networkHeight),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: (start: number, end: number) =>
        Promise.resolve(
          start <= networkHeight && end >= networkHeight
            ? [toDaemonRawTransaction(built, networkHeight, 1_700_000_000)]
            : [],
        ),
    };

    const bobRaw: RawWalletV1 = {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
      keys: {
        pub: { spend: bob.keys.spend.pub, view: bob.keys.view.pub },
        priv: { spend: bob.keys.spend.sec, view: bob.keys.view.sec },
      },
      creationHeight: 0,
      options: {},
    };

    runtimeMod._setRuntimeForTest({
      account: bob,
      raw: bobRaw,
      state: { ...createWalletState(bob), scannedHeight: networkHeight - 1 },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: fakeDaemon as any,
      password: "pw",
      viewOnly: false,
    });

    const { realSdkMessageService } = await import("@/lib/services/real-sdk/message.service");
    const messages = await realSdkMessageService.listMessages();

    const inbound = messages.find((m) => m.direction === "received");
    expect(inbound).toBeDefined();
    expect(inbound?.body).toBe(MESSAGE_BODY);
    expect(inbound?.id).toBe(built.hash);
    expect(inbound?.unread).toBe(true);

    // --- markRead flips unread, and re-sync is idempotent (no duplicate) -----
    const read = await realSdkMessageService.markRead(built.hash);
    expect(read.unread).toBe(false);

    const again = await realSdkMessageService.listMessages();
    const inboundAgain = again.filter((m) => m.direction === "received");
    expect(inboundAgain).toHaveLength(1);
    expect(inboundAgain[0]?.unread).toBe(false);
  });

  it("surfaces a message attached to a REAL-amount payment, not just the 100-atomic marker (#97)", async () => {
    // Regression: the recipient classification used to require owning an output of
    // EXACTLY 100 atomic, so a message attached to a real transfer was dropped.
    const alice = createAccount("english");
    const bob = createAccount("english");
    const aliceOutput = fundOwnedOutput(alice, 6_000_000);
    const bobDecoded = decodeAddress(bob.address);

    const built = txns.buildMessageTransaction({
      keys: alice.keys,
      recipient: {
        spendPublicKey: bobDecoded.spendPublicKey,
        viewPublicKey: bobDecoded.viewPublicKey,
      },
      body: MESSAGE_BODY,
      changeKeys: { spendPublicKey: alice.keys.spend.pub, viewPublicKey: alice.keys.view.pub },
      unspentOutputs: [aliceOutput],
      decoys: [fakeDecoys(aliceOutput.amount, 6)],
      fee: 1000,
      mixin: 5,
      ttlUnixSeconds: 0,
      nodeFee: null,
      messageAmount: 5_000_000, // a real 5 CCX payment carrying a message
    });

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    const networkHeight = 77;
    const fakeDaemon = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(networkHeight),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: (start: number, end: number) =>
        Promise.resolve(
          start <= networkHeight && end >= networkHeight
            ? [toDaemonRawTransaction(built, networkHeight, 1_700_000_500)]
            : [],
        ),
    };
    const bobRaw: RawWalletV1 = {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
      keys: {
        pub: { spend: bob.keys.spend.pub, view: bob.keys.view.pub },
        priv: { spend: bob.keys.spend.sec, view: bob.keys.view.sec },
      },
      creationHeight: 0,
      options: {},
    };
    runtimeMod._setRuntimeForTest({
      account: bob,
      raw: bobRaw,
      state: { ...createWalletState(bob), scannedHeight: networkHeight - 1 },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: fakeDaemon as any,
      password: "pw",
      viewOnly: false,
    });

    const { realSdkMessageService } = await import("@/lib/services/real-sdk/message.service");
    const inbound = (await realSdkMessageService.listMessages()).find(
      (m) => m.direction === "received",
    );
    expect(inbound?.body).toBe(MESSAGE_BODY);
    expect(inbound?.id).toBe(built.hash);
  });
});

describe("real-sdk pending tx + balance hold (#96)", () => {
  afterEach(async () => {
    const { _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
    _setRuntimeForTest(null);
  });

  it("records a pending send, holds the balance, and locks the spent inputs", async () => {
    const alice = createAccount("english");
    const bob = createAccount("english");
    const aliceOutput = fundOwnedOutput(alice, 5_000_000);
    const networkHeight = 100;

    const fakeDaemon = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(networkHeight),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: (amounts: number[], count: number) =>
        Promise.resolve(
          amounts.map((amount) => ({
            amount,
            outs: Array.from({ length: count }, (_, i) => ({
              globalIndex: 3000 + i,
              publicKey: crypto.generateKeys(crypto.randomSeed()).pub,
            })),
          })),
        ),
      getWalletSyncData: () => Promise.resolve([]), // spend not mined during this test
    };

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    runtimeMod._setRuntimeForTest({
      account: alice,
      raw: {
        deposits: [],
        withdrawals: [],
        transactions: [],
        lastHeight: networkHeight,
        nonce: "",
        keys: {
          pub: { spend: alice.keys.spend.pub, view: alice.keys.view.pub },
          priv: { spend: alice.keys.spend.sec, view: alice.keys.view.sec },
        },
        creationHeight: 0,
        options: {},
      },
      state: { ...createWalletState(alice), outputs: [aliceOutput], scannedHeight: networkHeight },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: fakeDaemon as any,
      password: "pw",
      viewOnly: false,
    });

    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    await realSdkTransactionService.sendTransaction({ address: bob.address, amount: 0.5 });

    const { readPendingRecords } = await import("@/lib/services/real-sdk/pending-store");
    const { mapWalletInfo } = await import("@/lib/services/real-sdk/mappers");
    const { unspentOutputs } = await import("@/lib/services/real-sdk/spend");
    const rt = runtimeMod.getRuntime();
    if (rt === null) throw new Error("runtime missing");

    // A pending record exists for the broadcast tx.
    const pending = readPendingRecords(rt.raw);
    expect(pending).toHaveLength(1);
    expect(pending[0]?.amountAtomic).toBeGreaterThanOrEqual(500_000); // 0.5 CCX + fees

    // Balance held: pending bucket carries the outflow, available drops by it, total unchanged.
    const info = mapWalletInfo(rt, networkHeight);
    expect(info.pending.atomic).toBe(pending[0]?.amountAtomic);
    expect(info.balanceTotal.atomic).toBe(5_000_000);
    expect(info.available.atomic).toBe(5_000_000 - info.pending.atomic);

    // The spent input is locked against re-selection until the tx mines.
    expect(unspentOutputs(rt)).toHaveLength(0);

    // The pending send shows in history with 0 confirmations.
    const txs = await realSdkTransactionService.listTransactions();
    expect(txs.some((t) => t.type === "send" && t.confirmations === 0)).toBe(true);
  });
});

describe("real-sdk sync re-scan window (#98)", () => {
  afterEach(async () => {
    const { _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
    _setRuntimeForTest(null);
  });

  it("recovers an incoming tx in a block already passed (late daemon indexing), no manual rescan", async () => {
    // Regression #98: the recipient's incremental sync advanced scannedHeight past a
    // block whose getWalletSyncData came back before the daemon indexed a just-mined
    // tx, dropping it permanently. A small re-scan window must recover it.
    const alice = createAccount("english");
    const bob = createAccount("english");
    const bobDecoded = decodeAddress(bob.address);
    const TX_HEIGHT = 47;
    const SYNCED_HEIGHT = 50; // bob has ALREADY scanned past TX_HEIGHT (the tx was missed)

    const built = txns.buildMessageTransaction({
      keys: alice.keys,
      recipient: {
        spendPublicKey: bobDecoded.spendPublicKey,
        viewPublicKey: bobDecoded.viewPublicKey,
      },
      body: "late",
      changeKeys: { spendPublicKey: alice.keys.spend.pub, viewPublicKey: alice.keys.view.pub },
      unspentOutputs: [fundOwnedOutput(alice, 5_000_000)],
      decoys: [fakeDecoys(5_000_000, 6)],
      fee: 1000,
      mixin: 5,
      ttlUnixSeconds: 0,
      nodeFee: null,
      messageAmount: 1_000_000,
    });

    const daemon = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(SYNCED_HEIGHT),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: () => Promise.resolve([]),
      getWalletSyncData: (start: number, end: number) =>
        Promise.resolve(
          start <= TX_HEIGHT && end >= TX_HEIGHT
            ? [toDaemonRawTransaction(built, TX_HEIGHT, 1_700_000_900)]
            : [],
        ),
    };

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    runtimeMod._setRuntimeForTest({
      account: bob,
      raw: {
        deposits: [],
        withdrawals: [],
        transactions: [],
        lastHeight: SYNCED_HEIGHT,
        nonce: "",
        keys: {
          pub: { spend: bob.keys.spend.pub, view: bob.keys.view.pub },
          priv: { spend: bob.keys.spend.sec, view: bob.keys.view.sec },
        },
        creationHeight: 0,
        options: {},
      },
      state: { ...createWalletState(bob), scannedHeight: SYNCED_HEIGHT },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: daemon as any,
      password: "pw",
      viewOnly: false,
    });

    await runtimeMod.sync();

    const { getBalance, getTransactions } = await import("conceal-wallet-sdk");
    const rt = runtimeMod.getRuntime();
    expect(rt).not.toBeNull();
    if (rt === null) throw new Error("runtime missing");
    expect(getBalance(rt.state).total).toBe(1_000_000);

    // Re-syncing must NOT duplicate the recovered tx in history (idempotent fold).
    await runtimeMod.sync();
    expect(getTransactions(runtimeMod.getRuntime()?.state ?? rt.state)).toHaveLength(1);
  });
});

describe("real-sdk sendTransaction with a message (#97)", () => {
  afterEach(async () => {
    const { _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
    _setRuntimeForTest(null);
  });

  it("embeds the message and persists a sender copy in Messages", async () => {
    const alice = createAccount("english");
    const bob = createAccount("english");
    const aliceOutput = fundOwnedOutput(alice, 6_000_000);

    const runtimeMod = await import("@/lib/services/real-sdk/runtime");
    const networkHeight = 100;
    const fakeDaemon = {
      nodeUrl: "https://node.test/",
      getHeight: () => Promise.resolve(networkHeight),
      getNodeFeeAddress: () => Promise.resolve(""),
      sendRawTransaction: () => Promise.resolve({ status: "OK" }),
      getRandomOuts: (amounts: number[], count: number) =>
        Promise.resolve(
          amounts.map((amount) => ({
            amount,
            outs: Array.from({ length: count }, (_, i) => ({
              globalIndex: 3000 + i,
              publicKey: crypto.generateKeys(crypto.randomSeed()).pub,
            })),
          })),
        ),
      getWalletSyncData: () => Promise.resolve([]),
    };
    const aliceRaw: RawWalletV1 = {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
      keys: {
        pub: { spend: alice.keys.spend.pub, view: alice.keys.view.pub },
        priv: { spend: alice.keys.spend.sec, view: alice.keys.view.sec },
      },
      creationHeight: 0,
      options: {},
    };
    runtimeMod._setRuntimeForTest({
      account: alice,
      raw: aliceRaw,
      state: { ...createWalletState(alice), outputs: [aliceOutput], scannedHeight: networkHeight },
      // biome-ignore lint/suspicious/noExplicitAny: minimal daemon stub for the test
      daemon: fakeDaemon as any,
      password: "pw",
      viewOnly: false,
    });

    const { realSdkTransactionService } = await import(
      "@/lib/services/real-sdk/transaction.service"
    );
    const { readSentRecords } = await import("@/lib/services/real-sdk/messages-store");

    await realSdkTransactionService.sendTransaction({
      address: bob.address,
      amount: 0.5,
      message: "hi bob",
    });

    const rt = runtimeMod.getRuntime();
    expect(rt).not.toBeNull();
    if (rt === null) throw new Error("runtime should be installed after sendTransaction");
    const sent = readSentRecords(rt.raw);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toBe("hi bob");
    expect(sent[0]?.direction).toBe("sent");
    expect(sent[0]?.counterpartyAddress).toBe(bob.address);
  });
});
