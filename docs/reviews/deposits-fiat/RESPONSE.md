# Review response — fiat (USD) on Deposits

Reviewers: Codex (gpt-5.5), GLM-5.2 (right-sized to 2 for a presentational change).
Both: math correct, `price > 0` gate correct, per-card `useMarketData` dedup fine —
no CRITICAL/HIGH.

## Addressed
- **USD label inconsistency** (Codex; GLM M1) — extracted `usdSubline(ccx, price)`
  in `lib/utils.ts` that returns `"$X USD"` (carries the suffix); both SummaryCard
  and DepositDetail now render `≈ {usd}` uniformly, matching Send/Account.
- **Missing test for the gate** (Codex; GLM M2) — `usdSubline` is now a pure,
  unit-tested helper (`tests/utils.test.ts`): price>0 → `formatUsd(ccx*price) USD`,
  price 0/unknown → `undefined`. This also DRYs the duplicated `price>0 ? … :` logic.
- **Hook after locals** (GLM L2) — hoisted `useMarketData()` above the derived
  locals in `DepositCard`, matching the convention in `DepositsSummary`/Send/Account.

## Deferred (with reason)
- **CLS / layout shift** when the subline appears (GLM L1) — minor; the line is
  small and below the value. Not worth a placeholder-row hack now.
- **Account/Send don't gate on `price>0`** (GLM L3) — those show `$0.0000` while
  loading; this PR's gate is a strict improvement. Lifting it into a shared
  `<UsdSubline>` across all three pages is a sensible follow-up, out of scope here.
- **Per-card `useMarketData` subscribers** (GLM L4) — non-issue; React Query dedups
  to one request/cache entry. Documented as a future option only.
