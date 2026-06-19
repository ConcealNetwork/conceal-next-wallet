# #84 i18n — shell/rail strings — review response

Localizes the hardcoded English strings introduced by the #122 shell/rails into all
10 locales (49 new keys × 10; 4 existing keys reused). Reviewers: CodeRabbit, Codex.
GLM omitted — opencode `run` has hung with zero output on every review-size diff this
session (stages 2, 3); the `consult` workaround CLI is not installed here.

## Independent verification (orchestrator)

- Placeholder preservation across all 10 locales — exact totals: `{amt}` 60 (6×10),
  `{pct}` 30 (3×10), `{label}` 10 (1×10). A dropped placeholder would lower a total.
- Key parity test (`tests/i18n.test.ts`) passes — all 10 locales share the en key set.
- Reused keys verified: `nav.account`="Account", `nav.market`="Market", `nav.send`="Send",
  `nav.receive`="Receive" (equal to the originals).
- en values byte-identical → the shell e2e (which selects by exact English name) passes 9/9.

## Codex (gpt-5.5)

| # | Finding | Verdict |
|---|---------|---------|
| 1 | Rail copy-button aria changed from `Copy {label.toLowerCase()}` to `Copy {label}` → "Copy Payment ID" instead of "Copy payment id" | **Rejected (intentional, not a regression).** Lowercasing a *translated* label is incorrect for non-English locales (German capitalizes nouns; CJK has no letter case), so the localized rail uses the natural-case label via `action.copyField`. The English-only detail **dialog** keeps its `toLowerCase()` nicety until it too is localized. No test asserts these copy labels (only a literal `"Copy address"`); capitalization is screen-reader-equivalent — no functional change. |

Codex confirmed clean: placeholder parity, key parity, required English names preserved, reused-key correctness.

## CodeRabbit

`coderabbit review --plain -t all --base main` → **No findings.**

## Native-review flags (machine translations, idiomatic but worth a native pass)

Per the implementing pass: RU `header.markAllRead` and the `{pct} percent` phrasings
(number-case agreement), JA/KO percent wording, and the crypto-domain verbs
"Fused"/"Mined" across zh/ja/ko. All `{placeholder}` tokens preserved verbatim.
Security-critical strings (seed phrase, send/irreversibility warnings) were **not**
touched in this slice — they remain for a translator-in-the-loop pass.
