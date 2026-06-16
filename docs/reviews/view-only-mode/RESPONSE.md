# Review response — view-only mode

Reviewers: Codex (gpt-5.5), Gemini 3.1 Pro, GLM-5.2, CodeRabbit. All four agreed
the core guarantee is sound: every real-mode spend path
(`send` / `deposit create` / `deposit withdraw` / `message send` / `optimize`)
is guarded by `assertRealWalletCanSpend`, derived from the engine's
`Wallet.isViewOnly()`; mock mirrors the guard; the mapper chokepoint covers all
producers; immutability holds.

## Addressed
- **[HIGH] Settings "Optimize Now" not view-only-aware** (GLM; Codex) — added
  `useWalletViewOnly` to the settings page: button disabled + `title`,
  `handleOptimize` short-circuits with `walletCopy.viewOnlyOptimizeDisabled`, and
  the "optimize your dust" prompt is replaced with a view-only note.
- **[MEDIUM] Deposits create dialog missing handler short-circuit + Review
  disabled** (Codex; GLM) — `CreateDepositDialog` now reads `useWalletViewOnly`,
  `confirmCreate` short-circuits, and the Review Deposit button is disabled.
- **[MEDIUM] Mock `openWallet` (and `disconnect`) didn't reset view-only** (Codex;
  GLM) — both reset `mockViewOnly = false`, so the default mock open is
  spend-capable and tests are order-independent.
- **[LOW] Export page didn't note the blank spend key** (Codex; GLM) — a view-only
  note now renders on the Backup Data card.
- **Bonus (pre-existing crash, found via e2e):** the Deposits page threw
  `ReferenceError: config is not defined` in mock mode — the legacy
  `InterestCalculator` reads a global `config` only injected in real mode. Added
  `lib/config/legacy-interest-config.ts` to provide it in mock mode without
  clobbering real mode. This is unrelated to view-only but blocked the Deposits
  page in the default (mock) build.

## Deferred (with reasons)
- **[MEDIUM, GLM] Mock view-only state doesn't survive a page reload.** Accepted —
  documented in `spec-merged.md §4` / the original spec §4.2. Mock mode is a UI
  demo; real mode is correct (re-derives from the re-unlocked wallet's empty
  spend key). Persisting a demo-only flag to localStorage isn't worth coupling the
  mock service to session storage. The e2e never reloads mid-test.
- **[LOW, GLM] `assertRealWalletCanSpend` no-ops when no runtime wallet is open.**
  Intentional: with no wallet open there is nothing to spend, and the operation
  then throws "Wallet is not open." The guard only needs to fire when a wallet
  *is* open.
- **CodeRabbit (5 Minor).** All target the design-mockup HTML under
  `docs/design/` (the amber-filled button variant we explicitly rejected), not
  source. No action.
