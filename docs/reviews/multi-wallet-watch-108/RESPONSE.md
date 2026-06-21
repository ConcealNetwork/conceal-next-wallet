# #108 — Multi-model review response

Reviewers: **CodeRabbit** · **Codex (gpt-5.5)** · **GLM-5.2** · **Gemini 3.1 Pro**. Strong convergence on three races + several hardening items. All fixes landed on `feat/multi-wallet-watch-108`; full gate green (types · lint · tests · build).

| Sev | Source(s) | Finding | Resolution |
|-----|-----------|---------|------------|
| HIGH | GLM, Gemini | **Active-switch race**: a wallet switched-to mid-loop still gets a "received funds" notice for the wallet you're now viewing | `syncSecondaryWallets` re-checks `activeWalletId()` and skips a now-active wallet (it syncs in the foreground). |
| HIGH | Gemini, GLM | **`tick()` re-entrancy**: the 45s timer + a tab refocus can overlap, both diffing the same baseline | `ticking` guard in the hook (early-return while a tick is in flight; `try/finally` resets). |
| HIGH/MED | GLM, Codex, Gemini | **Lock mid-loop**: the loop kept scanning/persisting non-active wallets after `lock()` cleared the map | `hasUnlockedRuntime(id)` re-checked before AND after each scan; skips locked wallets. |
| MED | GLM | **Notify-after-lock** (privacy): a lock between sync and the notify loop could still surface a wallet label + amount | Re-check `active` (+ `canNotify()`) immediately before the notify loop. |
| MED | Codex | **Transient failure drops baseline**: a wallet missing from one round was re-seeded, suppressing a notification for funds that arrived during the outage | `detectWalletChanges` now starts `next` from `prev`, carrying forward absent wallets. |
| MED | GLM | **Mock-mode no-op polls**: a stale `ccx-watch=true` from a prior real session drove empty 45s polls in mock | Hook early-returns when `env.useMockWallet`. |
| MAJOR | CodeRabbit, GLM | **`rt.id ?? ""`** mismatched the registry-id convention → empty label | `unlockedNonActiveRuntimes()` returns the authoritative `{id, runtime}` (map key); hook falls back to "another wallet" if a label is missing. |
| MAJOR | CodeRabbit | **`localStorage` can throw** (Safari private mode / quota) | `try/catch` around both watch-wallets store accessors. |
| LOW | GLM, Gemini | `if (rt.account)` guard (in merged #109 code) is dead | Left as a harmless defensive guard; acknowledged. |
| process | GLM | CLAUDE.md not updated | Added a Background-watch (#108) + Mempool-incoming (#109) paragraph. |
| process | GLM | Hook orchestration untested | Added `tests/use-secondary-wallet-watch.test.tsx` (fake-timers: silent first observation, notify on later delta, `canNotify` gate). |

## Deferred / dismissed

- **i18n notification strings (CodeRabbit MAJOR).** Deferred deliberately: the existing `notify()` calls (`use-due-reminders`, `use-check-ins`) are English, so localizing only these two would be inconsistent. Tracked for a single "localize all `notify()`" sweep. The settings toggle label IS localized (10 locales).
- **Deferred-e2e (CodeRabbit MAJOR).** #108 is read-only sync + notify — it never broadcasts. The pure diff + the hook test cover the logic; a live multi-wallet e2e needs two funded testnet wallets + the (currently-down) daemon. Deferred with #109's live pass.
- **CodeRabbit "incomplete tool output" minors** — CR was reviewing the raw reviewer-dump `.md` artifacts in the working tree (now removed); not code findings.
- **N × `getTransactionsPool` per poll / single-wallet no-op tick (GLM LOW).** Acceptable for an opt-in; the service returns `[]` fast when there are no secondary runtimes.

## Confirmed clean (reviewers' explicit checks)

Binding to `rt` (not `requireRuntime()`) holds — a mid-loop foreground switch can't redirect a scan into another keyspace (`syncRuntime`/`persistRuntime` coordinate per `runtimeId`). Baseline seeding, balance-decrease-skip, `detectWalletChanges` immutability, two-layer gating, and effect cleanup all verified. 10-locale settings i18n complete.
