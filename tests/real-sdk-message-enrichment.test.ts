import {
  createAccount,
  createWalletState,
  MESSAGE_TX_AMOUNT_ATOMIC,
  type RawWalletV1,
} from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { mapTransactions } from "@/lib/services/real-sdk/mappers";
import {
  createSentMessageRecord,
  indexMessageRecords,
  type SdkMessageRecord,
  withReceivedRecords,
  withSentRecords,
} from "@/lib/services/real-sdk/messages-store";
import { resolveUiTransactionType } from "@/lib/ui/transaction-kind";

const EMPTY_RAW: RawWalletV1 = {
  deposits: [],
  withdrawals: [],
  transactions: [],
  lastHeight: 0,
  nonce: "",
  options: {},
};

describe("mapTransactions — message enrichment", () => {
  it("joins sent message records onto scanned and pending rows", () => {
    const alice = createAccount("english");
    const bobAddress = createAccount("english").address;
    const hash = "sent-msg-tx-hash";
    const state = {
      ...createWalletState(alice),
      scannedHeight: 50,
      transactions: [
        {
          hash,
          height: 40,
          amount: 11_100,
          direction: "out" as const,
          kind: "send" as const,
        },
      ],
    };
    const raw = withSentRecords(EMPTY_RAW, [
      createSentMessageRecord({
        hash,
        recipientAddress: bobAddress,
        body: "hello bob",
        paymentId: "pid-1",
        timestampIso: new Date(1_700_000_000_000).toISOString(),
      }),
    ]);
    const rows = mapTransactions(state, 50, [], [], indexMessageRecords(raw));
    const row = rows.find((tx) => tx.hash === hash);
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.message).toBe("hello bob");
    expect(row.type).toBe("message");
    expect(row.outgoing).toBe(true);
    expect(row.address).toBe(bobAddress);
    expect(row.paymentId).toBe("pid-1");
    expect(resolveUiTransactionType(row)).toBe("message");
  });

  it("joins received message records for inbound Mail icon", () => {
    const alice = createAccount("english");
    const hash = "received-msg-tx-hash";
    const state = {
      ...createWalletState(alice),
      scannedHeight: 80,
      transactions: [
        {
          hash,
          height: 75,
          amount: MESSAGE_TX_AMOUNT_ATOMIC,
          direction: "in" as const,
          kind: "receive" as const,
        },
      ],
    };
    const received: SdkMessageRecord = {
      id: hash,
      direction: "received",
      counterpartyAddress: "",
      counterpartyName: "unknown",
      body: "hello alice",
      hasBody: true,
      sentTo: null,
      paymentIdFrom: null,
      paymentIdTo: null,
      timestamp: new Date(1_700_000_000_000).toISOString(),
      unread: true,
      blockHeight: 75,
      threadKey: hash,
    };
    const raw = withReceivedRecords(EMPTY_RAW, [received]);
    const rows = mapTransactions(state, 80, [], [], indexMessageRecords(raw));
    const row = rows.find((tx) => tx.hash === hash);
    expect(row).toBeDefined();
    if (!row) return;
    expect(row.message).toBe("hello alice");
    expect(row.type).toBe("message");
    expect(row.outgoing).toBeUndefined();
    expect(resolveUiTransactionType(row)).toBe("message");
  });

  it("prefers sent record body over received when both exist for a hash", () => {
    const alice = createAccount("english");
    const hash = "both-hash";
    const state = {
      ...createWalletState(alice),
      transactions: [{ hash, height: 1, amount: 100, direction: "out" as const }],
    };
    const sent = createSentMessageRecord({
      hash,
      recipientAddress: alice.address,
      body: "sent copy",
      timestampIso: new Date().toISOString(),
    });
    const received: SdkMessageRecord = {
      ...sent,
      direction: "received",
      body: "received copy",
      unread: true,
    };
    const raw = withReceivedRecords(withSentRecords(EMPTY_RAW, [sent]), [received]);
    const row = mapTransactions(state, 10, [], [], indexMessageRecords(raw))[0];
    expect(row?.message).toBe("sent copy");
    expect(row?.type).toBe("send");
    expect(row?.outgoing).toBeUndefined();
  });

  it("does not mark a plain send with an attached body as type message (pre-#91 amount rules)", () => {
    const alice = createAccount("english");
    const hash = "transfer-with-note";
    const state = {
      ...createWalletState(alice),
      transactions: [
        { hash, height: 5, amount: 500_000, direction: "out" as const, kind: "send" as const },
      ],
    };
    const raw = withSentRecords(EMPTY_RAW, [
      createSentMessageRecord({
        hash,
        recipientAddress: createAccount("english").address,
        body: "payment note",
        timestampIso: new Date().toISOString(),
      }),
    ]);
    const row = mapTransactions(state, 10, [], [], indexMessageRecords(raw))[0];
    expect(row?.message).toBe("payment note");
    expect(row?.type).toBe("send");
    expect(row?.outgoing).toBeUndefined();
  });

  it("hides pending TTL message txs once wall-clock expiry has passed", () => {
    const alice = createAccount("english");
    const state = { ...createWalletState(alice), transactions: [] };
    const nowUnix = Math.floor(Date.now() / 1000);
    const hash = "ttl-pending-hash";
    const sent = createSentMessageRecord({
      hash,
      recipientAddress: createAccount("english").address,
      body: "ephemeral",
      timestampIso: new Date().toISOString(),
      ttlExpiresAt: nowUnix - 30,
    });
    const raw = withSentRecords(EMPTY_RAW, [sent]);
    const pending = [
      {
        hash,
        type: "message" as const,
        amountAtomic: MESSAGE_TX_AMOUNT_ATOMIC,
        timestampIso: new Date().toISOString(),
        address: sent.counterpartyAddress,
        spentKeyImages: ["ki"],
        ttlExpiresAt: nowUnix - 30,
      },
    ];
    const rows = mapTransactions(state, 10, pending, [], indexMessageRecords(raw));
    expect(rows.find((tx) => tx.hash === hash)).toBeUndefined();
  });
});
