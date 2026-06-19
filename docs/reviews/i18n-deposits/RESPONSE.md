# #84 i18n — Deposits page — review response

Localizes the Deposits page (list/cards/table, summary, create form, financial-display
labels) into all 10 locales (102 new `deposits.*` keys; reuses nav, rail, txn, account, action).
Reviewers: Codex, CodeRabbit. GLM unavailable (opencode hang).

## Independent verification (orchestrator)

- **No warning copy localized:** grep of `deposits.*` for forfeit/cannot/irreversible/penalty/
  locked-until → none. The deposit/withdraw CONFIRM-dialog descriptions stay in `walletCopy`
  (out of scope, untouched) — exactly the financial-consequence copy reserved for a translator.
- **No math altered:** the diff is label-only — `t()` calls + plural/heading conditionals; no
  interest/APR/principal/fee computation changed.
- 95 `t()` keys exist; parity passes; placeholders clean ×10; no module-scope `useI18n`;
  en byte-identical → golden-path + shell-redesign e2e green.

## Codex (gpt-5.5)

| # | Finding | Verdict |
|---|---------|---------|
| 1 | `deposits.daysValue` = "{count} days" → "1 days" for a 1-day unlock (singular lost) | **Fixed.** Reuse the existing `deposits.daysLabelOne`/`daysLabelOther` ("{count} day"/"{count} days"), selected on `Math.round(value) === 1`; removed the now-duplicate `daysValue`. |
| 2 | `deposits.monthsValue` = "{count} months" → "1 months" for a 1-month term (the min term is 1) | **Fixed.** Added `deposits.monthsValueOne` ("{count} month") to all 10 locales; the 3 sites select on `count === 1`. |

Codex confirmed clean: no warning/consequence copy localized (confirm dialogs still from
`walletCopy`), hook safety (`DEPOSIT_STATUS_LABEL_KEYS` map resolved at render), math/
interpolation unchanged, dictionary integrity (102 keys × 10, placeholder parity).

## CodeRabbit

`coderabbit review --plain -t all --base main` → **No findings.**

## Notes

No seed/recovery/send-key/irreversibility copy on this page — none touched. The deposit
create/withdraw CONFIRMATION descriptions (which can carry consequence warnings) live in
`lib/ui/wallet-copy.ts` and were intentionally left English for a translator pass.
