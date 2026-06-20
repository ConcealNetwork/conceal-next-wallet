/**
 * Resolve the ACTIVE wallet's id for per-wallet passkey enrollment keying (#95).
 *
 * Passkey enrollments are stored per wallet id (`biometric-store.ts`). The id comes
 * from the SDK engine's wallet registry, but the passkey UI is mode-agnostic and
 * must never pull `conceal-wallet-sdk` into mock mode at module init. So the registry
 * module is loaded LAZILY and only in real mode; mock mode resolves to the default
 * id (its single-wallet behaviour).
 */
import { DEFAULT_WALLET_ID } from "@/lib/auth/biometric-store";
import { env } from "@/lib/env";

/**
 * The active wallet's id. Real SDK mode → the registry's active id; mock mode → the
 * default id. Best-effort: any failure (no storage, locked, registry read error)
 * falls back to the default id so passkey keying never throws.
 */
export async function getActiveWalletId(): Promise<string> {
  if (env.useMockWallet) {
    return DEFAULT_WALLET_ID;
  }
  try {
    const { readWalletsIndex } = await import("@/lib/services/real-sdk/wallets-index");
    return (await readWalletsIndex()).activeId;
  } catch {
    return DEFAULT_WALLET_ID;
  }
}
