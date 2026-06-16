# Review — feat/deposits-fiat (fiat USD on Deposits page)

Reviewer: GLM-5.2
Scope: `git diff main HEAD` — single file, `app/(wallet)/wallet/deposits/deposits-page-client.tsx` (+21/-2).
Reference for consistency: `app/(wallet)/wallet/account/page.tsx`, `app/(wallet)/wallet/send/page.tsx`, `lib/utils.ts` (`formatUsd`, `walletBalanceUsd`), `lib/hooks/index.ts` (`useMarketData`).

## Summary

The math is correct (`ccx * price`), the `price > 0` gate works as intended, and React Query dedup makes the per-card hook calls acceptable. No CRITICAL/HIGH issues. The real findings are a user-visible label inconsistency with the rest of the wallet, missing test coverage for the new conditional render, and a couple of low-severity polish items.

Findings below, worst first. Severity in brackets; `file:line` references point at the branch under review (HEAD = `8480c1b`).

---

## [MEDIUM] M1 — `USD` currency suffix is inconsistent between Summary cards and per-deposit details

**Location**
- `app/(wallet)/wallet/deposits/deposits-page-client.tsx:422` — `SummaryCard`: `<p ...>≈ {usd} USD</p>`
- `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1063` — `DepositDetail`: `<dd ...>≈ {usd}</dd>`

**Problem**
The two surfaces in the same feature disagree on the currency label:

| Surface | Rendered text |
|---|---|
| SummaryCard (Total Locked / Total Est. Interest) | `≈ $1.2345 USD` |
| DepositDetail (Principal / Est. Interest / Value at Maturity) | `≈ $1.2345` |

`Send` matches the SummaryCard form — `≈ {formatUsd(amount * price)} USD` at `app/(wallet)/wallet/send/page.tsx:271` and `:340`. So the per-deposit detail line is the odd one out across the whole wallet.

**Fix**
Pick one form and apply it everywhere in this file. The `Send`/SummaryCard form (`"≈ {usd} USD"`) is the established convention; `DepositDetail` should match:

```tsx
// deposits-page-client.tsx:1063
{usd ? <dd className="mt-0.5 truncate text-xs text-muted-foreground">≈ {usd} USD</dd> : null}
```

(If the trailing `USD` is deemed redundant given the leading `$` from `formatUsd`, drop it everywhere — but that is a separate, cross-page change and out of scope for this PR.)

---

## [MEDIUM] M2 — No tests cover the new conditional USD rendering or the `price > 0` gate

**Location**
- `app/(wallet)/wallet/deposits/deposits-page-client.tsx:265, 317, 336, 803-804, 856, 863, 869`
- Test files consulted: `tests/utils.test.ts` (covers `formatUsd` only), `tests/components.test.tsx`, `tests/mock-services.test.ts`. Nothing renders `DepositCard` / `DepositsSummary` and nothing exercises the gate.

**Problem**
This PR introduces real conditional logic — USD sublines appear iff `price > 0` — but ships no unit or component test. Regressions (e.g. someone removing the `price > 0` guard and showing `$0.0000` while the market query is loading, or breaking the `ccx * price` math) would land silently. The project already has a jsdom component-test harness (`tests/components.test.tsx`) and a mock-services harness, so the infrastructure exists.

**Fix**
Add a small component test (vitest + jsdom) that mounts `DepositsSummary` and one `DepositCard` with a mocked `useMarketData`, asserting:

1. When `price.value > 0`, the USD subline is present and equals `formatUsd(ccx * price)`.
2. When `price.value === 0` or the market query is still loading (`data` undefined), no `≈` / USD node renders.

Mock the query via the existing mock services (`lib/services/mock`) or by wrapping in a `QueryClientProvider` with `services.market.getMarketData` stubbed — follow the pattern already used in `tests/mock-services.test.ts`.

---

## [LOW] L1 — Layout shift (CLS) when the USD subline appears after the market query resolves

**Location**
- `app/(wallet)/wallet/deposits/deposits-page-client.tsx:422` (SummaryCard)
- `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1063` (DepositDetail)

**Problem**
On first paint `useMarketData().data` is `undefined`, so `price` defaults to `0` and the USD subline is hidden. When the query resolves, a new line pops in below each value, pushing the chart (`SummaryCard` uses `mt-auto` for chart placement) and growing every `DepositDetail` cell height. On a Deposits page with several cards this is a visible reflow.

**Fix (optional, cheap)**
Reserve a row for the subline up front so the box height is stable, e.g. give the SummaryCard a fixed `min-h` bump and render an invisible placeholder while `price` is loading:

```tsx
{price > 0 ? (
  <p className="mt-0.5 text-xs text-muted-foreground">≈ {formatUsd(totalLocked * price)} USD</p>
) : (
  <p className="mt-0.5 text-xs text-transparent select-none" aria-hidden="true">$0.0000 USD</p>
)}
```

Or simpler: pass `price` down from the page-level `DepositsPageClient` (it already owns other queries) so the data is warmer by the time the cards mount, reducing the flash.

---

## [LOW] L2 — `useMarketData()` is called after non-hook statements inside `DepositCard`

**Location**
- `app/(wallet)/wallet/deposits/deposits-page-client.tsx:799-804`

**Problem**
```ts
const principal = ccxToNumber(deposit.amount);     // 799
const interest  = ccxToNumber(deposit.interest);   // 800
const maturityValue = principal + interest;        // 801
const maturityDate = formatMaturityDate(...);      // 802
const price = useMarketData().data?.price.value ?? 0;  // 803  ← hook after assignments
```
This is **not** a Rules-of-Hooks violation (the call is unconditional and order-stable across renders), but it diverges from the project's own convention elsewhere — `Send` and `Account` both group hooks at the top (`app/(wallet)/wallet/send/page.tsx:85-96`, `app/(wallet)/wallet/account/page.tsx:44-50`). It also differs from `DepositsSummary` in the same file, where the hook sits right after the `useMemo` block. Makes future refactors easier to get wrong.

**Fix**
Hoist the hook above the derived locals:

```tsx
const price = useMarketData().data?.price.value ?? 0;
const principal = ccxToNumber(deposit.amount);
const interest = ccxToNumber(deposit.interest);
const maturityValue = principal + interest;
const maturityDate = formatMaturityDate(deposit.unlocksInDays);
const usd = (ccx: number) => (price > 0 ? formatUsd(ccx * price) : undefined);
```

---

## [LOW] L3 — Cross-page inconsistency: this PR gates on `price > 0`, `Account` and `Send` do not

**Location**
- New gating (good): `app/(wallet)/wallet/deposits/deposits-page-client.tsx:317, 336, 804`
- Ungated equivalents: `app/(wallet)/wallet/send/page.tsx:271, 340, 434`; `app/(wallet)/wallet/account/page.tsx:481, 485`

**Problem**
While the market query is loading, `Account` and `Send` render `≈ $0.0000 USD`; this PR correctly hides the line until `price > 0`. That is a strict UX improvement, but it means a user moving between pages sees fiat appear/disappear inconsistently during the brief loading window.

**Fix**
Do not weaken this PR. Instead, file a small follow-up to lift the same `price > 0` guard into `Send` and `Account` (or push it into a shared `<UsdSubline amount={ccx} price={price} />` component used by all three pages). Not blocking for this branch.

---

## [LOW] L4 — Per-card `useMarketData()` subscribers (dedup is fine; noting the audit ask)

**Location**
- `app/(wallet)/wallet/deposits/deposits-page-client.tsx:265` (1× in `DepositsSummary`)
- `app/(wallet)/wallet/deposits/deposits-page-client.tsx:803` (1× per `DepositCard`, i.e. N× for N deposits)

**Problem / non-problem**
React Query uses a single query observer per `queryKey` (`queryKeys.market` — `lib/hooks/index.ts:128`), so all N+1 calls share one network request and one cache entry. The only cost is N+1 component subscriptions, which re-render on each price tick. For realistic deposit counts this is negligible; the work per re-render is updating a handful of text nodes. No action required.

If it ever does matter (very large deposit lists, high-frequency price feed), the clean fix is to read `price` once in `DepositsPageClient` and pass it via props or context to `DepositsSummary` + `DepositCard`. Premature today — call it out as an option, not a blocker.

---

## Things explicitly checked and OK

- **Arithmetic**: `totalLocked * price` and `totalInterest * price` at `:317`/`:336` are correct (CCX float × USD/CCX → USD). `maturityValue = principal + interest` at `:801`, then `usd(maturityValue)` at `:869` is correct.
- **Gate correctness**: `price ?? 0` then `price > 0` correctly hides the subline both when the query is loading (`data` undefined → `0`) and when the service genuinely returns `0`. Both Summary and per-card paths honor it.
- **HTML semantics**: two `<dd>` siblings under one `<dt>` in `DepositDetail` (`:1060`/`:1063`) is valid HTML; SRs read both values and the `≈` glyph is decorative enough not to be confusing.
- **Types**: `usd?: string` optional-prop plumbing through `SummaryCard` / `DepositDetail` is sound; `formatUsd` accepts `number`.
- **Decimals**: default 4 dp from `formatUsd` matches `Account`/`Send` usage — consistent.
- **SSR**: file is `"use client"` and `useMarketData` only runs client-side; no hydration mismatch.

---

## Recommendation

Approve after addressing **M1** (one-line label fix) and **M2** (add the gate test). L1–L4 are non-blocking polish/follow-ups.
