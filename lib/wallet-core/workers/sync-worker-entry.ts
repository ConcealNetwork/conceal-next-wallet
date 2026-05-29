/**
 * Sync worker message handler (ported from conceal-web-wallet TransferProcessing.ts).
 * Bundled to public/workers/wallet-sync.bundle.js; globals loaded via entrypoint importScripts.
 */
// @ts-nocheck

import type { RawDaemon_Transaction } from "../blockchain/BlockchainExplorer"
import { TransactionsExplorer } from "../TransactionsExplorer"
import { Wallet } from "../Wallet"

declare const self: DedicatedWorkerGlobalScope & {
  postMessage: (message: unknown) => void
  onmessage: ((event: MessageEvent) => void) | null
}

self.onmessage = function (data: MessageEvent) {
  const event: any = data.data
  try {
    if (event.type === "initWallet") {
      postMessage({ type: "readyWallet" })
    } else if (event.type === "screen") {
      const readMinersTx = typeof event.readMinersTx !== "undefined" && event.readMinersTx
      const rawTransactions: RawDaemon_Transaction[] = event.transactions
      const maxBlockNumber: number = event.maxBlock
      const startBlockNumber: number = typeof event.startBlock !== "undefined" ? event.startBlock : 0
      const shardIndex: number = typeof event.shardIndex !== "undefined" ? event.shardIndex : 0
      const currentWallet: Wallet | null = Wallet.loadFromRaw(event.wallet)
      let hashes: string[] = []

      if (!currentWallet) {
        postMessage("missing_wallet")
        return
      }

      try {
        hashes = TransactionsExplorer.screenShardForOwnedHashes(rawTransactions, currentWallet, readMinersTx)
      } catch (err) {
        console.error("Failed to screen shard:", err)
      }

      postMessage({
        type: "screened",
        startBlock: startBlockNumber,
        maxHeight: maxBlockNumber,
        shardIndex,
        hashes,
      })
    } else if (event.type === "process") {
      logDebugMsg("process new transactions...")

      const readMinersTx = typeof event.readMinersTx !== "undefined" && event.readMinersTx
      const screenedOwned = typeof event.screenedOwned !== "undefined" && event.screenedOwned
      const rawTransactions: RawDaemon_Transaction[] = event.transactions
      const maxBlockNumber: number = event.maxBlock
      const startBlockNumber: number = typeof event.startBlock !== "undefined" ? event.startBlock : 0
      let currentWallet: Wallet | null = Wallet.loadFromRaw(event.wallet)
      const transactions: any[] = []

      logDebugMsg("rawTransactions", rawTransactions)

      if (!currentWallet) {
        logDebugMsg("Wallet is missing...")
        postMessage("missing_wallet")
        return
      }

      const addedHashes = new Set<string>()

      const tryProcessTx = (rawTransaction: RawDaemon_Transaction): void => {
        if (!rawTransaction?.height) {
          return
        }

        if (rawTransaction.hash && addedHashes.has(rawTransaction.hash)) {
          return
        }

        if (!readMinersTx && TransactionsExplorer.isMinerTx(rawTransaction)) {
          return
        }

        const isOwned = screenedOwned || TransactionsExplorer.ownsTx(rawTransaction, currentWallet!)
        if (!isOwned) {
          return
        }

        const txData = TransactionsExplorer.parse(rawTransaction, currentWallet!)

        if (txData && txData.transaction) {
          currentWallet!.addNew(txData.transaction)
          currentWallet!.addDeposits(txData.deposits)
          currentWallet!.addWithdrawals(txData.withdrawals)
          transactions.push(txData.export())
        }

        if (rawTransaction.hash) {
          addedHashes.add(rawTransaction.hash)
        }
      }

      for (let pass = 0; pass < 2; pass++) {
        for (const rawTransaction of rawTransactions) {
          try {
            tryProcessTx(rawTransaction)
          } catch (err) {
            console.error("Failed to process tx:", rawTransaction.hash ?? rawTransaction, err)
          }
        }
      }

      postMessage({
        type: "processed",
        startBlock: startBlockNumber,
        maxHeight: maxBlockNumber,
        transactions,
      })
    }
  } catch (err: any) {
    reportError(err)
  }
}

postMessage("ready")
