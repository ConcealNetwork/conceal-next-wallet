# Merged spec — Export transaction history (CSV)

> Synthesis of 4 independent specs (Codex gpt-5.5, Gemini 3.1 Pro, GLM-5.2,
> Opus 4.8). Authoritative build plan. Provenance noted _[who]_.

## Scope
Client-side transform of the already-fetched `useTransactions()` data — **no
service/interface/mock/real change** (unanimous). Three new pieces + one wiring edit:
- `lib/ui/transaction-csv.ts` — **pure** serializer (`transactionsToCsv(rows): string`,
  no BOM, no DOM → trivially unit-testable) + `CSV_COLUMNS` table so header/rows
  can't drift _[Opus/GLM]_.
- `lib/ui/download-csv-file.ts` — Blob+anchor downloader mirroring
  `download-json-file.ts:13-28`; **BOM added here** (Blob part) so the serializer
  stays pure _[GLM/Opus]_. `text/csv;charset=utf-8`.
- `app/(wallet)/wallet/transactions/transactions-page-client.tsx` — a `Download`-icon
  `<Button variant="outline">` in the `PageHeader` `action` slot (slot confirmed at
  `components/wallet/common.tsx:21`).
- `lib/ui/wallet-copy.ts` — button label + empty-state strings.
- Tests (below).

## RFC 4180 correctness _(unanimous)_
Header row; one record per row; **CRLF** (`\r\n`) joins; **quote** any field with
`, " CR LF`; **escape** embedded `"` by doubling; `null/undefined` → `""`; keep
embedded newlines inside quotes (don't strip). **UTF-8 BOM** (`﻿`) prepended
in the download helper for Excel.

## CSV / formula injection — CRITICAL _(unanimous)_
Message text, address, and paymentId are attacker-influenced. For every **string**
field, if it starts with `= + - @ \t \r \n` (or spaces-then-`=+-@` _[Codex/Opus]_),
prefix a single `'` **before** RFC-4180 quoting (OWASP/CWE-1236). Reject strip
(corrupts legit messages like "- thanks") _[GLM]_. Keep `FORMULA_TRIGGERS` a
module const with an OWASP comment so a future cleanup can't narrow it. Numeric
amount columns are exempt (generated from trusted typed `CcxAmount`, not strings).

## Columns _(superset of all four; 12 cols)_
`Date, Type, Direction, Amount (CCX), Amount (atomic), Address, Payment ID, Hash, Block Height, Confirmations, Status, Message`

| Col | Source | Transform |
|---|---|---|
| Date | `timestamp` | `new Date(...).toISOString()` (UTC, sortable) — invalid → throw, don't hide corrupt data _[Codex]_ |
| Type | `resolveUiTransactionType(tx)` → label | displayed label (matches screen + message-tx resolution) _[Codex/Gemini]_ |
| Direction | derived | `Incoming` / `Outgoing` via the page's sign table + `isUiMessageOut` (`mappers.ts:140`) |
| Amount (CCX) | `ccxToNumber(amount)` | **see design decision** — `toFixed(COIN_UNIT_PLACES=6)`, no `formatCcx` (it adds ticker + thousands separators) _[GLM/Codex]_ |
| Amount (atomic) | `amount.atomic` | integer, lossless _[Codex/Opus]_ |
| Address | `address` | full (not truncated) |
| Payment ID | `paymentId ?? ""` | injection-guarded |
| Hash | `hash` | full |
| Block Height | `blockHeight` | int, `0` = pending |
| Confirmations | `confirmations` | int |
| Status | derived | `Confirmed` if `confirmations >= 10` else `Pending` (matches `transactions-page-client.tsx:718`) |
| Message | `message ?? ""` | **injection-guarded** |

Omit React-only `id` _[Codex]_.

## Filtered vs all — **filtered** _(unanimous)_
Export the page's `filtered` array (active tab + search), not `visibleTransactions`
(page slice) and not all `data`. WYSIWYG; encode the filter in the filename
(`conceal-transactions[-<tab>]-YYYY-MM-DD.csv`) _[GLM]_ so intent is legible later.

## UX _(unanimous)_
`PageHeader` action: `<Button variant="outline">` + lucide `Download`/`FileDown`,
label **"Export CSV"**, `disabled={filtered.length === 0}` + `title` "No
transactions to export". Matches existing header-action buttons (account Refresh,
deposits Create, messages New). Success `toast` reporting row count _[GLM]_. One
standard button — **no huashu mockups warranted** (it's identical to existing
header buttons); the design decision is the CSV format, not visual UI.

## DESIGN DECISION — RESOLVED (user-approved)
**Amount sign: SIGNED.** `Amount (CCX)` is `-50.000000` for outflows, bare positive
for inflows (no `+`, which would itself be a formula trigger); the `Direction`
column is kept for human filtering. Chosen for `=SUM()` net-flow + parity with the
on-screen signed display; a well-formed negative number is a valid numeric cell, and
the formula-injection guard covers the (string) attacker-influenced fields — the
numeric Amount columns are exempt. (Opus's unsigned alternative was considered and
declined.) **Newlines in messages: PRESERVED** inside quoted fields (RFC 4180), not
collapsed.

## Tests
- **Unit** `tests/transaction-csv.test.ts` (vitest): empty→header-only; quoting
  (comma/quote/newline); injection battery (`=cmd|"/c calc"!A1`, `+1+1`, `-1+1`,
  `@SUM`, `\t=1`, `\r=1`, space-then-`=`) → all `'`-prefixed; **no false positives**
  (`50% off`, `ccx7…` untouched); numeric amount stays numeric (signed); decimal
  precision (atomic 100 → `0.000100`); status threshold (10→Confirmed, 9→Pending);
  column order; immutability (input deep-equal after).
- **Unit** `tests/download-csv-file.test.ts`: filename (All vs filtered slug, mocked
  Date); SSR guard throws; Blob is `[BOM, csv]` + `text/csv;charset=utf-8`.
- **E2E** `e2e/export-csv.spec.ts`: open mock wallet → Transactions → `Download`
  event on "Export CSV"; assert filename pattern, BOM, header, CRLF, and the
  **security gate** — no decoded cell starts with a formula trigger _[GLM]_.

## Risks
Injection regex is the whole safety boundary (const + OWASP comment + full test
battery). Large histories (>50k) could block the main thread — fine for v1, flag
if reported. Label/slug drift → derive from an explicit `{label,slug}` table _[GLM]_,
not `tab.toLowerCase()`.

## Order
1. `lib/ui/transaction-csv.ts` (+ test) → 2. `lib/ui/download-csv-file.ts` (+ test)
→ 3. `lib/ui/wallet-copy.ts` strings → 4. page button + `handleExportCsv` → 5. e2e
→ 6. gate (`types · lint · test · test:e2e`).
