// UI-layer transaction classification (#91 decoupling): moved out of
// lib/wallet-core/mappers so the UI/services depend on a neutral module, not the engine.

import {
  MESSAGE_TX_AMOUNT_ATOMIC,
  SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC,
  SENT_MESSAGE_AMOUNT_SELF_ATOMIC,
} from "@/lib/config/config";
import type { Transaction as UiTransaction, TransactionType } from "@/lib/types";

/** Sent message envelope: self node (10100) or remote node (+ fee → 11100) atomic. */
function isSentMessageAmount(amount: number): boolean {
  return amount === SENT_MESSAGE_AMOUNT_SELF_ATOMIC || amount === SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC;
}

function isUiMessageIn(transaction: Pick<UiTransaction, "message" | "amount">): boolean {
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
