// @ts-nocheck
import { Observable } from "./numbersLab/Observable"
import type { Wallet } from "./Wallet"

type SyncListener = () => void

const listeners = new Set<SyncListener>()
let observedWallet: Wallet | null = null
let observerCallback: ((eventType: string, data: unknown) => void) | null = null

function notifyListeners() {
  for (const listener of listeners) {
    listener()
  }
}

export function registerWalletSyncNotifier(wallet: Wallet): void {
  unregisterWalletSyncNotifier()
  observedWallet = wallet
  observerCallback = () => notifyListeners()
  wallet.addObserver(Observable.EVENT_MODIFIED, observerCallback)
}

export function unregisterWalletSyncNotifier(): void {
  if (observedWallet !== null && observerCallback !== null) {
    observedWallet.removeObserver(Observable.EVENT_MODIFIED, observerCallback)
  }
  observedWallet = null
  observerCallback = null
}

export function subscribeWalletSync(listener: SyncListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
