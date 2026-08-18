import { clearPasskeyEnrollment } from "@/lib/auth/biometric-store";
import { goalsStore } from "@/lib/storage/goals-store";
import { clearPulseMeta } from "@/lib/storage/pulse-meta";
import { clearSchedules } from "@/lib/storage/scheduled-payments-store";

export type ClearWalletLocalMetaOpts = {
  /** Reset pulse dismissals when the active wallet is deleted (session ends). */
  pulseDismissals?: boolean;
};

/**
 * Erase device-local UI metadata for one wallet (goals, passkeys, pulse leftovers).
 * Called on wallet delete — active or non-active.
 */
export async function clearWalletLocalMeta(
  walletId: string,
  opts: ClearWalletLocalMetaOpts = {},
): Promise<void> {
  if (!walletId) return;
  clearPasskeyEnrollment(walletId);
  await goalsStore.clear(walletId).catch(() => {});
  clearSchedules(walletId);
  clearPulseMeta({ dismissals: opts.pulseDismissals });
}
