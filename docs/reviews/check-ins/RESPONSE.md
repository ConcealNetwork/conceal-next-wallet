# Check-ins (proof-of-life monitor) — review notes

Watcher-side proof-of-life feature: flag a contact as overdue if no received message arrives within interval + grace. Design synthesized from a 4-agent brainstorm (Gemini + GLM + repo-grounded Opus; Codex out of credits).

## Review
- **CodeRabbit** — 4 findings:
  - **CRITICAL (fixed):** `nowISO` was `useMemo(…, [])` → stale if the page stays open; statuses/snooze-expiry wouldn't update. Now computed fresh each render (cheap — a few watchers over an in-memory list).
  - **MINOR (fixed):** e2e now asserts the interval (`every 14d`) persists across reload, not just the label. Also surfaced the interval in the "waiting" detail line.
  - **MAJOR (already handled):** `localStorage.setItem` can throw (quota/privacy). Every store mutation is called from the page inside a try/catch that toasts a friendly error — surfacing it to the user, which is better than swallowing it inside `persist` (that would hide the failure). Left as-is by design.
  - (minor, already correct): validation/guards in the store.
- **Antigravity (Gemini 3.1 Pro)** — completed with no output.
- **Codex** — out of credits; **GLM** — used in the design phase, skipped for review (hangs).

## Self-review
- **Sync-gating** (the key correctness point): `useWalletSynced` (`currentHeight >= networkHeight − 1`) gates both the nav-badge count and the once-per-load toast, so an in-progress sync can't raise a false overdue.
- **Matching:** keys on `counterpartyAddress` of *received messages* — correct, because CryptoNote received *payments* don't reveal a sender; only messages do. Address-rotation blindness is acknowledged in the design (a future "monitoring this address" note).
- **Status logic:** `waiting` (no history) never goes overdue; snooze/pause take precedence; boundaries tested (ok → due-soon → overdue, snooze-then-expire).
- **Privacy/safety:** purely local reads of already-synced messages; honest copy never implies death.

## Verification
`npm run types && npm run lint && npm test` (295 unit, incl. 10 check-ins) green; `NEXT_PUBLIC_USE_MOCK=false npm run build` clean; `e2e/check-ins.spec.ts` (watch → status → pause/resume → persist incl. interval → remove) passes.
