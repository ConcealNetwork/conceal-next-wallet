# Implementation Spec: Export Transaction History (CSV)

## 1. CSV Correctness (RFC 4180)
We will implement a pure serialization function `serializeCsv(rows: string[][]): string` (e.g., in a new `lib/ui/download-csv-file.ts`).
- **Quotes and Escaping**: Fields containing `,`, `"`, `\n`, or `\r` will be wrapped in double quotes (`"`). Existing double quotes inside the field will be escaped by doubling them (`""`) per RFC 4180.
- **Line Endings**: Rows will be joined using CRLF (`\r\n`).
- **UTF-8 BOM**: The final file content will be prepended with a UTF-8 BOM (`\uFEFF`) to ensure Excel and other spreadsheet applications decode it correctly.

## 2. CSV / Formula Injection Prevention (CRITICAL)
Any field containing user-influenced data (specifically `address`, `paymentId`, and `message` from `lib/types/index.ts:47`) must be sanitized to prevent formula injection.
- **Rule**: If a field's string representation starts with `=`, `+`, `-`, `@`, `\t`, or `\r`, we will prepend it with a single quote (`'`). 
- This forces spreadsheet software to interpret the field as text rather than an executable formula, neutralizing DDE injection payloads (e.g., `=cmd|' /C calc'!A0`).

## 3. Columns & Data Shape
We will extract columns from the `Transaction` objects.

**Columns & Order:**
1. **Date**: Formatted as ISO 8601 (`transaction.timestamp`) for unambiguous, machine-readable chronological sorting in spreadsheets.
2. **Type**: The displayed UI type, resolved via `resolveUiTransactionType(transaction)` (`lib/wallet-core/mappers.ts:149`).
3. **Amount (CCX)**: Decimal representation using `ccxToNumber(transaction.amount)` (`lib/utils.ts:32`), prefixed with the appropriate sign (`+` or `-`) based on the transaction type/direction (matching the UI logic).
4. **Address**: `transaction.address`
5. **Payment ID**: `transaction.paymentId ?? ""`
6. **Message**: `transaction.message ?? ""`
7. **Hash**: `transaction.hash`

## 4. Filtered vs All
**Recommendation:** Export the **current filtered/searched view**.
**Justification:** WYSIWYG (What You See Is What You Get) is the most intuitive UX. If a user filters by "Deposits" or searches for a specific `paymentId`, the export should reflect that subset. To export everything, the user simply clears the search and selects the "All" tab. 

## 5. UX & UI Integration
- **Button Placement**: Add a secondary button to the `action` slot of the `<PageHeader>` in `app/(wallet)/wallet/transactions/transactions-page-client.tsx` (around line 224).
- **Label & Icon**: "Export CSV" with the `Download` icon from `lucide-react`.
- **Disabled State**: Disable the button if `filtered.length === 0` to prevent empty exports.
- **Filename**: Generate dynamically, e.g., `conceal-transactions-YYYY-MM-DD.csv`.
- **Download Helper**: Model `lib/ui/download-csv-file.ts` after `lib/ui/download-json-file.ts:13`. It will create a `Blob([BOM, csvString], { type: "text/csv;charset=utf-8;" })` and trigger a download via a hidden anchor tag.

## 6. Test Plan
- **Unit Tests (`lib/ui/download-csv-file.test.ts`)**:
  - **RFC 4180**: Assert commas, newlines, and quotes are properly escaped (e.g., `Hello, "World"` -> `"Hello, ""World"""`).
  - **Injection**: Assert strings starting with `=`, `+`, `-`, `@` are prefixed with `'`.
  - **BOM**: Assert the output string starts with `\uFEFF`.
- **E2E Tests (`tests/transactions.spec.ts`)**:
  - Setup: Filter transactions (e.g., by "Deposits").
  - Action: Click "Export CSV".
  - Assert: Await Playwright's `page.waitForEvent('download')`. Read the downloaded file stream and assert the header row exists and the row count matches the filtered UI count.

## 7. Risks & Open Questions
- **Performance**: For massive wallets (e.g., 50,000+ transactions), synchronous CSV serialization might block the main UI thread. Given typical wallet sizes, this is low risk, but if it becomes an issue, serialization could be moved to a Web Worker.
- **String Copy**: We will need to add new strings to `lib/ui/wallet-copy.ts` for the button label and potential accessibility `aria-label`s.
