# #109 — Multi-model review response

Reviewers: **CodeRabbit** · **Codex (gpt-5.5)** · **GLM-5.2** · **Gemini 3.1 Pro**. Raw outputs in this directory (`codex.md`, `glm.md`, `gemini.md`, `coderabbit.md`).

All fixes landed in `091a758` (on top of `ea7adb1` feature + `5e0d66a` UI). Full gate green: `types` · `lint` · 544 tests · static build.

| # | Sev | Source(s) | Finding | Resolution |
|---|-----|-----------|---------|------------|
| A | HIGH | GLM, Gemini | Self-send / withdrawal / deposit inflates the `incomingPending` **bucket** (owned change/returned outputs hit the pool under a hash already in the outbound pending total) | `incomingPendingAtomic(raw, excludeHashes?)`; `mapWalletInfo` excludes live outbound-pending hashes. The tx **list** was already deduped. |
| B | HIGH | GLM, Codex | Pool scan awaited **before** persisting just-mined state → slow/hanging RPC delays the durable write | Persist mined state first; incoming reconcile persists separately. |
| C | HIGH | Codex | Pool-fetch failure skipped mined/TTL reconcile entirely → stale entries | Reconcile now runs regardless of fetch success (empty scan still drops mined + TTL-expired). |
| D | HIGH | Codex | `incomingPending` populated but never rendered | Already fixed in `5e0d66a` (Codex reviewed only the first commit) — account-rail "Incoming" row + 10-locale i18n. balance-hero intentionally untouched (proportional bar = % of `balanceTotal`, which this is deliberately NOT part of). |
| E | HIGH | Gemini | `toScanTransaction` ran outside the per-tx try/catch → a malformed tx aborts the whole poll | Moved inside the try. |
| H2 | HIGH | GLM, Gemini, Codex | Pool-RPC failure logs on every poll (daemon lacking the RPC) | Warn once per runtime (`WeakSet<SdkRuntime>`). |
| F | MED | CR, Gemini, GLM | `isIncomingRecord` didn't validate `timestampIso` (NaN age → never TTL-expires) | Guard `timestampIso` (+ optional `paymentId`) on read; treat NaN age as expired in reconcile. |
| G | MED | GLM | `Date.now()` read twice in one reconcile pass | Single `nowMs` for the whole pass. |
| M2 | MED | GLM | `paymentId` dropped on re-scan | Preserve `prior.paymentId`. |
| L1 | LOW | Codex, GLM | Duplicate pool entries not deduped by hash | Dedupe in `scanPoolForOwned` (seen-set) + reconcile. |
| L2 | LOW | Gemini, GLM | Pool order non-deterministic → reorder triggers a needless persist | Order-insensitive no-op check (Map of hash→amount); returns same ref. |
| race | LOW | Gemini, GLM | `rt.account` may be null after the `await` (wallet locked mid-poll) | Guard `if (rt.account)` after the fetch. |
| L3 | LOW | GLM | Mock parity — mock `WalletInfo` omitted `incomingPending` | Added a demo value (`8.5`) so mock mode showcases the feature. |

## Deferred / dismissed

- **L5 (GLM, LOW)** — `DaemonRawTransaction` declared in `runtime.ts` and (derived from `DaemonClient`) in `pool.ts`. Structurally compatible; consolidation is cosmetic. Deferred.
- **CodeRabbit CRITICAL — "conceal-wallet-sdk repo does not exist."** False positive. It's a separate first-party repo; **v0.2.0 is released** and the pinned release-tarball URL resolves. CR's free tier can't see the repo. No action.

## Validation note

Live mempool→mine e2e against the WSL testnet daemon is **deferred** (daemon currently down + box loaded). The logic is independently validated: live-confirmed pool RPC shape (pre-impl), owned-output detection reuses the proven mined-block scan path, and 20 unit tests cover store/reconcile/scan/dedup/exclude/mapping.
