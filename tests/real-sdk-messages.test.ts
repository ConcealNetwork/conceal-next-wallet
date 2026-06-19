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
