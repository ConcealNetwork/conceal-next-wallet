# #84 i18n — Send page (conservative) — review response

Localizes only the SAFE neutral labels on the Send page (the highest-stakes page) into all
10 locales; every send-consequence / address-correctness / irreversibility warning is left
in English and flagged for a translator. Reviewers: Codex, CodeRabbit. GLM unavailable.

## Safety split (the whole point of this slice)

- **Localized (30 `send.*` keys):** field labels, fee labels (Network fee, Remote node fee,
  Total, Available, Ready to spend), the 3 FORMAT validation messages (amount positive,
  payment-id hex/max), Recently Sent, page subtitle, neutral action labels.
- **Left ENGLISH + flagged (translator pass):** "CCX addresses start with ccx7", "A CCX
  address is ~98 characters", "Cannot send to your own wallet address", "Exceeds available
  balance", "Enter the recipient's CCX address …", the payment-link confirm toast, the
  message-byte-limit error. Plus the out-of-scope safety copy in
  `components/wallet/send-review-warnings.tsx` and `lib/ui/wallet-copy.ts` (`sendConfirm`) —
  untouched.

## Independent verification (orchestrator)

- grep of all `send.*` keys for consequence/correctness phrasing → **none localized**.
- The Zod schema became a `makeSendSchema(t)` factory called via `useMemo(() => …, [t])`
  inside the component (no module-scope hook); validation rules unchanged; the address /
  self-send / balance messages stay hardcoded English.
- Parity passes; placeholders ({amount},{usd}) intact ×10; en byte-identical for the
  send-safety e2e selectors → send-safety + keyboard-nav e2e 6/6 (and payment-reminders).

## Codex (gpt-5.5)

**No material findings.** Verified the safety split (no warning moved into `send.*`; confirm
copy stays in `send-review-warnings.tsx`), the schema refactor (rules unchanged, no
module-scope hook, resolver wired), en byte-identity for all 6 e2e selectors, key/placeholder
parity, and reused-key correctness.

## CodeRabbit

| # | Finding | Verdict |
|---|---------|---------|
| 1 (major) | `send/page.tsx:316` — "Exceeds available balance" left English | **Accepted, fixed.** It's a neutral balance-validation message (same category as the amount/payment-id format errors already localized), not a consequence warning; the validation blocks the send regardless of the text. Added `send.errExceedsBalance` ×10 + `t()`. en identical. |
| 2 (minor) | `send/page.tsx:476` — confirm-dialog description still uses `walletCopy.sendConfirm` while the title uses `t()` | **Rejected (intentional).** `walletCopy.sendConfirm` IS the send irreversibility warning — the security copy this slice deliberately keeps English for a translator. The title ("Confirm send") is a neutral label (localized); the description is the consequence warning (not). The inconsistency is the safety boundary, by design. |

## Notes

This completes the "safe labels" pass on the Send page. The genuine security/consequence
copy — send confirmation, recipient-correctness warnings, self-send guard — remains English,
awaiting a translator-in-the-loop pass (the user's stated requirement for wallet security copy).
