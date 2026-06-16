# Review response — export transactions to CSV

Reviewers: Codex (gpt-5.5), Gemini 3.1 Pro, GLM-5.2, CodeRabbit. **Consensus: no
formula-injection bypass, the guard is correct, and the trusted-amount exemption is
safe** (GLM verified explicitly; no CRITICAL/HIGH in the code). Findings were
test-gap / latent-robustness / drift.

## Addressed
- **E2E security gate** (Codex, Gemini, GLM) — the e2e now parses every downloaded
  cell and asserts none starts with a formula trigger, **exempting the signed Amount
  columns** (they legitimately start with `-`), with a comment so the exemption isn't
  removed.
- **`Amount (CCX)` double-minus** (Gemini) — wrapped in `Math.abs()` like the atomic
  column, so a hypothetical negative `amount.atomic` can't produce `--50`.
- **`hash` not coalesced** (GLM) — `hash ?? ""`, matching the other optional fields.
- **Block Height / Confirmations** (GLM) — added to `TRUSTED_HEADERS` (numeric,
  generated) so a future negative value can't be formula-guarded into `'-1`.
- **Injection unit battery broadened** (Codex, GLM) — now table-driven over Message,
  Payment ID, Address, and Hash, not just Message.
- **Confirmed threshold drift** (GLM) — extracted `TX_CONFIRMED_THRESHOLD` to
  `lib/config/config.ts`; both the CSV serializer and the page status use it (WYSIWYG).
- **Filename slug** (GLM) — sanitized to `[a-z0-9-]` so a multi-word tab label can't
  break the filename.
- **No export feedback / silent throw** (GLM) — `handleExportCsv` wrapped in
  try/catch with a success toast (row count) and an error toast.
- **Spec doc** (CodeRabbit) — marked the amount-sign + newline decisions RESOLVED
  (signed, approved; newlines preserved) so the doc reflects the shipped choice.

## Deferred (with reason)
- **`transactionRow` exact-tuple return type** (Gemini, LOW) — marginal; `CSV_COLUMNS`
  is the single header source and a unit test asserts column order/count.
- **Test-helper `rows()` naive `\r\n` split** (Gemini, LOW) — only breaks on an
  embedded CRLF inside a quoted field, which no test or mock row produces; `parseRow`
  already decodes cells correctly.
- **E2E malicious-data fixture** (GLM) — would add a fake `=cmd…` row to the shared
  mock demo data; the unit battery already proves the guard against the full OWASP
  payload set, and the e2e scan proves the real output is formula-safe.
