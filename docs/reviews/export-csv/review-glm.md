# Pre-PR review — Export transactions to CSV (feat/export-transactions-csv)

Reviewer: GLM-5.2 · Scope: `git diff main HEAD` vs `docs/specs/export-csv/spec-merged.md`

## Verdict (formula-injection specifically)

**No formula-injection bypass found. No CRITICAL or HIGH.** The guard is the whole
safety boundary and it is implemented correctly:

- `FORMULA_TRIGGER = /^[=+\-@\t\r\n]/` (`lib/ui/transaction-csv.ts:46`) is the exact
  OWASP / CWE-1236 trigger set, and `SPACE_THEN_FORMULA = /^\s+[=+\-@]/` (`:47`)
  additionally covers whitespace-then-trigger (incl. unicode whitespace — JS `\s`
  matches NBSP/U+2028/U+2029/U+FEFF, so e.g. `"\u00a0=cmd"` and `" \n=1"` are caught).
- `neutralizeFormula` (`:50-52`) prepends a single `'` **before** RFC-4180 quoting
  (`csvField` at `:55-59` runs `neutralizeFormula` first, then `needsQuotes`, then
  quote-doubling). The `'` always lands **inside** the quotes when quoting is needed.
- The guard is applied to **every** body cell whose column index is not in
  `TRUSTED_INDICES` (`:24-26`), i.e. all string columns (Date, Type, Direction,
  Address, Payment ID, Hash, Block Height, Confirmations, Status, Message). The unit
  battery proves the result starts with `'` and is therefore not spreadsheet-evaluable.
- **Trusted-amount exemption is safe.** Amount (CCX) / Amount (atomic) derive solely
  from the typed `transaction.amount.atomic` number via `toFixed` / `Math.abs` +
  template coercion (`lib/ui/transaction-csv.ts:72-73`). `Number.prototype.toFixed`
  and `String(Number)` can never yield a leading `= + @`, so the exemption cannot
  smuggle an executable cell. The only leading char the trusted columns can emit is
  the intentional `-` sign — see the design-decision note in finding #2.

Nothing here can ship a spreadsheet-executable cell as-is. The findings below are
test-gap, latent-correctness, drift, and spec-compliance issues.

---

## Findings

### [MEDIUM] E2E formula-injection security gate is missing, and the spec's prescribed gate contradicts the signed-amount decision
**Where:** `e2e/export-csv.spec.ts` (whole file); conflict with `docs/specs/export-csv/spec-merged.md:87` vs `:68-74`.

`spec-merged.md:87` mandates an e2e security gate: *"no decoded cell starts with a
formula trigger"*. Neither e2e test parses the downloaded CSV to assert this. Worse,
the mock data (`lib/mock-data/wallet.ts:46-137`) contains **no** `= + - @` payload
anywhere (messages are `"Invoice payment"`, addresses all start with `ccx7`, paymentId
is `"a".repeat(64)`), so a regression that simply deleted `neutralizeFormula` would
pass the entire e2e suite. The unit battery (`tests/transaction-csv.test.ts:113-133`)
is the only line of defense and is good — but the spec-required e2e defense-in-depth is
absent.

Compounding this: the spec's literal gate ("no cell starts with a trigger") is
**incompatible with its own signed-amount design decision** — every send/fusion row
legitimately emits `-50.000000` / `-50000000` in the Amount columns, and `-` is a
trigger. A maintainer implementing the gate verbatim would hit false positives on sends
and be tempted to "fix" it by widening the guard onto the amount columns, which
reintroduces the `'-50` fidelity bug the exemption exists to avoid. (Presumably this
conflict is why the gate was silently dropped.)

**Concrete fix:**
1. In `e2e/export-csv.spec.ts`, after decoding the download, parse the CSV, unquote
   every field, and assert that **no non-Amount cell** starts with `[=+\-@\t\r\n]`:
   ```ts
   const TRUSTED = new Set([3, 4]); // Amount (CCX), Amount (atomic)
   for (const row of parsedRows.slice(1)) {
     row.forEach((cell, i) => {
       if (TRUSTED.has(i)) return;
       expect(cell[0]).not.toMatch(/[=+\-@\t\r\n]/);
     });
   }
   ```
2. Seed the mock data (or a dedicated export fixture) with a transaction whose
   `message` is `=cmd|"/c calc"!A1` and whose `paymentId` starts with `+`, so the gate
   actually has something to catch — and assert those cells start with `'`.
3. Add a comment in the e2e explaining **why** the Amount columns are exempt, so the
   next reader does not remove the exemption.

---

### [LOW] Injection unit battery only exercises Message + Payment ID; Address and Hash (also attacker-influenced) are uncovered
**Where:** `tests/transaction-csv.test.ts:113-133` (battery covers only `COL.Message` and `COL["Payment ID"]`).

The guard is column-agnostic (`TRUSTED_INDICES` exempts only indices 3 and 4), so
Message coverage implicitly exercises the mechanism for all guarded columns. But
Address and Hash are the next most attacker-reachable string columns (counterparty
address for outgoing messages at `lib/wallet-core/mappers.ts:210`; hash surfaced from
chain data), and there is no direct assertion that a payload placed in those columns is
neutralized. A future refactor that, say, special-cased Address would slip through.

**Concrete fix:** add two cases to the battery placing `=cmd|"/c calc"!A1` in `address`
and in `hash`, asserting each emitted cell `startsWith("'")`.

---

### [LOW] `hash` is not null-coalesced, unlike every other optional field — latent "undefined" cell
**Where:** `lib/ui/transaction-csv.ts:76` (inside `transactionRow`, `:65-82`).

`address ?? ""`, `paymentId ?? ""`, `message ?? ""` are all coalesced (`:74-80`), but
`transaction.hash` is passed straight through. The mapper (`mappers.ts:206`) builds
`id: tx.hash || ...`, indicating `tx.hash` can be falsy/empty. If a real-mode tx ever
surfaces with `hash: undefined`, `csvField` would stringify it and the row join would
emit the literal `undefined` into the Hash cell. (No crash today — `needsQuotes` stays
false on `"undefined"` so `replaceAll` is never invoked — but it is a silent fidelity
bug waiting on malformed input.)

**Concrete fix:** `transaction.hash ?? ""` at `lib/ui/transaction-csv.ts:76`.

---

### [LOW] Block Height and Confirmations are numeric-but-guarded columns — latent `'-1` mis-render
**Where:** `lib/ui/transaction-csv.ts:77-78` (`String(transaction.blockHeight)`, `String(transaction.confirmations)`), in conjunction with the `TRUSTED_HEADERS` scope at `:23`.

These columns are `String(number)` generated from trusted typed numbers — the same
rationale used to exempt Amount (CCX)/Amount (atomic) — but they are **not** in
`TRUSTED_HEADERS`, so `neutralizeFormula` runs on them. Today both are clamped `>= 0`
(`mappers.ts:201`), so no false positive fires. But the moment a negative height or
confirmation value reaches the serializer, the `-` would be formula-guarded and the
cell would render as text `'-1` in a spreadsheet. The design intent ("all pure-numeric
columns are exempt") is also left half-applied.

**Concrete fix:** either add `"Block Height"` and `"Confirmations"` to `TRUSTED_HEADERS`
(with the same comment), or coerce with an explicit non-negativity guard at the row
builder. Adding them is the cleaner statement of intent.

---

### [LOW] Confirmed/Pending threshold `10` is duplicated — silent drift risk vs. the screen
**Where:** `lib/ui/transaction-csv.ts:79` (`confirmations >= 10`) vs
`app/(wallet)/wallet/transactions/transactions-page-client.tsx:742` (`getTransactionStatus`).

The CSV's Status column hardcodes `>= 10` to mirror the page, but the page's threshold
is a separate magic number. If one changes, the export silently diverges from what the
user sees — violating the WYSIWYG goal that is the whole point of "filtered export"
(`spec-merged.md:55-58`).

**Concrete fix:** extract a shared `CONFIRMED_THRESHOLD` constant and import it in both
places.

---

### [LOW] Filename slug uses `activeFilter.toLowerCase()` — the exact pattern the merged spec's Risks section warned against
**Where:** `lib/ui/download-csv-file.ts:9`; risk called out at `docs/specs/export-csv/spec-merged.md:92`.

The merged spec says: *"derive from an explicit `{label,slug}` table, not
`tab.toLowerCase()`."* The implementation uses `activeFilter.toLowerCase()` directly.
All current tabs are single clean words (`Received`, `Sent`, …) so it produces valid
slugs today, but a future multi-word tab label (e.g. `"Sent (30d)"`) would yield a
filename with spaces and parentheses.

**Concrete fix:** map each tab to an explicit slug via a lookup table co-located with
the `tabs` array, and sanitize to `[a-z0-9-]`.

---

### [LOW] No success/error feedback on export; a corrupt timestamp throws silently in the click handler
**Where:** `app/(wallet)/wallet/transactions/transactions-page-client.tsx:191-194` (`handleExportCsv`).

Two related issues:
1. The merged spec calls for a success `toast` reporting the row count
   (`spec-merged.md:64`). The handler fires the download with no toast, so the user
   gets no confirmation of how many rows were exported.
2. `transactionsToCsv` deliberately throws on a corrupt timestamp
   (`new Date(bad).toISOString()` at `lib/ui/transaction-csv.ts:69`, per
   `spec-merged.md:40`'s "invalid → throw, don't hide corrupt data"). `handleExportCsv`
   has no `try/catch`, so a single bad row aborts the entire export with **no**
   user-visible error — the click just appears to do nothing.

**Concrete fix:** wrap the call in `try/catch`; on success, toast
`Exported {filtered.length} transactions`; on failure, toast a translated error and
(optionally) log the offending id so the user can see *which* row is corrupt rather
than getting a silent no-op.

---

## What was verified correct (no action needed)

- RFC 4180: CRLF joins + trailing CRLF (`:95`), quote-on-demand with doubled embedded
  quotes (`:58`), embedded newlines preserved inside quotes, `null/undefined` → `""`.
- Trusted-exemption scope: only indices 3 and 4 (`:24-26`); header serialized with
  `allTrusted=true` is safe (headers are fixed literals, none start with a trigger).
- Direction / sign logic matches the page exactly: `OUTGOING_TYPES = {send, fusion}` +
  `type === "message" && isUiMessageOut` (`:61-63`, `:41`) mirrors
  `formatSignedAmount` / `transactionMeta.sign` in the page client, including the
  intentional `withdrawal` → Incoming treatment. 12-column order matches
  `spec-merged.md:36` verbatim; React-only `id` omitted.
- Filtered-export semantics correct: exports `filtered` (active tab + search), not
  `visibleTransactions` (page slice) and not all `data`; filename encodes the active
  tab; `disabled={filtered.length === 0}` with `title` tooltip.
- BOM delivered as its own Blob part (`lib/ui/download-csv-file.ts:19`), serializer
  stays BOM-free; `text/csv;charset=utf-8`; `[0xef,0xbb,0xbf]` verified by unit test.
- Immutability: `transactionRow` only reads; unit test confirms input deep-equal after.
- Guard idempotency: `'`-prefixed output never itself starts with a trigger, so no
  double-prefix or re-triggering.
