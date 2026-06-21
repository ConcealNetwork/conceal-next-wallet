import type { QueuedTransaction, Transaction } from "@/lib/types";

export type SendTransactionInput = {
  address: string;
  amount: number;
  paymentId?: string;
  message?: string;
};

export interface TransactionService {
  listTransactions(): Promise<Transaction[]>;
  sendTransaction(input: SendTransactionInput): Promise<Transaction>;
  /**
   * Durable outbound queue (#92). `listQueuedTransactions` returns the built+signed txs
   * persisted for broadcast (pending / broadcast / failed); `cancelQueuedTransaction`
   * removes a still-PENDING entry (frees its reserved inputs) — a tx already broadcast
   * cannot be cancelled (returns false). Mock mode keeps an in-memory list so the UI is
   * exercisable.
   */
  listQueuedTransactions(): Promise<QueuedTransaction[]>;
  cancelQueuedTransaction(id: string): Promise<boolean>;
}
