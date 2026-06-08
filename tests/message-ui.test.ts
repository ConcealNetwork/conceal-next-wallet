import { describe, expect, it } from "vitest";
import {
  conversationReceivePaymentId,
  filterConversationMessages,
  mapTransactionToMessageUI as mapTransactionToMessageUIRaw,
  resolveConversationMatch,
} from "@/lib/wallet-core/MessageUI";
import { Transaction, TransactionIn, TransactionOut } from "@/lib/wallet-core/Transaction";

/** Test wrapper: the mapper returns null for non-message txs; every fixture here is a
 *  message, so assert non-null once here instead of a `!` at each call site. */
function mapTransactionToMessageUI(
  ...args: Parameters<typeof mapTransactionToMessageUIRaw>
): NonNullable<ReturnType<typeof mapTransactionToMessageUIRaw>> {
  const result = mapTransactionToMessageUIRaw(...args);
  if (!result) {
    throw new Error("expected mapTransactionToMessageUI to return a message");
  }
  return result;
}

const RECEIVER =
  "ccx7Exch7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3mNo";
const PID = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7ef099";

function sentTx(hash: string, body?: string): Transaction {
  const tx = new Transaction();
  tx.hash = hash;
  tx.ins = [Object.assign(new TransactionIn(), { amount: 500_000, type: "02" })];
  tx.outs = [Object.assign(new TransactionOut(), { amount: 488_900, type: "02", rtcAmount: "x" })];
  tx.remoteAddress = RECEIVER;
  tx.paymentId = PID;
  tx.blockHeight = 100;
  tx.timestamp = 1_700_000_000;
  if (body) tx.message = body;
  return tx;
}

describe("MessageUI", () => {
  it("ignores sent tx without message body or stored record", () => {
    expect(mapTransactionToMessageUIRaw(sentTx("h1"))).toBeNull();
  });

  it("maps sent tx with stored record body", () => {
    const row = mapTransactionToMessageUI(sentTx("h2"), {
      txHash: "h2",
      messageBody: "Stored hello",
      receiver: RECEIVER,
      paymentIdTo: PID,
    });
    expect(row?.messageBody).toBe("Stored hello");
    expect(row?.hasBody).toBe(true);
    expect(row?.paymentIdFrom).toBeNull();
    expect(row?.paymentIdTo).toBe(PID);
  });

  it("maps received tx with paymentIdFrom only", () => {
    const received = mapTransactionToMessageUI(
      Object.assign(new Transaction(), {
        hash: "r1",
        message: "Hello",
        paymentId: PID,
        blockHeight: 99,
        timestamp: 1_699_999_000,
        outs: [Object.assign(new TransactionOut(), { amount: 100, type: "02", rtcAmount: "x" })],
      }),
    );
    expect(received.paymentIdFrom).toBe(PID);
    expect(received.paymentIdTo).toBeNull();
    expect(conversationReceivePaymentId(received)).toBe(PID.toLowerCase());
  });

  it("threads sent-to address with received paymentIdFrom", () => {
    const sent = mapTransactionToMessageUI(sentTx("s1", "Hi"), {
      txHash: "s1",
      messageBody: "Hi",
      receiver: RECEIVER,
      paymentIdTo: PID,
    });
    const received = mapTransactionToMessageUI(
      Object.assign(new Transaction(), {
        hash: "r1",
        message: "Hello",
        paymentId: PID,
        blockHeight: 99,
        timestamp: 1_699_999_000,
        outs: [Object.assign(new TransactionOut(), { amount: 100, type: "02", rtcAmount: "x" })],
      }),
    );

    const match = resolveConversationMatch(sent, []);
    expect(match.sentToAddress).toBe(RECEIVER);
    expect(match.receivePaymentId).toBe(PID.toLowerCase());

    const thread = filterConversationMessages(sent, [sent, received], []);
    expect(thread).toHaveLength(2);
  });
});
