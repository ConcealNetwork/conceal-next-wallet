# Feature brief — View-only mode

> Shared grounding for independent specs. Read this, then write your spec.

## What
Conceal Next Wallet can already **import** view-only wallets (address + private
view key, empty private spend key) but nothing surfaces this state. A user with a
watch-only wallet who taps **Send** currently hits a cryptic `createTx` failure
instead of a clean "this is a view-only wallet" message.

Goal: detect view-only state, expose it through the typed service layer, badge it
in the UI, and gracefully disable the operations that need a private spend key
(**Send**, **Deposits** create/withdraw, **Messages** send) with a friendly
explanation — instead of letting them fail deep in the engine.

Source: GitHub issue #21 (Security & safety → "View-only mode (M)").

## Architecture constraints (must follow)
- **The typed service layer is the spine.** UI talks only to `services` from
  `lib/services/index.ts`; never to `wallet-core` directly.
- **Change the interface AND both implementations.** A wallet feature touches
  `lib/services/wallet.service.ts` (interface) + `lib/services/real/wallet.service.ts`
  + `lib/services/mock/wallet.service.ts`. Changing only one mode breaks the other.
- **No engine change needed.** `lib/wallet-core/Wallet.ts:298` already exposes
  `isViewOnly()` (true when private spend key is null/empty). Do **not** modernize
  legacy `wallet-core` code.
- **Immutability.** Never mutate existing objects; return new copies.
- **Static export, no server.** Mock mode is the default (`NEXT_PUBLIC_USE_MOCK`
  defaults to true); real mode is lazy-required.
- **Biome** (2-space, double quotes, line width 100). Most app code is strict TS.

## Key code pointers
- `lib/types/index.ts:9` — `WalletInfo` type (add the flag here).
- `lib/services/wallet.service.ts` — `WalletService` interface + `ImportWalletInput`
  (the `keys` variant already carries `viewOnly: boolean`).
- `lib/services/real/wallet.service.ts` — maps engine → `WalletInfo`.
- `lib/services/mock/wallet.service.ts` — must let an e2e test reach view-only state
  (e.g. honour `importWallet({method:"keys", viewOnly:true})`).
- `lib/wallet-core/Wallet.ts:298` `isViewOnly()`, and `recalculateIfNotViewOnly()`.
- Pages to guard: `app/(wallet)/wallet/send/page.tsx`,
  `app/(wallet)/wallet/deposits/page.tsx`, `app/(wallet)/wallet/messages/page.tsx`.
- `lib/ui/wallet-copy.ts` — user-facing strings live here.

## Your spec must cover
1. **Data model** — exact `WalletInfo` change (and any other types).
2. **Service layer** — how `isViewOnly` is derived in real mode and simulated in mock
   mode; immutability; how `importWallet` view-only flows into stored state.
3. **UI/UX** — where the badge goes; how Send/Deposits/Messages are disabled and what
   the user is told; whether to block at route level, page level, or control level.
4. **Edge cases** — refresh after reload, switching wallets, deposits withdraw vs view,
   message send vs read, any place `createTx` could still slip through.
5. **Test plan** — unit (service + type), and the e2e path to put the app into
   view-only state in mock mode.
6. **Risks / open questions.**

Keep it concrete and grounded in the real files. Cite file paths.
