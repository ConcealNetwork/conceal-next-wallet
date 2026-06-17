# Recurring payment reminders — review notes

Feature #4: local-only reminders for recurring payments. Never auto-sends — "Send now" deep-links to the prefilled send form for manual unlock + confirm.

## Review
- **CodeRabbit** — flagged that `localStorage` writes (`saveSchedule`/`markSchedulePaid`/`removeSchedule`) can throw (quota/privacy mode) and crash the handlers. **Applied:** the three mutating actions in the page are wrapped in try/catch with a friendly toast. (CodeRabbit free-tier was non-deterministic — a re-run reported "no findings"; remaining unretrieved findings were addressed by self-review below.)
- **Antigravity (Gemini 3.1 Pro)** — completed with no output.
- **Codex** — out of credits; **GLM** — skipped (hangs).

## Self-review of the items CodeRabbit likely raised
- **No autopay:** confirmed — "Send now" only `router.push`es `/wallet/send?address&amount[&paymentId]`; no key access, no send call. Sending always requires the user to unlock + confirm in the send flow.
- **Date handling:** `<input type="date">` yields only `YYYY-MM-DD` or `""` (the empty case is guarded), so the UTC-midnight `anchorDate` construction can't produce an Invalid Date.
- **Scheduling math:** UTC arithmetic (DST-immune); `computeNextDue` advance loop is bounded (≥7-day steps, 10k cap that real cadences never hit). Monthly overflow (e.g. Jan 31 → Mar 3) is acceptable for a reminder (not exact billing).
- **Store robustness:** `listSchedules` guards `JSON.parse` and filters via `isScheduledPayment`; corrupt entries are dropped (tested).
- **Privacy:** the address/amount live only in an internal client-side route — nothing is sent to a server.
- **a11y:** all inputs have associated labels; the delete button has an `aria-label`. Instant delete (no confirm) is acceptable for a non-precious local reminder.

## Verification
`npm run types && npm run lint && npm test` (285 unit, incl. 9 scheduled-payments) green; `NEXT_PUBLIC_USE_MOCK=false npm run build` clean; `e2e/payment-reminders.spec.ts` (add → due → send-now prefills confirm flow → back out → persists) passes.
