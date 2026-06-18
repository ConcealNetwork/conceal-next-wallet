/**
 * App mode from `.env.local` / shell (Next.js inlines `NEXT_PUBLIC_*` at build time).
 *
 * Copy `.env.example` → `.env.local` and set `NEXT_PUBLIC_USE_MOCK=false` for the real wallet.
 */
function readUseMockWallet(): boolean {
  const raw = process.env.NEXT_PUBLIC_USE_MOCK;
  if (raw === undefined || raw === "") return true;
  return raw !== "false";
}

/**
 * Real-mode wallet engine selector (only meaningful when `useMockWallet` is false).
 * Defaults to `"sdk"` (the `conceal-wallet-sdk`-backed engine, `lib/services/real-sdk`);
 * set `NEXT_PUBLIC_WALLET_ENGINE=wallet-core` to fall back to the legacy
 * `lib/wallet-core` engine (`lib/services/real`) — the escape hatch during cutover.
 */
function readWalletEngine(): "sdk" | "wallet-core" {
  return process.env.NEXT_PUBLIC_WALLET_ENGINE === "wallet-core" ? "wallet-core" : "sdk";
}

export const env = {
  /** `true` = mock services (default). `false` = real browser wallet. */
  useMockWallet: readUseMockWallet(),
  /** Mock mode persists UI session in localStorage; real mode does not store keys in session. */
  persistWalletSession: readUseMockWallet(),
  /** Real-mode engine: `"sdk"` (conceal-wallet-sdk) or `"wallet-core"` (legacy). */
  walletEngine: readWalletEngine(),
} as const;
