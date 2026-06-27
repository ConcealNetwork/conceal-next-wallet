// UI-layer transaction classification (#91 decoupling): moved out of
// lib/wallet-core/mappers so the UI/services depend on a neutral module, not the engine.
// {@link isMappedMessageIn} / {@link isMappedMessageOut} mirror pre-#91 engine rules for
// the real-SDK mapper (`mapWalletTransaction` in mappers.ts).

import {
  MESSAGE_TX_AMOUNT_ATOMIC,
  MINIMUM_FEE_V2,
  REMOTE_NODE_FEE_ATOMIC,
} from "conceal-wallet-sdk";
import type { TransactionType, Transaction as UiTransaction } from "@/lib/types";

const SENT_MESSAGE_AMOUNT_SELF_ATOMIC = MESSAGE_TX_AMOUNT_ATOMIC + REMOTE_NODE_FEE_ATOMIC;
const SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC = SENT_MESSAGE_AMOUNT_SELF_ATOMIC + MINIMUM_FEE_V2;

/** Sent message envelope: self node (10100) or remote node (+ fee → 11100) atomic. */
export function isSentMessageAmount(amount: number): boolean {
  return amount === SENT_MESSAGE_AMOUNT_SELF_ATOMIC || amount === SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC;
}

/** Context for pre-#91 outbound message classification at map time. */
export type MessageClassificationContext = {
  direction: "in" | "out";
  blockHeight?: number;
  ttlExpiresAt?: number;
};

/**
 * Pre-#91 `isMessageIn` (`lib/wallet-core/mappers.ts`): inbound body + 100 atomic received.
 */
export function isMappedMessageIn(
  messageBody: string | undefined,
  amountAtomic: number,
  direction: "in" | "out",
): boolean {
  if (!messageBody?.trim()) return false;
  return amountAtomic === MESSAGE_TX_AMOUNT_ATOMIC && direction === "in";
}

/**
 * Pre-#91 `isMessageOut` (`lib/wallet-core/mappers.ts`): outbound envelope or TTL mempool
 * message (no operator fee → net −100 atomic).
 */
export function isMappedMessageOut(
  messageBody: string | undefined,
  amountAtomic: number,
  ctx: MessageClassificationContext,
): boolean {
  if (!messageBody?.trim()) return false;
  if (isSentMessageAmount(amountAtomic)) return true;
  if (
    (ctx.blockHeight ?? 0) === 0 &&
    ctx.ttlExpiresAt &&
    ctx.ttlExpiresAt > 0 &&
    ctx.direction === "out" &&
    amountAtomic === MESSAGE_TX_AMOUNT_ATOMIC
  ) {
    return true;
  }
  return false;
}

export function isUiMessageIn(transaction: Pick<UiTransaction, "message" | "amount">): boolean {
  if (!transaction.message) return false;
  return Math.abs(transaction.amount.atomic) === MESSAGE_TX_AMOUNT_ATOMIC;
}

export function isUiMessageOut(
  transaction: Pick<UiTransaction, "message" | "amount" | "outgoing">,
): boolean {
  if (!transaction.message) return false;
  if (transaction.outgoing) return true;
  return isSentMessageAmount(Math.abs(transaction.amount.atomic));
}

/** Effective type for UI (icon, tabs, labels). */
export function resolveUiTransactionType(transaction: UiTransaction): TransactionType {
  if (isUiMessageOut(transaction) || isUiMessageIn(transaction)) return "message";
  return transaction.type;
}
