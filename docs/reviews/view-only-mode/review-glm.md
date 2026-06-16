# View-only mode — pre-PR review (GLM)

Branch `feat/view-only-mode`, reviewed against `docs/specs/view-only-mode/spec-merged.md`.
Baseline: `npm run types` clean; `npx vitest run tests/view-only.test.ts` → 8/8 pass.

The core guarantee is solid: **all five real-mode spend paths** — `sendTransactionOperation`,
`sendMessageOperation`, `createDepositOperation`, `withdrawDepositOperation`, and
`optimizeWalletOperation` (fusion) — are guarded by `assertRealWalletCanSpend`, which reads
`Wallet.isViewOnly()` (`lib/wallet-core/Wallet.ts:298`, `keys.priv.spend === ""`) at call time.
No real-mode `createTx`/`createWithdrawTx`/`createFusionTransaction` path bypasses the guard, and
the mapper chokepoint (`lib/wallet-core/mappers.ts:84`) correctly re-derives the flag for every
real producer. Mock mirrors the guard on all four spend services. Findings below are UX /
spec-adherence / mock-fidelity gaps, not production fund-loss bugs.

## Findings

- **[HIGH] Settings "Optimize Now" trigger is not view-only-aware, and the "optimize your dust"
  prompt is not suppressed.** `app/(wallet)/wallet/settings/page.tsx:302-307` (button `disabled`
  is `optimizeWallet.isPending || optimizationStatus.isLoading || !optimizationNeeded || isSyncing`
  — no `viewOnly`), `:254-266` (`handleOptimize` has no short-circuit), and `:316-320` (the
  "Optimization can be attempted — N unspent UTXOs" `<p>` renders purely on `optimizationNeeded`).
  The settings page never imports `useWalletViewOnly`. Spec §4.7 explicitly requires this ("_all
  four specs flagged it_"): *"Guard its trigger on `viewOnly` too … Also suppress any 'optimize
  your dust' prompt for view-only wallets."* The service-layer guard
  (`lib/services/real/settings.service.ts:23` + mock `lib/services/mock/settings.service.ts:52`)
  prevents an actual fusion tx, so no funds are at risk — but a view-only user can click a live
  "Optimize Now", see "Optimizing…", then get an error toast, and is actively invited by the
  prompt. **Fix:** in `SettingsPage`, `const viewOnly = useWalletViewOnly();`, OR it into the
  button `disabled`, early-`return` in `handleOptimize` with `toast.error(walletCopy.viewOnlyOptimizeDisabled)`,
  and gate the `optimizationNeeded` `<p>` on `&& !viewOnly` (also add `title={viewOnly ? walletCopy.viewOnlyOptimizeDisabled : undefined}`).

- **[MEDIUM] Mock/real divergence on page reload: mock view-only state resets to `false`, which
  also disables the guard so sends succeed.** `lib/services/mock/wallet.service.ts:9` — `let
  mockViewOnly = false` is transient module state. After a view-only keys import in mock mode, a
  full page reload re-evaluates the module → `mockViewOnly` is `false` again. The persisted
  React-Query/session cache still says `viewOnly:true` for one paint, but the next
  `services.wallet.getWalletInfo()` refetch returns `viewOnly:false`; the banner disappears, the
  Send/Deposit/Message controls re-enable, and the mock spend services read `isMockViewOnly() === false`
  → **`sendTransaction`/`createDeposit`/`withdrawDeposit`/`sendMessage` resolve successfully**.
  Real mode is correct (`mapWalletToInfo` re-derives from the re-unlocked wallet's empty spend key).
  Spec §4.2 acknowledges the stale-refetch symptom and waves it off as "e2e never reloads
  mid-test", but the divergence is real: mock is the *default* mode (`NEXT_PUBLIC_USE_MOCK=true`),
  so manual/mock testing of view-only silently breaks on reload and the guard is bypassable there.
  **Fix:** persist `mockViewOnly` alongside the mock session (e.g. mirror it in the
  `conceal-next-wallet-session` localStorage payload, or a dedicated key, and read it in the mock
  wallet service on init / inside `currentWalletInfo`) so it survives reload like real mode does.

- **[MEDIUM] Deposits create flow is missing the two guards the spec mandates for it.**
  `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1286-1288` — `confirmCreate` just calls
  `onCreate({ amount, durationMonths })` with no `viewOnly` short-circuit; and `:1391-1399` — the
  "Review Deposit" button's `disabled={constraints?.isDepositDisabled || !amountIsValid || preview.isFetching}`
  omits `viewOnly`. Spec §3.4 (Deposits row) explicitly lists "Review-Deposit button" as a control
  to disable *and* "short-circuit `confirmCreate`/`confirmWithdraw`" as handler guards.
  `confirmWithdraw` is correctly guarded (`:1065-1069`), but the create side is not. Practical
  impact is low because both `setOpen(true)` entry points (header button `:137` and empty-state
  button `:199`, both using `createDisabled`) are disabled in view-only, so the dialog is
  unreachable via normal interaction, and `createDeposit.mutate` → service guard catches it
  regardless. Still a clear spec deviation and a missing belt-and-suspenders layer.
  **Fix:** thread `viewOnly` into `CreateDepositDialog` (prop or `useWalletViewOnly()`), OR it into
  the Review Deposit `disabled`, and early-return in `confirmCreate` with
  `toast.error(walletCopy.viewOnlyDepositDisabled)`.

- **[LOW] Mock view-only state leaks across `disconnect()`.** `lib/services/mock/wallet.service.ts:95-97`
  — `disconnect` is a no-op and does not reset `mockViewOnly`. After importing view-only then
  locking, `mockViewOnly` stays `true`; any later default `getWalletInfo`/`openWallet` still reports
  `viewOnly:true` until a full import/create runs. `_resetMockViewOnly()` exists but is test-only.
  Real mode re-derives on each open, so this is a mock divergence. **Fix:** set `mockViewOnly = false`
  in `disconnect()` (mock treats disconnect as "return to open-wallet screen", so clearing is
  consistent with `openWallet`'s default).

- **[LOW] Export page does not add the spec'd view-only "spend key is blank" note.**
  `app/(wallet)/wallet/export/page.tsx:90-95` renders `data?.spendKey`, which is the empty string
  for a view-only wallet (`exportWalletOperation` → `wallet.keys.priv.spend === ""`), with no
  explanatory copy. Spec §4.6: *"Export shows empty spend key — add a copy-only note in the export
  dialog when view-only ('Spend key is blank — view-only wallet')"*. The view key + address still
  show correctly and no key is leaked (it's genuinely empty), so this is purely a UX/clarity gap,
  not a security issue. (The mnemonic block at `:84-89` will also render blank for view-only and
  benefit from the same note.) **Fix:** `const viewOnly = useWalletViewOnly();` and render an amber
  note next to the spend-key/mnemonic blocks when `viewOnly`.

- **[LOW] `assertRealWalletCanSpend` silently no-ops when no runtime wallet is open.**
  `lib/services/real/view-only-runtime.ts:13` — `getRuntimeWallet()?.isViewOnly() ?? false` resolves
  to `false` when the runtime wallet is `null`, so `assertCanSpend(false, …)` throws nothing and the
  view-only guard is skipped on the "no wallet open" path. The subsequent op then throws
  `"Wallet is not open."` (`wallet-operations.ts:391` etc.), so there's no spend and no funds risk —
  but the guard's contract is surprising (it only protects when a wallet is open) and diverges from
  the mock, which reads `mockViewOnly` regardless. **Fix:** either document the null-case as
  intentional, or throw a dedicated error when `getRuntimeWallet()` is null so the guard fails
  closed instead of silently passing.

## Verified correct (no action needed)

- Mapper chokepoint (`lib/wallet-core/mappers.ts:84`) covers all real producers; `Wallet.isViewOnly()`
  is correct for both `keys`-view-only and `qr`-view-only import branches
  (`lib/wallet-core/wallet-operations.ts:143-159`, `:206-212`); reload in real mode re-derives.
- No `createTx` / `createWithdrawTx` / `createFusionTransaction` spend path is reachable without
  passing a guarded service method (UI hooks all go through `services.*`; UI never imports
  `wallet-core` directly per architecture).
- Immutability holds: mapper returns a fresh literal (`mappers.ts:82-94`); mock
  `currentWalletInfo` spreads a `structuredClone` then overrides `viewOnly`
  (`wallet.service.ts:21-23`, helper `helpers.ts:5-7`); `mockWalletInfo` fixture is never mutated
  (asserted by `tests/view-only.test.ts`).
- Required `viewOnly: boolean` field forces every `WalletInfo` literal to set it (`tsc --noEmit`
  clean; `tests/wallet-sync.test.ts:10` updated).
- Send page guards every entry into `review`/`send.mutate`: deep-link effect (`send/page.tsx:139-147`),
  form `onSubmit` (`:202-208`), `confirmSend` (`:171-174`); Address/QR card stays live.
- Messages: reading + `markRead` stay enabled; reply + compose send guarded
  (`messages/page.tsx:181-185`, `:212-216`, `:482`).
- All five spec'd banner pages render `<ViewOnlyBanner />`; `role="status"` +
  `data-testid="view-only-banner"`; `useWalletViewOnly` defaults `false` while loading (no flash).
