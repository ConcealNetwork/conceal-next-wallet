# Pre-PR Review: Export CSV

## [CRITICAL] Missing security gate assertion in E2E test
**File:** `e2e/export-csv.spec.ts:29`
**Finding:** The merged spec explicitly mandates that the E2E test must include a "security gate — no decoded cell starts with a formula trigger". The current test asserts the BOM, header row, and row count, but it never parses the CSV cells to verify that the injection guard actually worked on the mock data. Without this E2E gate, future refactors could silently drop the formula guard and CI would still pass.
**Concrete fix:** Add a loop at the end of the first test that splits the rows and cells (respecting quotes), then assert `expect(cell).not.toMatch(/^[=+\-@\t\r\n]/)` for every cell.

## [MEDIUM] Amount (CCX) can serialize double-minus `--` if `amount.atomic` is negative
**File:** `lib/ui/transaction-csv.ts:72`
**Finding:** The `Amount (atomic)` column explicitly uses `Math.abs(transaction.amount.atomic)` before prepending the local `sign` (`+` or `-`). However, `Amount (CCX)` directly formats `ccxToNumber(transaction.amount)`. While `amount.atomic` is currently strictly positive upstream, if a negative amount is ever passed, `ccxToNumber` will return a negative value. The local template literal `${sign}` would then prepend another minus, resulting in an invalid CSV cell like `--50.000000`.
**Concrete fix:** Wrap the CCX value in `Math.abs()` for consistency with the atomic column: `${sign}${Math.abs(ccxToNumber(transaction.amount)).toFixed(CCX_PRECISION_DECIMAL_DISPLAY)}`.

## [MEDIUM] Naive `\r\n` split in test helper breaks on embedded newlines
**File:** `tests/transaction-csv.test.ts:48`
**Finding:** The test helper function `rows(csv)` splits the CSV output into rows using a simple `csv.split("\r\n")`. While it happens to work for the current mock data (which only embeds `\n` in the message: `'say "hi", ok\nbye'`), if a test case is ever introduced with an embedded CRLF (`\r\n`) inside a quoted message, `split("\r\n")` will break the quoted field in half and cause the test parser to fail.
**Concrete fix:** Replace the naive `.split("\r\n")` in the test helper with a stateful CSV parsing loop that respects quote states (similar to how `parseRow` already correctly ignores commas inside quotes), or use a tested CSV parser utility.

## [LOW] `transactionRow` lacks a TypeScript return tuple binding its length to `CSV_COLUMNS`
**File:** `lib/ui/transaction-csv.ts:65`
**Finding:** The spec notes "CSV_COLUMNS table so header/rows can't drift". The PR defines `CSV_COLUMNS` as a readonly tuple, but `transactionRow()` merely returns `string[]`. There is no TypeScript constraint ensuring the returned array matches the exact length or order of `CSV_COLUMNS`. If a developer adds a column to the header but forgets to update `transactionRow()`, the compiler will not warn them.
**Concrete fix:** Provide a strict return type. Either return a tuple of exact length, or define a mapped type: `type Row = Record<typeof CSV_COLUMNS[number], string>;` and return an object that `transactionsToCsv` can iterate over, or explicitly assert the return as `readonly string[] & { length: typeof CSV_COLUMNS["length"] }`.
