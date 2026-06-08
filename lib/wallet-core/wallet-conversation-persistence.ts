// @ts-nocheck
/**
 * v3 conversation metadata lives inside the encrypted wallet blob (optional RawWallet fields).
 * v1 wallets omit addressBook / sentMessages; extra JSON keys are ignored on v1 import.
 */
import { SENT_MESSAGE_AMOUNT_SELF_ATOMIC } from "@/lib/config/config";
import { Transaction, TransactionIn } from "./Transaction";
import type { Wallet } from "./Wallet";

function walletHasTransaction(wallet: Wallet, hash: string): boolean {
  if (!hash) return false;
  if (wallet.findWithTxHash(hash) !== null) return true;
  return wallet.txsMem.some((tx) => tx.hash === hash);
}

/** Attach sender-stored bodies to matching txs (receiver bodies come from chain scan). */
export function rehydrateWalletConversationMetadata(wallet: Wallet): void {
  for (const transaction of wallet.txsMem.concat(wallet.getTransactionsCopy())) {
    wallet.hydrateSentMessageBody(transaction);
  }
}

/**
 * Sent message records can outlive their tx row (e.g. mempool-only export). Recreate a minimal
 * mempool tx so the sender can see sent threads after file import / unlock.
 */
export function restoreSentMessageTransactionStubs(wallet: Wallet): void {
  for (const record of wallet.listSentMessageRecords()) {
    if (!record.txHash || walletHasTransaction(wallet, record.txHash)) continue;

    const transaction = new Transaction();
    transaction.hash = record.txHash;
    transaction.txPubKey = record.txHash;
    transaction.blockHeight = 0;
    transaction.timestamp = Math.floor(Date.now() / 1000);
    transaction.remoteAddress = record.receiver ?? "";
    transaction.message = record.messageBody;
    if (record.paymentIdTo) transaction.paymentId = record.paymentIdTo;
    else if (record.paymentId) transaction.paymentId = record.paymentId;

    const input = new TransactionIn();
    input.amount = SENT_MESSAGE_AMOUNT_SELF_ATOMIC;
    input.type = "02";
    transaction.ins = [input];

    wallet.addNewMemTx(transaction);
  }
}

export function prepareWalletConversationData(wallet: Wallet): void {
  restoreSentMessageTransactionStubs(wallet);
  rehydrateWalletConversationMetadata(wallet);
}
