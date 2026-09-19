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
   * Session send intents. `listQueuedTransactions` returns queued payment intents
   * (id is the intent id; hash is optional — hung watchedHash only).
   * `cancelQueuedTransaction` drops an intent by id. `submitHungIntent` marks a hung
   * row sent when its hash is in history, otherwise rebuilds. These are not signed hex.
   * Mock mode keeps an in-memory list so the UI is exercisable.
   */
  listQueuedTransactions(): Promise<QueuedTransaction[]>;
  cancelQueuedTransaction(id: string): Promise<boolean>;
  submitHungIntent(id: string): Promise<boolean>;
}
