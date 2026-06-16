# Review response — per-transaction local notes

Reviewers: **CodeRabbit** (CLI, free tier), **GLM-5.2** (z.ai, direct). **Codex
was unavailable this pass** (workspace out of credits) — noted so the usual triple
review is on record as a double.

Consensus: the design is sound. XSS-safe (React text escaping), correct `key={hash}`
remount (no stale editor state across tx switches), correct React Query
`enabled`/`staleTime: Infinity`/null-key handling, and the service-layer bypass
(notes in `lib/storage`, consumed directly) is the right call to keep `wallet-core`
out of mock mode.

## Addressed

- **Silent data loss in the IndexedDB fallback** (GLM, HIGH) — the original
  `resilientBackend` latched `degraded = true` on the first op error and routed all
  later writes to in-memory, which vanish on reload. Worse: our `onversionchange`
  handler closes the connection when another tab upgrades the DB, so the memoized
  connection would throw forever. **Fix:** removed the silent in-memory swap. The
  IndexedDB backend is now self-healing — it drops and reopens the connection and
  retries once on failure; a second failure propagates so `useTxNote` shows an honest
  "couldn't save" toast. In-memory is used **only** when IndexedDB is genuinely absent
  (SSR / static-export prerender).
- **Character-counter vs `maxLength` mismatch** (CodeRabbit MINOR; GLM MEDIUM) — the
  counter used `draft.trim().length` while `maxLength` constrains the raw string.
  **Fix:** counter now uses `draft.length`, matching the typing limit; the store still
  trims/clamps on save.
- **Mutation not guarded against a null hash** (CodeRabbit MAJOR) — the store already
  rejects an empty hash (so it was never a silent bad-write), but `useTxNote.save` now
  fails fast at the hook boundary too, making the contract explicit.

## Deferred (with reason)

- **Optimistic `onMutate` update** (GLM MEDIUM) — IndexedDB writes here are sub-5ms, so
  the "Saving…" state is imperceptible. An optimistic update adds rollback complexity
  and can momentarily render a failed save as succeeded; the current await-then-update
  is correct and simpler. Revisit only if profiling shows real latency.
