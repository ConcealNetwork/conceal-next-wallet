# #84 i18n — Account page — review response

Localizes the Account page + balance hero into all 10 locales (33 new `account.*`
keys; reuses 6 `rail.*` keys from the shell slice). Reviewers: CodeRabbit, Codex.
GLM omitted (opencode review-size hang).

## Independent verification (orchestrator)

- All 32 `t()` keys used in the two TSX files exist in the dictionary (no raw-key render).
- Placeholder totals are clean ×10 multiples across locales (e.g. `{pct}` 50 = 5 keys ×10,
  `{message}`/`{days}`/`{total}` 10 each) — none dropped.
- Parity test passes (all 10 locales = the en key set).
- en values byte-identical for the e2e-critical strings (Account Overview / Available /
  Pending / Locked / Withdrawable / Dust) → shell-redesign + golden-path e2e 9/9 green.

## Codex (gpt-5.5)

**No findings.** Verified placeholder integrity (all 14 placeholder tokens preserved in
every locale), key parity, en behaviour (the 6 exact-match strings unchanged), reused-key
correctness, the `of {total} total · {usd} USD` emphasis change (values preserved), and that
every `t()` key + `TX_META.labelKey` resolves.

## CodeRabbit

`coderabbit review --plain -t all --base main` → **No findings.**

## Notes

- **Minor visual trade-off** (flagged, accepted): the hero's "of {total} total · {usd} USD"
  subline now renders fully `font-semibold` instead of emphasising only the two values.
  Substring emphasis inside an interpolated translation needs rich-text i18n the simple
  `t()` system doesn't provide; uniform styling is the standard trade-off. Visually minor
  (a small secondary gray line).
- No seed/recovery/send/export security copy exists on these files — none touched. Shared
  `transaction-display` labels (used by the transactions page too) were left for a dedicated
  slice.
