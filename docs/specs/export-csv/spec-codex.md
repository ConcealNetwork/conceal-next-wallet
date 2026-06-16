# Export Transaction CSV Implementation Spec

## Goal

Add a client-side CSV export for the Transactions page. The export must serialize the same
already-fetched `Transaction[]` data used by the page, download it as a `.csv` file, and avoid
changing service interfaces, mocks, or wallet-core code.

## Grounding

- `Transaction` currently exposes `id`, `hash`, `type`, `amount.atomic`, `address`, `timestamp`,
  `blockHeight`, `confirmations`, optional `paymentId`, optional `message`, and optional `outgoing`
  in `lib/types/index.ts:47-61`.
- The Transactions page already gets all rows from `useTransactions()` and keeps tab/search/page
  state locally in `app/(wallet)/wallet/transactions/transactions-page-client.tsx:128-165`.
- The filter includes address, hash, raw type, payment ID, message, and formatted amount in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:138-155`, then sorts newest-first
  in `app/(wallet)/wallet/transactions/transactions-page-client.tsx:156-157`.
- Pagination is a presentation detail: `visibleTransactions` slices `filtered` in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:162-165`, while the card title and
  description already communicate total filtered count versus visible page in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:267-273`.
- `PageHeader` already has an `action` slot in `components/wallet/common.tsx:21-42`; transactions
  currently render it without an action in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:222-227`.
- The existing browser download helper creates a Blob, object URL, hidden anchor, click, cleanup,
  and browser-only guard in `lib/ui/download-json-file.ts:13-28`.
- Displayed transaction labels and signs are not just raw `transaction.type`: the page resolves UI
  type via `resolveUiTransactionType()` in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:527-528`, derives status at
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:718-720`, and treats outgoing
  message rows as negative in `app/(wallet)/wallet/transactions/transactions-page-client.tsx:722-727`.
- Message classification lives in `lib/wallet-core/mappers.ts:135-152`. Use those helpers rather
  than duplicating message heuristics.
- `formatCcx()` appends the current ticker in `lib/utils.ts:40-50`; `ccxToNumber()` converts atomic
  units in `lib/utils.ts:32-34`. For CSV, use numeric CCX without a localized comma or ticker.
- Unit tests are Vitest-style under `tests/`, and `tests/download-json-file.test.ts:1-14` shows the
  current download helper test shape.
- E2e tests use Playwright role locators and the mock wallet flow in `e2e/golden-path.spec.ts:4-21`.
  The mock data has eight stable transaction rows in `lib/mock-data/wallet.ts:46-137`.

## Files To Add Or Modify

- Create `lib/ui/transaction-csv.ts`
  - Own the pure serializer, column definitions, formula-injection prevention, RFC 4180 escaping,
    filename helper, and row mapping from `Transaction`.
  - Export only small, testable functions: `transactionsToCsv(transactions)`,
    `transactionCsvFilename(now)`, and optionally `transactionToCsvRow(transaction)` if tests need
    direct row assertions.
- Create `lib/ui/download-csv-file.ts`
  - Mirror the Blob and anchor pattern from `lib/ui/download-json-file.ts:13-28`.
  - Accept a final filename and CSV text. Do not know anything about transactions.
- Modify `app/(wallet)/wallet/transactions/transactions-page-client.tsx`
  - Import `Button`, `FileDown`, `downloadCsvFile`, `transactionCsvFilename`, and
    `transactionsToCsv`.
  - Add a `handleExportCsv()` callback that exports the current `filtered` array.
  - Pass a button through `PageHeader.action`.
- Modify `lib/ui/wallet-copy.ts`
  - Add copy constants for the button label and empty disabled title. This file is the existing
    home for wallet UI strings (`lib/ui/wallet-copy.ts:3-78`).
- Create `tests/transaction-csv.test.ts`
  - Focus on serializer behavior. Do not test DOM download mechanics here.
- Modify or add e2e coverage in `e2e/golden-path.spec.ts`
  - Add one download test for the Transactions page using `page.waitForEvent("download")`.

Do not modify service files. The brief explicitly scopes this as a client-side transform of
`useTransactions()` data, and the hook already reads `services.transactions.listTransactions()` in
`lib/hooks/index.ts:113-118`.

## CSV Shape

Use this exact header order:

```text
timestamp,type,direction,amount_ccx,amount_atomic,address,payment_id,hash,block_height,confirmations,status,message
```

Column rules:

- `timestamp`: `new Date(transaction.timestamp).toISOString()`. The data model already stores
  timestamps as strings (`lib/types/index.ts:53`), and real mapper output is ISO in
  `lib/wallet-core/mappers.ts:211-213`. Export UTC ISO, not local display text, so spreadsheets and
  downstream tools can sort reliably.
- `type`: the display label matching the page's effective UI type, not necessarily raw
  `transaction.type`. Use `resolveUiTransactionType(transaction)` (`lib/wallet-core/mappers.ts:148-152`)
  and the same labels as `transactionMeta` in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:67-126`: `Receive`, `Send`,
  `Deposit`, `Withdrawal`, `Fusion`, `Miner`, `Message`.
- `direction`: one of `in`, `out`, or `neutral`.
  - `out`: effective type is `send` or `fusion`, or effective type is `message` and
    `isUiMessageOut(transaction)` is true.
  - `in`: effective type is `receive`, `deposit`, `withdrawal`, `miner`, or inbound `message`.
  - `neutral`: reserve only for future zero-value/internal rows; the current known types map to
    `in` or `out`.
- `amount_ccx`: signed base-unit number with no ticker and no thousands separator. Use
  `ccxToNumber(transaction.amount)` (`lib/utils.ts:32-34`) and apply `-` only for `direction === "out"`.
  Format with fixed network precision from `CCX_PRECISION_DECIMAL_DISPLAY` (`lib/utils.ts:20-23`),
  then trim trailing zeros and a trailing decimal point. Whole values export as integers. Examples:
  `-50`, `0.0001`, `200`.
- `amount_atomic`: signed integer atomic units. The type exposes `amount.atomic` in
  `lib/types/index.ts:51`; apply the same direction sign as `amount_ccx`.
- `address`: full `transaction.address`, not `truncateAddress()`. Rows currently display truncated
  addresses in `app/(wallet)/wallet/transactions/transactions-page-client.tsx:546-548`, but the
  detail dialog preserves the full address in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:646-654`.
- `payment_id`: `transaction.paymentId ?? ""`, matching the optional model field in
  `lib/types/index.ts:57`.
- `hash`: full transaction hash. The dialog already exposes it as copyable detail in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:637-643`.
- `block_height`: numeric block height; keep `0` for pending rows because the model documents `0`
  as mempool/pending in `lib/types/index.ts:54-55`.
- `confirmations`: numeric confirmations from `lib/types/index.ts:56`.
- `status`: `Confirmed` when confirmations are at least 10, otherwise `Pending`, matching
  `getTransactionStatus()` in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:718-720`.
- `message`: `transaction.message ?? ""`, matching the optional model field in
  `lib/types/index.ts:58`. This is attacker-influenced and must go through formula-injection
  prevention before CSV quoting.

Do not include React-only `id`. It is useful for list keys (`lib/types/index.ts:48`) but is not a
stable wallet/export field in the same way as hash, height, address, and payment ID.

## RFC 4180 Correctness

`transactionsToCsv()` must return a complete CSV document string:

- First character must be UTF-8 BOM `\uFEFF`, so Excel detects UTF-8.
- First record must be the header row.
- Records must be joined with CRLF (`\r\n`), not bare LF.
- Every field should be serialized through one function, `serializeCsvField(value)`.
- Quote a field if it contains comma, double quote, CR, LF, or starts/ends with space.
- Escape embedded double quotes by doubling them.
- Normalize `null` and `undefined` to empty strings.
- Keep embedded newlines inside quoted fields. Do not replace them with spaces.
- End the file with a final CRLF. This is more compatible with importers and easy to assert.

Recommended implementation sketch:

```ts
const CSV_BOM = "\uFEFF";
const CSV_EOL = "\r\n";

function serializeCsvField(value: string | number | null | undefined): string {
  const raw = value == null ? "" : String(value);
  const safe = preventCsvFormulaInjection(raw);
  const escaped = safe.replaceAll("\"", "\"\"");
  const needsQuotes = /[",\r\n]/.test(safe) || safe.startsWith(" ") || safe.endsWith(" ");
  return needsQuotes ? `"${escaped}"` : escaped;
}

export function transactionsToCsv(transactions: readonly Transaction[]): string {
  const rows = [TRANSACTION_CSV_HEADERS, ...transactions.map(transactionToCsvRow)];
  return `${CSV_BOM}${rows.map((row) => row.map(serializeCsvField).join(",")).join(CSV_EOL)}${CSV_EOL}`;
}
```

## CSV Formula-Injection Prevention

This is a hard security requirement. Wallet transaction fields can be controlled by other parties:
addresses, payment IDs, hashes from remote data, and especially message text. Spreadsheet apps can
execute cells beginning with formula markers.

Apply formula-injection prevention before RFC 4180 quoting. Prefix the field with a single
apostrophe (`'`) when either condition is true:

- The first character is one of `=`, `+`, `-`, `@`, tab, CR, or LF.
- The field starts with spaces followed by `=`, `+`, `-`, or `@`, because spreadsheet apps may trim
  leading whitespace before evaluating formulas.

Recommended helper:

```ts
const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r\n]/;
const SPACE_THEN_FORMULA_PATTERN = /^ +[=+\-@]/;

export function preventCsvFormulaInjection(value: string): string {
  if (FORMULA_PREFIX_PATTERN.test(value) || SPACE_THEN_FORMULA_PATTERN.test(value)) {
    return `'${value}`;
  }
  return value;
}
```

Run this for every field, not only `message`, because future data changes can make assumptions
wrong. This means negative numeric `amount_ccx` and `amount_atomic` would be prefixed if treated as
strings. To avoid breaking numeric columns, pass numeric amount columns as numbers only after sign
calculation and exempt trusted generated numeric columns from formula prevention, or keep the
generic serializer and explicitly serialize signed amount columns with a numeric-only serializer.

Opinionated decision: keep amount columns numeric and unsanitized, because they are generated from
typed `CcxAmount` values (`lib/types/index.ts:1-3`, `lib/types/index.ts:51`) rather than
attacker-controlled strings. Apply formula prevention to all string columns.

## Filtered Versus All

Export the current filtered and searched result set, not only the current page and not always all
transactions.

Rationale:

- The page already has one authoritative `filtered` array after active tab and search are applied in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:138-157`.
- Exporting `visibleTransactions` would silently export only the current pagination slice from
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:162-165`, which is surprising.
- Always exporting `data` would ignore the user's active tab/search context.
- The section header already explains the filtered result count and current page in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:267-273`; the button should align
  with that count.

Button title should be explicit when filters are active:

- Label: `Export CSV`
- Optional `title`: `Exports the current filtered transaction list`
- Disabled title: `No transactions to export`

Do not add a dropdown for "all vs filtered" in the first version. It adds interaction surface for a
quick-win issue and is easy to add later if users ask.

## UX

Place the button in `PageHeader.action` for the Transactions page:

```tsx
<PageHeader
  title="Transaction History"
  subtitle="Complete transaction history for your wallet"
  action={
    <Button
      type="button"
      variant="outline"
      className="gap-2"
      onClick={handleExportCsv}
      disabled={filtered.length === 0}
      title={filtered.length === 0 ? walletCopy.exportTransactionsCsvEmpty : undefined}
    >
      <FileDown className="size-4" aria-hidden="true" />
      {walletCopy.exportTransactionsCsvButton}
    </Button>
  }
/>
```

This follows existing header-action patterns:

- Account refresh uses `PageHeader.action` with an icon button in
  `app/(wallet)/wallet/account/page.tsx:72-90`.
- Deposits uses `PageHeader.action` with an icon button in
  `app/(wallet)/wallet/deposits/deposits-page-client.tsx:129-144`.
- Messages uses `PageHeader.action` with an icon button in
  `app/(wallet)/wallet/messages/page.tsx:261-275`.
- Export page uses `FileDown` for a download action in
  `app/(wallet)/wallet/export/page.tsx:133-135`.

Add copy to `walletCopy`:

```ts
exportTransactionsCsvButton: "Export CSV",
exportTransactionsCsvEmpty: "No transactions to export.",
```

Filename:

```ts
export function transactionCsvFilename(now = new Date()): string {
  return `conceal-transactions-${now.toISOString().slice(0, 10)}.csv`;
}
```

The helper should not accept arbitrary user input, so it does not need backup-style filename
sanitization from `lib/ui/download-json-file.ts:1-10`.

`downloadCsvFile(filename, csv)` should set Blob type to `text/csv;charset=utf-8` and append `.csv`
if missing. It should throw `Download is only available in the browser.` when `window` is undefined,
matching `lib/ui/download-json-file.ts:13-16`.

## Implementation Tasks

### Task 1: Pure CSV Serializer

Create `lib/ui/transaction-csv.ts`.

Key exports:

```ts
import type { Transaction, TransactionType } from "@/lib/types";
import { CCX_PRECISION_DECIMAL_DISPLAY, ccxToNumber } from "@/lib/utils";
import { isUiMessageOut, resolveUiTransactionType } from "@/lib/wallet-core/mappers";

export const TRANSACTION_CSV_HEADERS = [
  "timestamp",
  "type",
  "direction",
  "amount_ccx",
  "amount_atomic",
  "address",
  "payment_id",
  "hash",
  "block_height",
  "confirmations",
  "status",
  "message",
] as const;

type CsvCell = string | number;
type CsvRow = readonly CsvCell[];
```

Implementation details:

- Keep `TRANSACTION_CSV_HEADERS` exported for tests.
- Create local `transactionTypeLabels: Record<TransactionType, string>` mirroring current labels in
  `transactionMeta` (`app/(wallet)/wallet/transactions/transactions-page-client.tsx:67-126`).
- Create `transactionDirection(transaction)` so message direction uses `isUiMessageOut()`.
- Create `formatCsvCcxAmount(transaction)` from `ccxToNumber(transaction.amount)` and
  `CCX_PRECISION_DECIMAL_DISPLAY`.
- Create `getCsvTransactionStatus(confirmations)` using the same threshold as
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:718-720`.
- Use `new Date(transaction.timestamp).toISOString()` and let invalid timestamps throw. Silent
  fallback would hide corrupt wallet data.

### Task 2: Browser Download Helper

Create `lib/ui/download-csv-file.ts`.

Required behavior:

- `csvDownloadFilename("x")` returns `x.csv`.
- `csvDownloadFilename("x.csv")` returns `x.csv`.
- `downloadCsvFile(filename, csv)` mirrors the existing object URL and anchor cleanup sequence in
  `lib/ui/download-json-file.ts:18-27`.
- Blob type must be `text/csv;charset=utf-8`.

Keep this helper generic. It should not import transaction code.

### Task 3: Transactions Page Integration

Modify `app/(wallet)/wallet/transactions/transactions-page-client.tsx`.

Required changes:

- Add `FileDown` to the existing lucide import list near
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:4-15`.
- Import `Button` from `@/components/ui/button`; the page already imports other local UI components
  at `app/(wallet)/wallet/transactions/transactions-page-client.tsx:17-33`.
- Import `downloadCsvFile` and `transactionsToCsv`.
- Import `walletCopy`.
- Add:

```ts
function handleExportCsv() {
  const csv = transactionsToCsv(filtered);
  downloadCsvFile(transactionCsvFilename(), csv);
}
```

- Use `filtered.length === 0` to disable the button. The current empty state is tied to
  `groupedTransactions.length` in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:277-294`, but export should be tied
  to the full filtered export set.
- Do not use `visibleTransactions`. That would make page size affect export output.

### Task 4: Copy

Modify `lib/ui/wallet-copy.ts`.

Add:

```ts
exportTransactionsCsvButton: "Export CSV",
exportTransactionsCsvEmpty: "No transactions to export.",
```

Keep the strings outside mock/real conditionals; transaction history export does not differ by
wallet mode.

## Unit Test Plan

Create `tests/transaction-csv.test.ts`.

Use Vitest imports like `tests/download-json-file.test.ts:1-2`.

Required tests:

1. Header, BOM, CRLF, and final CRLF:
   - Call `transactionsToCsv([])`.
   - Assert `csv.startsWith("\uFEFF")`.
   - Assert the first row equals the header list.
   - Assert `csv.includes("\r\n")`.
   - Assert `csv.endsWith("\r\n")`.
   - Assert no bare LF records by checking `csv.replaceAll("\r\n", "")` does not contain `\n`.
2. RFC 4180 escaping:
   - Use a transaction with `message: 'hello, "quoted"\nnext'`.
   - Assert the message cell serializes as `"hello, ""quoted""\nnext"`.
3. Formula-injection prevention:
   - Assert string fields starting with `=`, `+`, `-`, `@`, tab, CR, LF, and `" =SUM(1,1)"`
     receive a leading apostrophe.
   - Include at least one `message` and one `paymentId` case.
4. Numeric signed amounts remain numeric:
   - A send row with `ccxAmount(50)` should contain `-50` or the chosen trimmed equivalent, not
     `'-50`.
   - A receive row should be positive.
   - An outgoing message row should be negative, matching
     `app/(wallet)/wallet/transactions/transactions-page-client.tsx:722-727`.
5. Column shape:
   - Build one row and assert it has exactly `TRANSACTION_CSV_HEADERS.length` fields after parsing
     with a tiny test CSV parser or by testing `transactionToCsvRow()` if exported.
6. Filename:
   - `transactionCsvFilename(new Date("2026-06-16T12:00:00.000Z"))` returns
     `conceal-transactions-2026-06-16.csv`.
7. Download helper:
   - Add filename tests beside the existing download filename style in `tests/download-json-file.test.ts:4-14`,
     or create `tests/download-csv-file.test.ts`.
   - Do not need to click a real anchor in unit tests unless existing test setup grows DOM spies.

Expected validation commands for the implementer after coding:

```bash
npm run test -- tests/transaction-csv.test.ts tests/download-csv-file.test.ts
npm run types
npm run lint
```

## E2E Test Plan

Add a Playwright test, preferably to `e2e/golden-path.spec.ts`, because it already opens the mock
wallet from the landing page in `e2e/golden-path.spec.ts:4-10`.

Scenario:

1. `await page.goto("/")`.
2. Open the mock wallet with the existing `Open your wallet` flow.
3. Navigate to Transactions by role link.
4. Assert the heading `Transaction History` is visible.
5. Trigger download:

```ts
const downloadPromise = page.waitForEvent("download");
await page.getByRole("button", { name: "Export CSV" }).click();
const download = await downloadPromise;
expect(download.suggestedFilename()).toMatch(/^conceal-transactions-\d{4}-\d{2}-\d{2}\.csv$/);
```

6. Read the file from `await download.path()` and assert:
   - It starts with BOM.
   - It contains the header.
   - It contains a known mock transaction hash, for example the first mock hash from
     `lib/mock-data/wallet.ts:49-57`.
   - It has nine records total: one header plus eight mock transactions from
     `lib/mock-data/wallet.ts:46-137`.
7. Add a filtered export assertion:
   - Search for `OutgoingB2` or click the `Sent` tab.
   - Download again.
   - Assert the CSV does not contain a receive-only hash from `lib/mock-data/wallet.ts:49-57`.

Expected validation command for the implementer after coding:

```bash
npm run test:e2e -- e2e/golden-path.spec.ts
```

## Risks And Open Questions

- CSV formula injection is the main risk. Do not merge without tests covering formula prefixes in
  message and payment ID fields. Message text is explicitly optional transaction data in
  `lib/types/index.ts:58` and appears in the search/export surface in
  `app/(wallet)/wallet/transactions/transactions-page-client.tsx:142-149`.
- Duplicating labels from `transactionMeta` creates drift risk. A small shared helper would be nice,
  but do not move the whole `transactionMeta` object in this quick-win change. Keep the CSV label map
  local and covered by tests.
- Amount formatting must not use `formatCcx()` because it appends the display ticker and may include
  localized thousands separators (`lib/utils.ts:40-50`). Use numeric conversion instead.
- Exporting filtered rows means a user with a non-empty search might accidentally export a subset.
  That is still the least surprising behavior for a button next to the current filtered view. The
  disabled/title text and future iteration can add "Export all" if requested.
- Browser Blob downloads do not work during server render. Keep the browser-only guard from the JSON
  helper pattern (`lib/ui/download-json-file.ts:13-16`).
- Very large histories could create a large string on the main thread. Current scope is already
  client-side fetched data, so this is acceptable for the issue, but if wallets regularly have tens
  of thousands of rows the serializer may need chunking or a worker later.
- The e2e test depends on mock transactions staying stable. If mock data changes, assert row count
  from imported `mockTransactions.length` rather than hard-coding `8`.
