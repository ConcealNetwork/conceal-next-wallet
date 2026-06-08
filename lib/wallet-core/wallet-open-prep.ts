// @ts-nocheck
/**
 * Pre-open wallet steps from v1 AppState.handleWalletLoading / importFromFile.
 * Run after explorer.initialize() and before WalletWatchdog.start().
 */
import type { RawDaemon_Transaction } from "./blockchain/BlockchainExplorer";
import { TransactionsExplorer } from "./TransactionsExplorer";
import type { Wallet } from "./Wallet";
import { rehydrateWalletConversationMetadata } from "./wallet-conversation-persistence";
import { BlockchainExplorerProvider } from "./providers/BlockchainExplorerProvider";

/** Re-fetch blocks for in-wallet txs that are missing a hash (v1 open/import path). */
export async function updateWalletTransactions(wallet: Wallet): Promise<void> {
  const blockchainHeightToRescan: Record<number, boolean> = {};

  for (const tx of wallet.getTransactionsCopy()) {
    if (tx.hash === "") {
      blockchainHeightToRescan[tx.blockHeight] = true;
    }
  }

  const heights = Object.keys(blockchainHeightToRescan);
  if (heights.length === 0) {
    return;
  }

  const explorer = BlockchainExplorerProvider.getInstance();
  const blockTxBatches = await Promise.all(
    heights.map((height) =>
      explorer.getTransactionsForBlocks(
        parseInt(height, 10),
        parseInt(height, 10),
        wallet.options.checkMinerTx,
      ),
    ),
  );

  for (const txs of blockTxBatches) {
    for (const rawTx of txs as RawDaemon_Transaction[]) {
      const txData = TransactionsExplorer.parse(rawTx, wallet);
      if (txData?.transaction) {
        wallet.addNew(txData.transaction);
        wallet.addDeposits(txData.deposits);
        wallet.addWithdrawals(txData.withdrawals);
      }
    }
  }
}

/** v1 importFromFile + handleWalletLoading: derive key images, repair txs, then start sync. */
export async function prepareWalletForOpen(wallet: Wallet): Promise<void> {
  wallet.recalculateIfNotViewOnly();
  await updateWalletTransactions(wallet);
  rehydrateWalletConversationMetadata(wallet);
}
