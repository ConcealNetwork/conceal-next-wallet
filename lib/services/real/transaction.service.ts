import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import { assertRealWalletCanSpend } from "@/lib/services/real/view-only-runtime";
import type { SendTransactionInput, TransactionService } from "@/lib/services/transaction.service";
import type { Transaction } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";

async function walletOps() {
  await ensureAllWalletLegacyLibs();
  return import("@/lib/wallet-core/wallet-operations");
}

export const realTransactionService: TransactionService = {
  async listTransactions(): Promise<Transaction[]> {
    return (await walletOps()).listTransactionsOperation();
  },
  async sendTransaction(input: SendTransactionInput): Promise<Transaction> {
    await assertRealWalletCanSpend(walletCopy.viewOnlySendDisabled);
    return (await walletOps()).sendTransactionOperation(input);
  },
};
