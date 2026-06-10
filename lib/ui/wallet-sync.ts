import type { WalletInfo } from "@/lib/types";

/** True while the wallet scan is more than two blocks behind the daemon tip. */
export function isWalletHeightSyncing(currentHeight: number, networkHeight: number): boolean {
  if (networkHeight <= 0) return false;
  return currentHeight + 2 < networkHeight;
}

export function isWalletSyncing(info: WalletInfo | undefined): boolean {
  if (info === undefined) return false;
  return isWalletHeightSyncing(info.currentHeight, info.networkHeight);
}

export function walletSyncPercent(info: WalletInfo | undefined): number {
  if (info === undefined || info.networkHeight <= 0) return 0;
  return Math.min(100, Math.floor((info.currentHeight / info.networkHeight) * 100));
}
