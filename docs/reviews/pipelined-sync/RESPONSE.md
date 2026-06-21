# perf: pipelined sync — review response

Reviewers (read-only): **CodeRabbit · Codex · GLM-5.2 · Gemini 3.1 Pro**.

| Sev | Source | Finding | Resolution |
|-----|--------|---------|------------|
| CRITICAL/MED | Gemini, GLM | **Orphaned-prefetch unhandled rejection** — the next batch's fetch starts before the current fold; if the fold throws and exits `syncOnce`, the prefetched promise is never awaited, and if it later rejects (flaky node) it fires `unhandledrejection`. | `void data.catch(() => {})` on the prefetch at creation — marks it handled; the real `await data` still surfaces the error so retry is unaffected. |
| LOW | GLM | Live-progress test relaxed to `>=`; could assert the cursor took multiple distinct values. | Added `expect(new Set(seen).size).toBeGreaterThanOrEqual(2)`. |

## Confirmed clean (all reviewers)

Folded data + order identical to the serial loop; block ranges (`from+1 … min(from+batch-1, height)`) unchanged, no off-by-one; loop termination exact; per-batch `scannedHeight` publish preserved (cursor now lags fetch-time by one batch — test reflects this); **strictly ≤1 request in flight** (no added node load / rate-limit risk); error propagation to `runSyncChain` intact; bound to `rt`, no new lock/switch exposure beyond the orphan case (now handled). CodeRabbit: no findings.
