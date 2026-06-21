/**
 * Pure change-detection for the multi-wallet background watcher (#108). Given the prior
 * per-wallet baseline and a fresh batch of {@link SecondaryWalletStatus} (one per unlocked
 * non-active wallet, after a background sync), decide which wallets newly received funds or
 * a message, and produce the next baseline.
 *
 * First observation of a wallet seeds the baseline WITHOUT a notice (we only announce
 * positive *changes*, never the opening balance). A balance DECREASE (an outbound spend on
 * that wallet) is never a notice. No React, no storage, no engine — fully unit-testable.
 */
import type { SecondaryWalletStatus } from "@/lib/types";

/** The per-wallet snapshot we diff successive syncs against. */
export type WalletBaseline = {
  balanceAtomic: number;
  receivedCount: number;
};

/** A single "something arrived on a wallet you aren't viewing" event. */
export type WalletChangeNotice = {
  id: string;
  label: string;
  kind: "funds" | "message";
  /** Atomic amount gained, for the "funds" kind. */
  deltaAtomic?: number;
};

export type DetectResult = {
  notices: WalletChangeNotice[];
  next: Map<string, WalletBaseline>;
};

/**
 * Diff `statuses` against `prev`, returning the notices to fire and the next baseline map.
 * A wallet seen for the first time only seeds the baseline. A funds notice fires on a
 * balance increase; a message notice on a received-count increase (both can fire for the
 * same wallet in one pass).
 */
export function detectWalletChanges(
  prev: ReadonlyMap<string, WalletBaseline>,
  statuses: readonly SecondaryWalletStatus[],
): DetectResult {
  const notices: WalletChangeNotice[] = [];
  const next = new Map<string, WalletBaseline>();

  for (const status of statuses) {
    const balanceAtomic = Math.max(0, status.balanceTotal.atomic);
    const receivedCount = Math.max(0, status.receivedCount);
    next.set(status.id, { balanceAtomic, receivedCount });

    const before = prev.get(status.id);
    if (!before) continue; // first observation → baseline only, no notice

    if (balanceAtomic > before.balanceAtomic) {
      notices.push({
        id: status.id,
        label: status.label,
        kind: "funds",
        deltaAtomic: balanceAtomic - before.balanceAtomic,
      });
    }
    if (receivedCount > before.receivedCount) {
      notices.push({ id: status.id, label: status.label, kind: "message" });
    }
  }

  return { notices, next };
}
