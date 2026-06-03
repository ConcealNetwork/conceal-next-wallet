import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import type { SendTransactionInput, TransactionService } from "@/lib/services/transaction.service";
import type { Transaction } from "@/lib/types";

async function walletOps() {
  await ensureAllWalletLegacyLibs();
  return import("@/lib/wallet-core/wallet-operations");
}

export const realTransactionService: TransactionService = {
  async listTransactions(): Promise<Transaction[]> {
    return (await walletOps()).listTransactionsOperation();
  },
  async sendTransaction(input: SendTransactionInput): Promise<Transaction> {
    return (await walletOps()).sendTransactionOperation(input);
  },
};
