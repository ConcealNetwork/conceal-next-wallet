# Feature brief — Export transaction history (CSV)

> Shared grounding for independent specs. Read this, then write your spec.

## What
Add a **download-CSV button** to the Transactions page that exports the
transaction list to a `.csv` file (date, type, amount, address, paymentId,
hash, …). Source: GitHub issue #20 (Quick wins → "Export transaction history (CSV)").

This is a **client-side transform of already-fetched data** — NOT a service-layer
feature. The tx list is already in the page via `useTransactions()`. So there's
**no interface/mock/real change**; it's a pure CSV serializer (`lib/ui`) + a
download helper + a button. Keep that scope.

## Key code pointers
- `lib/types/index.ts:47` — `Transaction` type (`id, hash, type, amount{atomic},
  address, timestamp, blockHeight, confirmations, paymentId?, message?, outgoing?`).
- `app/(wallet)/wallet/transactions/transactions-page-client.tsx` —
  `TransactionsPageClient`: `useTransactions()` → tab filter
  (`All/Received/Sent/Deposits/Withdrawals/Messages`) + search → paginated table;
  `<PageHeader …>` is where the export button goes (action slot).
- `lib/ui/download-json-file.ts` — the Blob+anchor download pattern to mirror in a
  new `lib/ui/download-csv-file.ts` (`text/csv;charset=utf-8`).
- `lib/wallet-core/mappers.ts` — `resolveUiTransactionType`, `isUiMessageOut`
  (for the displayed type / direction).
- `lib/utils` — `formatCcx`, `ccxToNumber` (amount formatting).
- `lib/ui/wallet-copy.ts` — user-facing strings.

## Must cover
1. **CSV correctness (RFC 4180):** header row; quote fields containing comma /
   quote / newline; escape embedded quotes by doubling; CRLF line endings;
   UTF-8 **BOM** so Excel reads it correctly.
2. **CSV / formula injection (CRITICAL for a wallet):** a field starting with
   `= + - @` or tab/CR can execute as a formula in Excel/Sheets. Addresses,
   payment IDs, and especially **message** text are attacker-influenced. Prefix
   such fields with a safe character (e.g. `'`) or sanitize per OWASP. Don't ship
   a CSV-injection vector.
3. **Columns / shape:** which fields, in what order; how amount is rendered
   (atomic → CCX, sign for send vs receive), timestamp format (ISO vs local),
   type (raw vs displayed), direction.
4. **Filtered vs all:** export the current filtered/searched view, all, or offer
   both? Recommend and justify.
5. **UX:** button placement (PageHeader action), label/icon, disabled/empty-list
   behavior, filename (e.g. `conceal-transactions-YYYY-MM-DD.csv`).
6. **Test plan:** unit-test the pure serializer (escaping, injection, BOM, empty
   list) + an e2e (Playwright `waitForEvent('download')`).
7. **Risks / open questions.**

## Constraints
- Biome (2-space, double quotes, line width 100). Immutability. No secrets in the
  CSV (tx data is public). Pure functions for the serializer (easy to unit-test).
- Write ONLY your single spec file. Do NOT modify other files / run git/npm.
