/**
 * App mode from `.env.local` / shell (Next.js inlines `NEXT_PUBLIC_*` at build time).
 *
 * Copy `.env.example` → `.env.local` and set `NEXT_PUBLIC_USE_MOCK=false` for the real wallet.
 */
function readUseMockWallet(): boolean {
  const raw = process.env.NEXT_PUBLIC_USE_MOCK
  if (raw === undefined || raw === "") return true
  return raw !== "false"
}

export const env = {
  /** `true` = mock services (default). `false` = real browser wallet (`lib/wallet-core`). */
  useMockWallet: readUseMockWallet(),
  /** Mock mode persists UI session in localStorage; real mode does not store keys in session. */
  persistWalletSession: readUseMockWallet(),
} as const
