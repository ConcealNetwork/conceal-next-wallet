/**
 * Pure change-detection for the multi-wallet background watcher (#108). Given the prior
 * per-wallet baseline and a fresh batch of {@link SecondaryWalletStatus} (one per unlocked
 * non-active wallet, after a background sync), decide which wallets newly received funds or
 * a message, and produce the next baseline.
 *
 * First observation of a wallet seeds the baseline WITHOUT a notice (we only announce
 * positive *changes*, never the opening balance). A balance DECREASE (an outbound spend on
 * that wallet) is never a notice. The "funds" notice is on the NET balance delta across the
 * window, not a per-tx event (a receive-then-spend inside one window nets out — acceptable
 * for a best-effort heads-up). No React, no storage, no engine — fully unit-testable.
 *
 * Baselines for wallets ABSENT from `statuses` are carried forward unchanged (not dropped),
 * so a wallet that transiently failed to sync this round isn't re-seeded — funds that
 * arrived during its outage are still announced once it reappears (#108 review — Codex).
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
  // Start from the prior baseline so wallets missing from this round (a transient sync
  // failure) keep their last-seen values instead of being re-seeded.
  const next = new Map(prev);

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
