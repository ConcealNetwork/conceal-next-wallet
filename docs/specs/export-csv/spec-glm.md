# Spec — Export transaction history (CSV)

> Author: **GLM-5.2** (one of four independent drafts). Concrete, opinionated,
> ready to merge. Every claim is grounded in real file:line citations so the
> synthesizer can verify quickly.

## 1. Scope (reaffirmed)

This is a **client-only transform** of the transaction list already in the page
via `useTransactions()` (`lib/hooks/index.ts:113-118`). Per
`docs/specs/export-csv/BRIEF.md:10-13` there is **no service-interface change and
no mock/real divergence** — both modes already produce the same `Transaction[]`
shape (`lib/types/index.ts:47-61`). Everything below lives in `lib/ui` (pure
serializer + download helper) plus a single button wired into the existing
`PageHeader` action slot.

Three new files, all in `lib/ui` to match the existing download/export siblings
(`lib/ui/download-json-file.ts`, `lib/ui/wallet-export-backup.ts`,
`lib/ui/wallet-export-pdf.ts`):

| File | Purpose |
|---|---|
| `lib/ui/serialize-transactions-csv.ts` | Pure `transactionsToCsv(rows): string`. All escaping, injection-defense, signing, column shaping. |
| `lib/ui/download-csv-file.ts` | Blob + anchor helper, BOM prepend, filename builder. Mirrors `download-json-file.ts:13-28`. |
| `tests/serialize-transactions-csv.test.ts` + `tests/download-csv-file.test.ts` | Unit coverage. |

UI change is a single edit to
`app/(wallet)/wallet/transactions/transactions-page-client.tsx` — see §6.

---

## 2. CSV correctness (RFC 4180)

The serializer must emit a file any spreadsheet parser (Excel, Sheets, Numbers,
pandas, `csv-parser`) reads identically. Concretely:

1. **Header row first**, then one record per row, both terminated by **CRLF**
   (`\r\n`, RFC 4180 §2.2, §6.1). Do not rely on the host — always join with
   `"\r\n"` explicitly.
2. **Quote any field** that contains a comma `,`, double-quote `"`, CR, or LF
   (RFC 4180 §2.7). Wrap the whole field in `"…"`.
3. **Escape embedded quotes by doubling** (`"` → `""`, RFC 4180 §2.7).
4. **UTF-8 BOM** (`0xEF 0xBB 0xBF`) at the start of the *byte stream* — not the
   string. Excel on Windows detects UTF-8 only via BOM; without it, multi-byte
   characters (currency symbols, non-ASCII payment-id-free text in messages)
   mojibake. The BOM is added in `download-csv-file.ts` (see §4) where the
   `Blob` is constructed, so the pure serializer stays BOM-free and trivially
   unit-testable.
5. **One records-per-row invariant**: never emit a raw LF inside an unquoted
   field. The message body in `Transaction.message`
   (`lib/types/index.ts:58`) can contain newlines (the wallet allows 260-char
   bodies per `MAX_MESSAGE_SIZE` in `lib/config/config.ts:21`); quoting handles
   it but CRLF-normalize any lone `\r` or `\n` first to avoid spreadsheet row
   splits when the file is later re-saved.

These rules live in a single internal `csvField(value: string): string` helper
inside `serialize-transactions-csv.ts` so the e2e and unit tests can pin the
exact behavior.

---

## 3. CSV / formula injection (CRITICAL)

A wallet export is a high-value target: an attacker who can place text into a
field the victim later opens in Excel can run DDE/`SUM`/`@HYPERLINK` payloads.
For Conceal specifically:

| Field | Source | Risk |
|---|---|---|
| `Transaction.message` (`lib/types/index.ts:58`) | Free-text, attacker-controlled, up to 260 chars (`lib/config/config.ts:21`) | **HIGH** |
| `Transaction.address` (`lib/types/index.ts:52`) | Remote party on incoming txs (`lib/wallet-core/mappers.ts:203-210`) | Medium — CCX addresses start with `ccx7` so they are safe today, but the `send` path stores `""` and incoming is peer-supplied; defend anyway. |
| `Transaction.paymentId` (`lib/types/index.ts:57`) | Hex today (`lib/mock-data/wallet.ts:69`), but `normalizePaymentId` accepts variable length (`lib/wallet-core/mappers.ts:264`) | Medium — defend. |
| `Transaction.hash` (`lib/types/index.ts:49`) | Hex | Low — defend anyway; cost is one regex test. |

**Mitigation (chosen approach): OWASP "prefix" defense, applied uniformly.**
For every string field, if the trimmed-left cell starts with one of
`= + - @ \t \r \n` (OWASP CSV-injection char set), prefix the cell content with
a single `'` (apostrophe) **before** RFC-4180 quoting. Excel/Sheets treat a
leading `'` as a literal-prefix and display the cell verbatim without it.

Rationale for prefix-over-strip:

- Strip silently corrupts legitimate messages that start with `-` (e.g. a
  user-typed `- thanks for the coffee`), which is a real Conceal message body
  today.
- Prefix is reversible, visible to spreadsheet users, and matches what
  Excel itself does when you type `=1+1` into a text-formatted cell.
- The apostrophe survives a round-trip through Excel's UI but is stripped on
  display, so the data remains intact for downstream parsing.

Implementation:

```ts
const FORMULA_TRIGGERS = /^[=+\-@\t\r\n]/;
function neutralizeFormula(value: string): string {
  return FORMULA_TRIGGERS.test(value) ? `'${value}` : value;
}
```

Apply `neutralizeFormula` **before** `csvField` (so the apostrophe is itself
subject to quoting rules — it never needs quoting, but the ordering is robust).

The unit test (§7) MUST include the canonical payloads from OWASP:
`=cmd|"/c calc"!A1`, `+1+1`, `-1+1`, `@SUM(A1:A2)`, `\t=1`, `\r=1`. All must
emerge from the serializer with the leading `'`.

**Non-goals / scope discipline**: do not attempt to sanitize inside the cell
(e.g. stripping mid-string `+`). The CSV injection literature is clear that the
threat is the **leading** character that the spreadsheet evaluates as a formula
trigger. Mid-string characters are inert.

---

## 4. Download helper — `lib/ui/download-csv-file.ts`

Mirror `lib/ui/download-json-file.ts:13-28` line-for-line, with two differences:

```ts
// Pseudocode — final file follows Biome 2-space/double-quote conventions.
const CSV_BOM = "\uFEFF"; // JS string → UTF-8 BOM bytes via Blob([prefix, body])

export function downloadCsvFile(filename: string, csv: string): void {
  if (typeof window === "undefined") {
    throw new Error("Download is only available in the browser."); // match download-json-file.ts:15-17
  }
  const blob = new Blob([CSV_BOM, csv], { type: "text/csv;charset=utf-8" });
  // …anchor.click() exactly as download-json-file.ts:19-27
}
```

Two deliberate choices:

1. **BOM as a separate Blob part**, not a string concat. If you do
   `"\uFEFF" + csv` and hand the result to `Blob([str])`, modern browsers emit
   UTF-8 BOM bytes correctly, but the concat pollutes the pure serializer's
   output if anyone reuses it. Passing BOM as its own Blob part keeps
   `transactionsToCsv` BOM-unaware (§2.4) while still satisfying Excel.
2. **`text/csv;charset=utf-8`** MIME (BRIEF.md:24). RFC 4180 §4 says `text/csv`
   is correct; the `charset` parameter is non-standard but harmless and is what
   every browser vendor expects for the save-as dialog.

### Filename

```
conceal-transactions-{filter?}-{YYYY-MM-DD}.csv
```

- Date in **ISO local-date** form (`new Date().toISOString().slice(0, 10)`) →
  e.g. `conceal-transactions-2026-06-16.csv` (matches the BRIEF.md:44 example).
- `{filter?}` is omitted when `active === "All"`; otherwise a kebab-case slug:
  `received`, `sent`, `deposits`, `withdrawals`, `messages`. This makes the
  filtered-vs-all intent (§5) legible from the file name alone — important when
  a user re-opens the file weeks later.

Build the slug from the existing `tabs` array at
`app/(wallet)/wallet/transactions/transactions-page-client.tsx:55` so a tab
rename can't drift the slug without a deliberate edit.

---

## 5. Filtered vs all (recommendation: filtered, with an unambiguous UX)

**Recommendation: export the current filtered + searched view (the `filtered`
array at `transactions-page-client.tsx:138-157`), not the full `data` array.**

Justification:

1. **Matches user mental model.** The user is looking at N rows; "Export" means
   "give me a file of what I'm looking at". Silently dumping a year of history
   when they filtered to "Sent" is a surprise — and surprise is the enemy of
   trust in a wallet.
2. **Smaller files, smaller blast radius.** A leaked filtered export leaks less
   metadata than a full one.
3. **The page already shows the count** (`${filtered.length} transactions found`
   at `transactions-page-client.tsx:268`) — the user has ground truth before
   clicking.
4. **The filter is encoded in the filename** (§4) so there's no ambiguity later.

**Mitigations to ship alongside (low-cost):**

- The success toast (§6) reports the count: `Exported 5 transactions · filtered to "Sent"`.
- If `filtered.length === 0`, the button is **disabled** with `aria-disabled`
  and a tooltip "No transactions to export" (BRIEF.md:45, "disabled/empty-list
  behavior").

**Rejected alternative — a dropdown with "Export view / Export all":** adds a
menu component, a new state, more test surface, and a usability question
("which did I pick last time?") for a feature whose primary value is speed.
Defer until there's user demand. Track as an open question (§9).

---

## 6. UX — button placement, label, behavior

### Placement

The BRIEF (`docs/specs/export-csv/BRIEF.md:21`) says the action goes in
`<PageHeader …>`. Concretely, pass it as the `action` prop in the existing call
at `transactions-page-client.tsx:224-227`:

```tsx
<PageHeader
  title="Transaction History"
  subtitle="Complete transaction history for your wallet"
  action={<ExportCsvButton transactions={filtered} activeFilter={active} />}
/>
```

`PageHeader` already accepts `action?: React.ReactNode`
(`components/wallet/common.tsx:21-44`) and renders it top-right on `sm+` screens
(`sm:flex-row sm:items-start sm:justify-between` at `common.tsx:33`). On mobile
it stacks below the title — acceptable.

### Label, icon, size

- **Icon**: `FileDown` from `lucide-react`. It's already imported elsewhere in
  the codebase for downloads
  (`app/(wallet)/wallet/export/page.tsx:3,134`), so it's a known-good glyph and
  keeps visual consistency with the Export page.
- **Label**: `Export CSV`. Two words, exactly what it does. Use the existing
  `<Button>` from `components/ui/button.tsx` with `variant="outline"` and
  `size="sm"` to sit naturally in the header row.
- **Accessible name**: `aria-label="Export filtered transactions as CSV"`.
  When `filtered.length === 0`, `disabled` + `title="No transactions to export"`.

### Feedback

- On click: build the CSV, call `downloadCsvFile`, then
  `toast.success(\`Exported ${rows.length} transactions\`)` — sonner is already
  the codebase's toast library
  (`app/(wallet)/wallet/export/page.tsx:5,54`).
- On `throw` (the helper guards against SSR — `downloadCsvFile` throws on
  `window === undefined`): `toast.error(...)`. This branch is unreachable in the
  browser but matches the existing try/catch pattern at
  `export/page.tsx:57-61`.

### Filename collision

The date in the filename is per-day. If a user exports twice in a minute,
browsers append `(1)`, `(2)` themselves — do not add a timestamp to the
filename, it just makes the name ugly.

---

## 7. Columns / shape

Eleven columns in this order. **Amount is the only column with a non-obvious
transformation; everything else is a passthrough of `Transaction` fields
(`lib/types/index.ts:47-61`).**

| # | Header | Source | Transform |
|---|---|---|---|
| 1 | `Date` | `timestamp` (`lib/types/index.ts:53`) | Pass through ISO-8601 UTC unchanged. `mapCoreTransaction` already produces ISO (`lib/wallet-core/mappers.ts:211-213`); keeping ISO preserves sortability and timezone correctness across viewers. |
| 2 | `Type` | `transaction.type` (`lib/types/index.ts:50`) | Raw enum value (`receive`/`send`/`deposit`/`withdrawal`/`fusion`/`miner`/`message`). The mappers already resolve message-tx into the `message` enum (`lib/wallet-core/mappers.ts:199`), so this is both raw and displayed. Lowercase for stable downstream parsing. |
| 3 | `Direction` | derived | `Incoming` / `Outgoing`. Computed from the same sign table the page uses (`transactionMeta` at `transactions-page-client.tsx:67-126`): `receive`, `deposit`, `withdrawal`, `miner`, incoming `message` → `Incoming`; `send`, `fusion`, outgoing `message` → `Outgoing`. Outgoing message is detected with `isUiMessageOut` (`lib/wallet-core/mappers.ts:140-146`), exactly as `formatSignedAmount` does at `transactions-page-client.tsx:722-727`. |
| 4 | `Amount (CCX)` | `amount.atomic` (`lib/types/index.ts:51`) | Signed decimal in CCX, **6 decimal places** (matches `COIN_UNIT_PLACES = 6`, `lib/config/wallet-network-scalars.mjs:3`, surfaced via `lib/config/config.ts:11`). Sign from §3 Direction. Format with `Number.toFixed(6)` (NOT `toLocaleString` — locale commas break CSV parsing even with quoting, and a fixed decimal is unambiguous). |
| 5 | `Address` | `address` (`lib/types/index.ts:52`) | As-is. |
| 6 | `Payment ID` | `paymentId` (`lib/types/index.ts:57`) | As-is, or empty string when absent. |
| 7 | `Message` | `message` (`lib/types/index.ts:58`) | As-is, or empty string when absent. **Always run through `neutralizeFormula` (§3).** |
| 8 | `Transaction Hash` | `hash` (`lib/types/index.ts:49`) | As-is (hex). |
| 9 | `Block Height` | `blockHeight` (`lib/types/index.ts:55`) | Integer. `0` while pending (per the type comment) — keep `0`; do not emit "Pending" here. |
| 10 | `Confirmations` | `confirmations` (`lib/types/index.ts:56`) | Integer. |
| 11 | `Status` | derived | `Confirmed` if `confirmations >= 10`, else `Pending` — matches `getTransactionStatus` at `transactions-page-client.tsx:718-720` exactly so CSV and screen agree. |

Header names are in `Title Case` with spaces — spreadsheets display them
readably and they're trivially quotable. They are **English-only** to match the
rest of the wallet UI (no i18n framework exists in the repo).

### Why sign on Amount, not a separate Sign column

A signed `Amount (CCX)` column lets a spreadsheet user write `=SUM(D2:D500)` and
get net flow directly — matching the page's "Net Flow" stat
(`transactions-page-client.tsx:429-437`). A separate unsigned amount + sign
column would force every consumer to multiply. The `Direction` column (#3) is
still there for human filtering.

### Why `Number.toFixed(6)` and not the existing `formatCcx`

`formatCcx` (`lib/utils.ts:40-50`) calls `toLocaleString("en-US", …)` which
emits `1,250.50` — the comma breaks CSV consumers that don't unwrap quotes, and
the default `CCX_HUMAIN_DECIMAL_DISPLAY = 2` (`lib/utils.ts:21`) loses precision.
For an export intended for re-import / accounting, **6 fixed decimals, no
thousands separator** is the right shape. Use `ccxToNumber` from `lib/utils.ts:32-34`
to convert atomic → CCX, then `toFixed(6)`.

---

## 8. Detailed file shapes

### `lib/ui/serialize-transactions-csv.ts`

```ts
import type { Transaction } from "@/lib/types";
import { isUiMessageOut } from "@/lib/wallet-core/mappers";
import { ccxToNumber } from "@/lib/utils";

export const CSV_COLUMNS = [
  "Date", "Type", "Direction", "Amount (CCX)", "Address", "Payment ID",
  "Message", "Transaction Hash", "Block Height", "Confirmations", "Status",
] as const;

// §3
const FORMULA_TRIGGERS = /^[=+\-@\t\r\n]/;

// §2 + §3
function csvField(value: string): string { /* neutralize → quote → escape */ }
function directionOf(tx: Transaction): "Incoming" | "Outgoing" { /* §7 */ }
function statusOf(confirmations: number): "Confirmed" | "Pending" { /* §7 */ }

/** Pure: rows → CSV string (no BOM, no download). Empty input → header only. */
export function transactionsToCsv(rows: readonly Transaction[]): string {
  const head = CSV_COLUMNS.join(",") + "\r\n";
  const body = rows.map(/* … */).join("\r\n");
  return body ? `${head}${body}\r\n` : `${head}`;
}
```

Notes:

- Input is `readonly Transaction[]` to honor the project's immutability
  convention (CLAUDE.md "Conventions & gotchas").
- Empty list returns **header + trailing CRLF only** — spreadsheets open it
  cleanly and the e2e can assert "exactly one row".
- No `window`/`document` references → jsdom-vitest-friendly (matches
  `tests/utils.test.ts:1-2` import shape).

### `lib/ui/download-csv-file.ts`

```ts
const CSV_BOM = "\uFEFF";

export function transactionsCsvFilename(activeFilter: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const slug = activeFilter === "All" ? "" : `-${activeFilter.toLowerCase()}`;
  return `conceal-transactions${slug}-${today}.csv`;
}

export function downloadCsvFile(filename: string, csv: string): void { /* §4 */ }
```

### `ExportCsvButton` (small inline component, can live in the page file or a
new `components/wallet/export-csv-button.tsx`)

- Props: `{ transactions: readonly Transaction[]; activeFilter: string }`.
- `disabled={transactions.length === 0}`.
- `onClick`: build + download + toast (§6).
- Render `<FileDown className="size-4" />` + `"Export CSV"`.

---

## 9. Test plan

### Unit (vitest, jsdom) — `tests/serialize-transactions-csv.test.ts`

Mirror the style of `tests/utils.test.ts:1-27` and
`tests/download-json-file.test.ts:1-15` — small, declarative, one behavior per
`it`. Required cases:

1. **Empty input** → exactly `"Date,Type,…,Status\r\n"` (header only, one
   trailing CRLF).
2. **Quoting — comma**: message `"a,b"` → quoted.
3. **Quoting — embedded quote**: message `'say "hi"'` → `"say ""hi"""`.
4. **Quoting — embedded newline**: message `"line1\nline2"` → quoted with the
   LF preserved (not stripped — only the row separator is CRLF).
5. **CRLF normalization**: lone `\r` or `\n` in message is preserved inside
   quotes (do not mutate user data; just contain it).
6. **Injection — `=`**: message `"=cmd|\"/c calc\"!A1"` → emitted with a leading
   `'`.
7. **Injection — `+ - @`**: each prefix neutralized.
8. **Injection — tab/CR leading**: `\t=1` and `\r=1` neutralized.
9. **Injection — no false positives**: message `"50% off"` is **not** prefixed
   (`%` is not a trigger). Address `"ccx7abc…"` is **not** prefixed.
10. **Sign mapping**: a `send` row → `-50.000000`; a `receive` row →
    `+10.000000` (or unsigned `10.000000`? — pick a convention and pin it; my
    recommendation is `+`/`-` both explicit so the column is self-describing).
11. **Outgoing message sign**: a `message` row with `outgoing: true` → negative;
    `message` without `outgoing` → positive. Use `isUiMessageOut` semantics from
    `lib/wallet-core/mappers.ts:140-146`.
12. **Decimal precision**: atomic `100` (1 receive, message tx) → `0.000100`.
    Atomic `50_000_000` (50 CCX) → `50.000000`. Exactly 6 decimals, no
    thousands separator.
13. **Status threshold**: `confirmations: 10` → `Confirmed`; `9` → `Pending`.
14. **Header column order** matches §7 exactly.
15. **Immutability**: the input array and its objects are deep-equal before and
    after the call (defense against accidental mutation — matches CLAUDE.md
    immutability convention).

### Unit — `tests/download-csv-file.test.ts`

1. `transactionsCsvFilename("All")` → `conceal-transactions-2026-06-16.csv`
   (mock `Date`).
2. `transactionsCsvFilename("Sent")` → `conceal-transactions-sent-2026-06-16.csv`.
3. `downloadCsvFile` throws on `window === "undefined"` (mirror the
   `download-json-file.ts:14-16` guarantee).
4. On `document`: the constructed `Blob` receives `[BOM, csv]` as its parts and
   `type === "text/csv;charset=utf-8"`. Assert by spying on `URL.createObjectURL`
   and reading the Blob text — exactly one part begins with `\uFEFF`.

### E2E (Playwright) — `e2e/export-csv.spec.ts`

The repo's existing e2e style is minimal
(`e2e/golden-path.spec.ts:1-22`, `e2e/view-only-mode.spec.ts:1-58`) — match it.
One test:

```ts
test("export filtered transactions downloads a CSV with header and BOM", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Open your wallet" }).click();
  await page.getByRole("link", { name: /Transactions/i }).click();

  const download = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: /Export CSV/i }).click(),
  ]).then(([d]) => d);

  expect(download.suggestedFilename()).toMatch(/^conceal-transactions-(all|received|sent|…)-\d{4}-\d{2}-\d{2}\.csv$/);
  const text = await (await download.createReadableStream()).read(); // orfsutil
  // BOM
  expect(text.charCodeAt(0)).toBe(0xFEFF);
  // Header
  expect(text).toContain("Date,Type,Direction,Amount (CCX)");
  // CRLF line endings
  expect(text).toContain("\r\n");
  // Safety property: NO unquoted cell starts with a formula trigger.
  for (const line of text.replace(/^\uFEFF/, "").split("\r\n")) {
    for (const cell of parseCsvRow(line)) { // tiny inline parser in the test
      expect(cell[0]).not.toMatch(/[=+\-@\t\r]/);
    }
  }
});
```

The last assertion is the **security gate**: regardless of what the mock data
contains, no spreadsheet will execute a formula. It's robust against future
mock-data edits. (Note: a quoted cell beginning with `-` is fine; the test
checks **unquoted** first chars, which is what Excel evaluates. The serializer's
contract is that any cell starting with a trigger has been apostrophe-prefixed,
so after a correct `parseCsvRow` no cell's *decoded* content starts with a
trigger.)

Also add one **second** test that filters to "Sent" first and asserts the
filename slug is `sent` and the row count matches the on-screen
"N transactions found" (`transactions-page-client.tsx:268`).

### Pre-merge gate

Per CLAUDE.md, the gate is `npm run types && npm run lint && npm test && npm run test:e2e`. The new files must pass `tsc --noEmit` and Biome (2-space, double
quotes, line width 100) — there is no relaxed override for `lib/ui`, only for
`lib/wallet-core/**` (CLAUDE.md, "Biome" gotcha).

---

## 10. Risks & open questions

**Risks**

1. **Regex-injection drift.** The `FORMULA_TRIGGERS` regex is the entire safety
   boundary. Mitigation: keep it as a module-level `const`, unit-test every
   OWASP payload against it (§9 cases 6–8), and add a comment citing
   OWASP/CWE-1236 so a future "cleanup" PR doesn't narrow it.
2. **Message-body `\r\n`.** A message containing a literal CRLF will be quoted
   correctly but some naive consumers (e.g. a quick `String.prototype.split`
   in a user's script) will mis-split. Acceptable — RFC-4180 consumers handle
   it, and we already CRLF-terminate every record so the file is internally
   consistent.
3. **Large exports.** A wallet with thousands of txs produces a large string.
   Strings are OOM-safe up to ~100 MB in modern browsers; Conceal wallet
   history is far below that. No streaming needed for v1; flag if a user ever
   reports >50k rows.
4. **Filename collision within the same minute.** Browser handles `(1)` suffix;
   do not over-engineer.
5. **Mobile layout.** `PageHeader.action` stacks below the title on narrow
   screens (`common.tsx:33`) — the button is reachable but not at the top-right.
   Acceptable; flag in design review if the mobile visual looks cramped.
6. **Filename slug drift if a tab is renamed.** The slug is derived from the
   `tabs` array (`transactions-page-client.tsx:55`); rename "Sent" → "Sent (Out)"
   and the slug changes. Mitigation: build the slug from an explicit
   `{ label: "Sent", slug: "sent" }` table rather than `tab.toLowerCase()`.

**Open questions for the orchestrator/merge step**

- **Filtered vs all** — I picked *filtered* (§5). The other three specs may
  disagree; the orchestrator should pick one and have all implementations
  conform.
- **Amount sign format** — explicit `+`/`-` (my pick, self-describing) vs
  unsigned-with-Direction-column (let the consumer decide). Low-stakes; pick
  consistently.
- **Date format** — ISO-8601 UTC (my pick). Some users prefer local time; we
  could add a second `Date (Local)` column, but that's feature creep.
- **Should `ExportCsvButton` live in the page file or its own component?** I
  lean toward a separate `components/wallet/export-csv-button.tsx` for
  testability, but inline is fine — the page file is already 770 lines.
- **Do we need a "what's included" info tooltip** explaining the filtered
  semantics? Cheap a11y win; defer to the design phase
  (`huashu-design` skill per CLAUDE.md workflow).
