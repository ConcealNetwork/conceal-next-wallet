# #92 phase 2 — Multi-model review response

Reviewers: **CodeRabbit · Codex (gpt-5.5) · GLM-5.2 · Gemini 3.1 Pro** (run **read-only** this time — no agent edited the tree). Unattended real-fund auto-send → reviewed hard for double-send. All fixes landed; gate green: types · lint · 571 tests · build.

| Sev | Source(s) | Finding | Resolution |
|-----|-----------|---------|------------|
| CRITICAL | Gemini ×2, GLM-H1 | **Cross-tab / stale-iteration double-send** — two unlocked tabs (or the array captured before an `await`) could both fire the same due instance. | Three layers: (1) a cross-tab **Web Lock** (`navigator.locks`, `ifAvailable`) so only one tab runs the tick; (2) **`markSchedulePaidIfDue`** — an atomic re-read + re-check-due + advance run *immediately* before the send (skip if it returns false); (3) the persisted advance bounds reload/crash. |
| CRITICAL | GLM-C1 | **Cross-wallet** — schedules are device-global, so an armed schedule would auto-send from whatever wallet is *active*, possibly the wrong one. | Stamp `autoSendWalletId` at arm; `schedulesToAutoSend` only fires a schedule when its stamped id matches the active wallet (unstamped/legacy → active wallet). |
| HIGH | Gemini | **viewOnly bypass while loading** — `viewOnly ?? false` is false mid-load, so the engine could fire before it knows the wallet is watch-only. | Gate on wallet info being LOADED (`walletInfo.data?.viewOnly === false`); nothing runs until known-spendable. |
| HIGH/LOW | Gemini, GLM | **Silent drop on send failure** — advance-before-send + an ephemeral toast means an unattended user misses a failed payment. | Keep advance-before-send (the right call — confirmed by all reviewers), but add a persistent **OS notification** on auto-send failure (in addition to the toast). |
| MED | GLM-M1 | `inFlight.add` could leak if `markSchedulePaid` threw between it and the inner try. | The whole per-item body (advance + send) is now wrapped in `try/finally` so `inFlight.delete` always runs. |
| LOW | Gemini | Unparseable amount → silent 30s retry loop forever. | On an invalid amount the schedule is **disarmed** + an error toast; it can't loop. |
| test | CodeRabbit, GLM | No error-path / idempotency tests. | Added: failed-send still advances + does NOT re-send on the next tick (CAS returns false); wallet-scoping selector test; `markSchedulePaidIfDue` CAS test. |

## Deferred / dismissed

- **i18n of the auto-send toasts (Gemini MED).** Kept English — these report a fund movement ("Auto-sent X CCX"), which is consequence copy, consistent with the consent dialog + the existing English send/broadcast confirmations. The locale-parity test is unaffected (no keys added); neutral labels (switch, badge) ARE localized.
- **`saveSchedule` would drop `autoSend` if an edit flow is added (GLM L2).** No edit flow exists today (the page only adds); flagged for whoever adds one. No change now.

## Confirmed clean (reviewers' checks)

Advance-BEFORE-send is the correct design (a transient network error resolves to `pending` without throwing, so it does NOT advance-and-skip; only a daemon reject / pre-broadcast validation throws). Consent cannot be bypassed (arming requires the dialog's confirm). Mock never auto-sends real funds. The 30s timer + `visibilitychange` listener are cleaned up on unmount.
