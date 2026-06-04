import { describe, expect, it } from "vitest";
import {
  MESSAGE_TX_AMOUNT_ATOMIC,
  SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC,
  SENT_MESSAGE_AMOUNT_SELF_ATOMIC,
  createWalletNetworkConfig,
  walletNetworkScalars,
} from "@/lib/config/config";
import {
  clampImportHeight,
  deriveIndicativeDepositApr,
  hasMessageEnvelopeIn,
  isMessageIn,
  isMessageOut,
  isMessageTransactionExpired,
  mapCoreDeposit,
  mapCoreMessage,
  mapCoreTransaction,
  newWalletCreationHeight,
  resolveTransactionDisplayAmount,
  resolveTransactionType,
  resolveUiTransactionType,
  listWalletMessages,
  sortMessagesByHeight,
  isUiMessageOut,
} from "@/lib/wallet-core/mappers";
import { Deposit, Transaction, TransactionIn, TransactionOut } from "@/lib/wallet-core/Transaction";

function makeTx(
  overrides: Partial<{
    outs: TransactionOut[];
    ins: TransactionIn[];
    fusion: boolean;
    fees: number;
    hash: string;
  }> = {},
) {
  const tx = new Transaction();
  tx.outs = overrides.outs ?? [];
  tx.ins = overrides.ins ?? [];
  tx.fusion = overrides.fusion ?? false;
  tx.fees = overrides.fees ?? 0;
  tx.hash = overrides.hash ?? "abc";
  tx.timestamp = 1_700_000_000;
  tx.blockHeight = 100;
  return tx;
}

function out(amount: number, type = "02") {
  const o = new TransactionOut();
  o.amount = amount;
  o.type = type;
  o.rtcAmount = "masked";
  return o;
}

function input(amount: number, type = "02") {
  const i = new TransactionIn();
  i.amount = amount;
  i.type = type;
  return i;
}

describe("wallet mappers", () => {
  it("clamps import height like v1", () => {
    expect(clampImportHeight(0, 1000)).toBe(0);
    expect(clampImportHeight(500, 1000)).toBe(490);
    expect(clampImportHeight(2000, 1000)).toBe(989);
  });

  it("sets new wallet creation height to chain tip minus 10", () => {
    expect(newWalletCreationHeight(1000)).toBe(990);
    expect(newWalletCreationHeight(10)).toBe(0);
    expect(newWalletCreationHeight(11)).toBe(1);
  });

  it("classifies deposit, withdrawal, fusion, miner, send, and receive", () => {
    const deposit = makeTx({ outs: [out(1_000_000, "03")] });
    expect(resolveTransactionType(deposit)).toBe("deposit");

    const withdrawal = makeTx({ ins: [input(1_500_000, "03")] });
    expect(resolveTransactionType(withdrawal)).toBe("withdrawal");

    const fusion = makeTx({ fusion: true, outs: [out(100)], ins: [input(100)] });
    expect(resolveTransactionType(fusion)).toBe("fusion");

    const minerOut = out(2_000_000);
    minerOut.rtcAmount = "";
    const miner = makeTx({ outs: [minerOut] });
    expect(resolveTransactionType(miner)).toBe("miner");

    const send = makeTx({ ins: [input(500_000)], outs: [out(100_000)] });
    expect(resolveTransactionType(send)).toBe("send");

    const receive = makeTx({ outs: [out(250_000)] });
    expect(resolveTransactionType(receive)).toBe("receive");
  });

  it("classifies standalone message txs before miner coinbase heuristics", () => {
    const messageOut = out(MESSAGE_TX_AMOUNT_ATOMIC);
    messageOut.rtcAmount = "";
    const messageTx = makeTx({ hash: "msg-1", ins: [], outs: [messageOut] });
    messageTx.message = "Hello";
    expect(isMessageIn(messageTx)).toBe(true);
    expect(hasMessageEnvelopeIn(messageTx)).toBe(true);
    expect(resolveTransactionType(messageTx)).toBe("message");

    const minerOut = out(2_000_000);
    minerOut.rtcAmount = "";
    const miner = makeTx({ outs: [minerOut] });
    expect(resolveTransactionType(miner)).toBe("miner");

    const send = makeTx({ ins: [input(500_000)], outs: [out(100_000)] });
    send.message = "Payment ref #42";
    expect(resolveTransactionType(send)).toBe("send");

    const receiveWithMemo = makeTx({ outs: [out(50_000_000)] });
    receiveWithMemo.message = "Payment ref #42";
    expect(resolveTransactionType(receiveWithMemo)).toBe("receive");
    expect(mapCoreMessage(receiveWithMemo, "ccx7wallet")).toBeNull();
  });

  it("prefers deposit/withdrawal over send/receive amount sign", () => {
    const depositSend = makeTx({
      outs: [out(1_000_000, "03"), out(500_000)],
      ins: [input(1_500_000)],
    });
    expect(resolveTransactionType(depositSend)).toBe("deposit");
  });

  it("uses fee for zero-net fusion display amount", () => {
    const fusion = makeTx({ fusion: true, fees: 1000 });
    expect(resolveTransactionDisplayAmount(fusion, "fusion")).toBe(1000);
  });

  it("maps core transactions for the UI without dropping fusion or miner rows", () => {
    const walletAddress =
      "ccx7TestWalletAddress0000000000000000000000000000000000000000000000000000";
    const fusion = mapCoreTransaction(
      makeTx({ fusion: true, fees: 1000, hash: "fusion-tx" }),
      200,
      walletAddress,
    );
    expect(fusion.type).toBe("fusion");
    expect(fusion.amount.atomic).toBe(1000);
    expect(fusion.address).toBe(walletAddress);

    const minerOut = out(3_000_000);
    minerOut.rtcAmount = "";
    const miner = mapCoreTransaction(
      makeTx({ outs: [minerOut], hash: "miner-tx" }),
      200,
      walletAddress,
    );
    expect(miner.type).toBe("miner");
    expect(miner.amount.atomic).toBe(3_000_000);
  });

  it("maps core deposits to UI deposits with status and unlock progress", () => {
    const network = createWalletNetworkConfig();
    const walletAddress =
      "ccx7TestWalletAddress0000000000000000000000000000000000000000000000000000";
    const deposit = new Deposit();
    deposit.txHash = "dep-tx";
    deposit.globalOutputIndex = 2;
    deposit.amount = 1_000_000;
    deposit.interest = 50_000;
    deposit.term = walletNetworkScalars.depositMinTermBlock * 6;
    deposit.blockHeight = 100;
    deposit.unlockHeight = 100 + deposit.term;

    const active = mapCoreDeposit(deposit, 100 + deposit.term / 2, walletAddress, network);
    expect(active.status).toBe("active");
    expect(active.id).toBe("dep-tx:2");
    expect(active.durationMonths).toBe(6);
    expect(active.progressPct).toBeGreaterThan(0);
    expect(active.progressPct).toBeLessThan(100);
    expect(active.unlocksInDays).toBeGreaterThan(0);
    expect(
      deriveIndicativeDepositApr(deposit.amount, deposit.interest, deposit.term, network),
    ).toBeGreaterThan(0);

    const unlocked = mapCoreDeposit(deposit, deposit.unlockHeight, walletAddress, network);
    expect(unlocked.status).toBe("unlocked");

    deposit.spentTx = "spent-tx";
    const spent = mapCoreDeposit(deposit, deposit.unlockHeight + 10, walletAddress, network);
    expect(spent.status).toBe("spent");
    expect(spent.unlocksInDays).toBe(0);
  });

  it("maps message txs and filters expired TTL mempool messages", () => {
    const walletAddress = "ccx7WalletAddressExample";
    const received = makeTx({ hash: "recv-1", ins: [], outs: [out(100)] });
    received.message = "Hello";
    received.messageViewed = false;

    const sent = makeTx({ hash: "sent-1", ins: [input(500_000)], outs: [out(489_900)] });
    sent.message = "Hi back";

    const expired = makeTx({ hash: "ttl-1", ins: [], outs: [out(100)] });
    expired.message = "TTL note";
    expired.blockHeight = 0;
    expired.ttl = Math.floor(Date.now() / 1000) - 10;

    const receivedMsg = mapCoreMessage(received, walletAddress);
    expect(receivedMsg?.direction).toBe("received");
    expect(receivedMsg?.unread).toBe(true);
    expect(receivedMsg?.ttlExpiresAt).toBeUndefined();

    const pendingTtl = makeTx({ hash: "ttl-pending", ins: [], outs: [out(100)] });
    pendingTtl.message = "TTL pending";
    pendingTtl.blockHeight = 0;
    pendingTtl.ttl = Math.floor(Date.now() / 1000) + 3600;
    expect(mapCoreMessage(pendingTtl, walletAddress)?.ttlExpiresAt).toBe(pendingTtl.ttl);
    expect(mapCoreMessage(sent, walletAddress)?.direction).toBe("sent");
    expect(mapCoreMessage(expired, walletAddress)).toBeNull();
    expect(isMessageTransactionExpired(expired)).toBe(true);
  });

  it("detects sent messages by tx amount (10100 / 11100)", () => {
    const walletAddress = "ccx7WalletAddressExample";
    const selfNode = makeTx({
      hash: "sent-self",
      ins: [input(500_000)],
      outs: [out(489_900)],
    });
    selfNode.message = "Reply with change";
    selfNode.remoteAddress =
      "ccx7Exch7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3mNo";

    expect(isMessageIn(selfNode)).toBe(false);
    expect(isMessageOut(selfNode)).toBe(true);
    expect(resolveTransactionType(selfNode)).toBe("message");
    expect(mapCoreMessage(selfNode, walletAddress)?.direction).toBe("sent");
    expect(mapCoreTransaction(selfNode, 200, walletAddress).amount.atomic).toBe(
      SENT_MESSAGE_AMOUNT_SELF_ATOMIC,
    );

    const remote = makeTx({
      hash: "sent-remote",
      ins: [input(500_000)],
      outs: [out(488_900)],
    });
    remote.message = "Hello via remote node";

    expect(isMessageOut(remote)).toBe(true);
    expect(mapCoreTransaction(remote, 200, walletAddress).type).toBe("message");
    expect(mapCoreTransaction(remote, 200, walletAddress).amount.atomic).toBe(
      SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC,
    );

    const largeSend = makeTx({ ins: [input(500_000)], outs: [out(400_000)] });
    largeSend.message = "Payment ref";
    expect(isMessageOut(largeSend)).toBe(false);
    expect(resolveTransactionType(largeSend)).toBe("send");
  });

  it("detects sent messages via remoteAddress before message body is synced", () => {
    const walletAddress = "ccx7WalletAddressExample";
    const sent = makeTx({
      hash: "sent-remote-addr",
      ins: [input(500_000)],
      outs: [out(488_900)],
    });
    sent.remoteAddress =
      "ccx7Exch7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3mNo";

    expect(isMessageOut(sent)).toBe(true);
    expect(mapCoreTransaction(sent, 200, walletAddress).type).toBe("message");
    expect(mapCoreTransaction(sent, 200, walletAddress).outgoing).toBe(true);
  });

  it("resolveUiTransactionType shows envelope for misclassified send rows", () => {
    const sentMessage: import("@/lib/types").Transaction = {
      id: "x",
      hash: "x",
      type: "send",
      amount: { atomic: SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC },
      address: "",
      timestamp: new Date().toISOString(),
      confirmations: 10,
      message: "Hello",
    };

    expect(resolveUiTransactionType(sentMessage)).toBe("message");
    expect(isUiMessageOut(sentMessage)).toBe(true);
  });

  it("listWalletMessages hydrates sender body from wallet sentMessages records", () => {
    const walletAddress = "ccx7WalletAddressExample";
    const receiver =
      "ccx7Exch7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3mNo";
    const sent = makeTx({
      hash: "sent-stored-body",
      ins: [input(500_000)],
      outs: [out(488_900)],
    });

    const sentRecord = {
      txHash: "sent-stored-body",
      messageBody: "Hello from sender storage",
      receiver,
      paymentIdTo: "pid123",
    };
    const wallet = {
      getPublicAddress: () => walletAddress,
      listAddressBook: () => [],
      txsMem: [],
      getTransactionsCopy: () => [sent],
      getSentMessageRecord: (hash: string) => (hash === sentRecord.txHash ? sentRecord : undefined),
      hydrateSentMessageBody: (tx: Transaction) => {
        if (!tx.message && tx.hash === sentRecord.txHash) {
          tx.message = sentRecord.messageBody;
          tx.remoteAddress = sentRecord.receiver;
        }
      },
    } as unknown as import("@/lib/wallet-core/Wallet").Wallet;

    const messages = listWalletMessages(wallet);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.direction).toBe("sent");
    expect(messages[0]?.body).toBe("Hello from sender storage");
    expect(messages[0]?.hasBody).toBe(true);
    expect(messages[0]?.counterpartyAddress).toBe(receiver);
    expect(messages[0]?.threadKey).toBe(`${receiver}:pid123`);
  });

  it("listWalletMessages includes sent txs without stored body (envelope only)", () => {
    const walletAddress = "ccx7WalletAddressExample";
    const sent = makeTx({
      hash: "sent-no-body",
      ins: [input(500_000)],
      outs: [out(488_900)],
    });
    sent.remoteAddress =
      "ccx7Exch7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3mNo";

    const wallet = {
      getPublicAddress: () => walletAddress,
      listAddressBook: () => [],
      txsMem: [],
      getTransactionsCopy: () => [sent],
      getSentMessageRecord: () => undefined,
      hydrateSentMessageBody: () => {},
    } as unknown as import("@/lib/wallet-core/Wallet").Wallet;

    const messages = listWalletMessages(wallet);
    expect(messages).toHaveLength(1);
    expect(messages[0]?.direction).toBe("sent");
    expect(messages[0]?.hasBody).toBe(false);
  });

  it("sortMessagesByHeight puts received before sent when block and time tie", () => {
    const ts = "2026-06-04T09:55:00.000Z";
    const received: import("@/lib/types").Message = {
      id: "recv-hash",
      direction: "received",
      counterpartyName: "Alice",
      counterpartyAddress: "recv:abc",
      body: "Conversation",
      hasBody: true,
      paymentIdFrom: "pid",
      paymentIdTo: null,
      timestamp: ts,
      unread: false,
      blockHeight: 2_087_751,
      threadKey: "t",
    };
    const sent: import("@/lib/types").Message = {
      id: "sent-hash",
      direction: "sent",
      counterpartyName: "Alice",
      counterpartyAddress: "ccx7abc",
      body: "Reply",
      hasBody: true,
      sentTo: "ccx7abc",
      paymentIdFrom: null,
      paymentIdTo: "pid",
      timestamp: ts,
      unread: false,
      blockHeight: 2_087_751,
      threadKey: "t",
    };

    const sorted = sortMessagesByHeight([sent, received]);
    expect(sorted.map((m) => m.direction)).toEqual(["received", "sent"]);
  });
});
