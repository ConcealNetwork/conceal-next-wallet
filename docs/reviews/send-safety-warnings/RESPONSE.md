# Review response — send-flow safety warnings

Reviewers (per the CLAUDE.md workflow, called directly): **CodeRabbit** (clean),
**GLM-5.2** (`opencode`), **Antigravity / Gemini 3.1 Pro** (`agy`). **Codex** (`codex exec`,
gpt-5.5) was unavailable — workspace out of credits (confirmed on a direct call, not just
the subagent).

Consensus on the clean categories: XSS-safe (contact label rendered as a React text child,
escaped), stable React keys (`key={warning.kind}`, one entry per kind), correct ordering.

## Addressed

- **Locked-deposit note fired on every send and was misleading** (GLM, MEDIUM) — the
  condition was `lockedDepositsCcx > 0`, which is always true in mock mode, and the copy
  ("not available to send") implied the *current* send was constrained when it wasn't.
  **Fix:** `deriveSendWarnings` now also takes `availableCcx` + `sendTotalCcx` and emits the
  note only when the send actually exceeds available **and** funds are locked — i.e. when the
  locked balance genuinely explains the shortfall. Reworded to "This exceeds your available
  balance — N CCX is locked in deposits until maturity" and promoted to an amber warning tone.
  Tests + e2e updated (the e2e now drives a 700 CCX send against 634.75 available).
- **Warnings relied on colour + icons for meaning** (Gemini, MEDIUM, a11y) — icons are
  `aria-hidden`, so a screen reader heard plain text with no severity context. **Fix:** each
  row now has a visually-hidden prefix (`sr-only` "Warning:" / "Note:") so the meaning is
  conveyed in text, not colour alone.
- **Redundant `recipient &&` guard** (GLM, LOW) — `isSendToSelf` already returns false on
  empty input; removed the dead check.
- **"self-send is dead code"** (Gemini, LOW) — partially incorrect: direct self-sends are
  blocked at the form, but a `conceal:` payment link to one's own address reaches the confirm
  dialog via the "Continue" path. Kept as a live last line of defence; added a comment saying so.

## Deferred (with reason)

- **No end-to-end coverage of the address-book-match path** (GLM, LOW) — mock contacts are
  81–87 chars and fail the send schema's `min(90)`, so a match can't be triggered through the
  UI in mock mode. Fixing this means lengthening the mock contact addresses to 98 chars, but
  those exact strings are asserted across many unrelated tests (`wallet-mappers`, the message
  suites) — too broad a change for this PR. The match logic is unit-tested; the mock-data
  realism gap is noted as pre-existing, separate work.
