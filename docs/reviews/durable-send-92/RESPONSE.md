# #92 phase 1 — Multi-model review response

Reviewers: **CodeRabbit · Codex (gpt-5.5) · GLM-5.2 · Gemini 3.1 Pro**. Spend-path feature → reviewed for fund safety. (Gemini ran with write access and pre-applied two of its fixes to the tree; all changes were re-verified before keeping. Logged the read-only-review learning for next time.)

All fixes landed; gate green: types · lint · 561 tests · build.

| Sev | Source(s) | Finding | Resolution |
|-----|-----------|---------|------------|
| HIGH | GLM, Codex | **Cross-path reservation gap** — deposit / withdraw / message / fusion selected inputs via `unspentOutputs` (queue-blind), so they could build on an input a queued send had reserved → conflicting tx, one rejected at relay. | All four build paths now select via `selectableOutputs` (excludes BOTH pending-store and queue reservations). Full durability (enqueue) for those paths is deferred — see below. |
| HIGH | Gemini, Codex, GLM | **Cancel of a `broadcast` entry** force-removed it + cleared its pending record → freed inputs while the tx is live on the network → double-spend. | `cancelQueuedTransaction` refuses a `broadcast` entry (returns false, leaves the pending row); only `pending` (cancel) / `failed` (dismiss) are removable. The card hides the cancel control on `broadcast` rows. |
| HIGH | GLM | **Drain race** — `enqueueAndBroadcast`'s drain + the send's `sync()` + `syncOnce` could overlap on one queue: a duplicate-relay `failed` could overwrite a `broadcast`, and cancel-then-drain could re-persist a cancelled entry. | `queueForRuntime` returns a wrapper that serializes every mutation (enqueue / drainOnce / cancel / remove) through a per-queue promise chain; reads stay lock-free. New test asserts concurrent drains never overlap. |
| HIGH/MED | Codex, GLM | **persist/sync bound to ACTIVE runtime**, not the one passed in — a switch mid-send could persist the wrong blob (and the original code's flaw). | `enqueueAndBroadcast` + the legacy `broadcast` + `cancelQueuedTransaction` now use `persistRuntime(rt)` / `syncRuntime(rt)`. Combined with persist-BEFORE-enqueue, a persistence failure throws before anything is broadcast → no double-send. |
| MED | GLM | `cancelQueuedTransaction` always returned `true` (even for unknown ids), violating the interface contract. | Returns `false` for unknown / `broadcast`; `true` only when an entry was actually cancelled/dismissed. |
| LOW | GLM | `maxAttempts: 12` (~2 min at a 10 s tick) would fail a re-broadcastable tx during a short outage — contradicts "never lose a payment." | Dropped the attempt cap; entries are time-bound by `maxAgeMs` (= `PENDING_TTL_MS`) only. A genuine daemon reject still fails immediately. (Subsumes CodeRabbit's `failedReason`-on-attempt-exhaustion nudge — that path no longer exists.) |
| LOW | GLM | `id === hash` coupling implicit in the pending-record filter. | Commented (SDK guarantees `entry.id === entry.hash`). |

## Deferred (documented scope of phase 1)

- **Durable broadcast for message / deposit / withdraw / fusion.** These now respect queue reservations (input selection) but still relay via the direct `broadcast()` (throw-on-failure), exactly as before — **not a regression**. Extending `enqueueAndBroadcast` to them is a mechanical follow-up. Phase 1 makes plain + inline-message *transfers* durable, which is the #92 "resilient one-off sends" core.
- **Send-result "queued vs sent" surfacing.** A transient-failure send returns success (the tx is durably queued); the OutboundQueueCard shows its "Queued/Retrying" state. Threading an explicit queued-vs-broadcast signal into the send-success UX is a follow-up.

## Confirmed clean (reviewers' checks)

`failed`-vs-`pending` decision is correct (only a daemon reject → `failed` → throw; transient → `pending`, never masquerades a failure as success). `enqueue` idempotent on hash. No cross-wallet hazard in the `syncOnce` drainer (per-runtime WeakMap queue + namespaced storage; secondaries never run a send path). Lock mid-drain is safe (closures hold `rt`; data persists to that wallet's keyspace).
