import type { Transaction } from "@/lib/types";

export type SendTransactionInput = {
  address: string;
  amount: number;
  paymentId?: string;
  message?: string;
};

export interface TransactionService {
  listTransactions(): Promise<Transaction[]>;
  sendTransaction(input: SendTransactionInput): Promise<Transaction>;
}
