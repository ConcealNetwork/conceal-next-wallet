import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import { assertCanSpend } from "@/lib/services/view-only";

/**
 * Defence-in-depth guard for real-mode spend operations. Reads the engine's
 * existing `Wallet.isViewOnly()` (true when the private spend key is empty) and
 * throws a `ViewOnlyWalletError` before any transaction is built. The UI also
 * disables these actions; this guarantees a non-UI caller can't slip through.
 */
export async function assertRealWalletCanSpend(message: string): Promise<void> {
  await ensureAllWalletLegacyLibs();
  const { getRuntimeWallet } = await import("@/lib/wallet-core/wallet-runtime");
  assertCanSpend(getRuntimeWallet()?.isViewOnly() ?? false, message);
}
