# #84 i18n — remaining safe pages (Messages/Insights/Check-ins/Scheduled/Donate) — review response

Localizes the 5 remaining non-sensitive pages into all 10 locales (~158 new keys across
messages.*/insights.*/checkIns.*/scheduled.*/donate.*; reuses nav.*/action.*). Two small
logic refactors: donate state keyed by stable tokens, messages `formatTtlMinutes` made
hook-safe. Reviewers: Codex (credits refilled), CodeRabbit.

## Independent verification (orchestrator)

- 147 `t()` keys used across the 5 pages all exist; parity test passes (all 10 locales =
  en key set); placeholders preserved across locales (clean ×10 totals).
- en byte-identical for e2e-covered strings → insights + check-ins + payment-reminders +
  shell-redesign + golden-path all green.
- donate refactor: only token comparisons remain (`method === "crypto"`); no module-scope
  `useI18n` in any of the 5 files; insights/check-ins enum-keyed refactors keep full coverage.

## Codex (gpt-5.5)

| # | Finding | Verdict |
|---|---------|---------|
| 1 | Scheduled page's cadence labels render via `formatCadence()` → hardcoded English in all locales | **Fixed.** Added `scheduled.cadenceWeekly/Monthly/Quarterly/Yearly` to all 10 locales; render via a `CADENCE_LABEL_KEYS` map + `t()` at both sites; dropped the now-unused `formatCadence` import. en identical. |

Codex confirmed clean: donate token-keying (default `"crypto"`, no localized-label compare),
no module-scope hooks, placeholder + key parity, en byte-identity, `TYPE_LABEL_KEYS`/`STATUS_META`
full enum coverage.

## CodeRabbit

| # | Finding | Verdict |
|---|---------|---------|
| 1 | `donate.tsx:76` — `cadence.toLowerCase()` lowercases a TRANSLATED phrase → corrupts casing in other locales (German nouns, Turkish I/i) | **Fixed.** Removed `.toLowerCase()`; the toast uses the localized cadence as-is (the "Mock {cadence} …" label reads fine capitalized and is correct per-locale). |
| 2 | `scheduled.tsx` — `placeholder="ccx7 …"` hardcoded, inconsistent with the i18n migration | **Fixed.** Repointed to the existing `addressBook.addressPlaceholder` (same generic "ccx7 …" address hint, identical across locales) — DRY, matches the address-book precedent, no duplicate keys. |

## Notes

No seed/recovery/send-key-display/irreversibility security copy on these pages — none touched.
The remaining #84 pages (Send, Settings, Deposit lock warnings) carry security/financial copy
and warrant a translator in the loop. "check-in" kept as a loanword in several locales (the
established product term); flagged for native review.
