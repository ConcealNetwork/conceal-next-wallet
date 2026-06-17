# Local insights — review notes

Feature #3: an on-device activity-analytics page (received/sent/net, interest earned, monthly flow, activity breakdown), computed purely client-side from existing transaction + deposit history. No backend, no analytics SaaS.

## Review
- **CodeRabbit** — no findings.
- **Antigravity (Gemini 3.1 Pro)** — completed with no output/findings.
- **Codex** — out of credits; **GLM** — skipped (hangs).

## Self-review
- `deriveInsights` is a pure function with explicit type categorization (in: receive/miner/withdrawal; out: send/deposit; neutral: fusion/message). "Net flow" is honestly labelled "received − sent".
- Month bucketing uses `timestamp.slice(0,7)` (ISO/UTC — coarse, so no DST/locale issues); `monthRange` gap-fills contiguously and is bounded (advances year on month>12). Empty-timestamp txs are skipped from buckets/series.
- O(n log n) (one sort); memoized in the page via `useMemo`. Atomic sums use Number — fine for realistic histories; the totals feed `formatCcx`/`ccxToNumber` like the rest of the app.
- Bar chart guards division-by-zero (`Math.max(1, …)`), is `aria-hidden` (the same numbers are exposed in the stat cards + breakdown, mirroring the existing sparkline pattern).
- Purely local: only reads existing query hooks; nothing is sent anywhere.

## Verification
`npm run types && npm run lint && npm test` (276 unit, incl. 5 insights) green; `NEXT_PUBLIC_USE_MOCK=false npm run build` clean; `e2e/insights.spec.ts` passes.
