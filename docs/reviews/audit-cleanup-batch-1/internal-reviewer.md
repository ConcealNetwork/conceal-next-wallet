# Internal code-reviewer (sonnet) — `chore/audit-cleanup-batch-1` (PR #206) vs `main`

Read-only review of the cleanup batch (fee-helper dedup, fee constants, deposit-duration options, WalletSwitcher simplification, dead-file deletion, mock markRead contract fix).

## Critical / High
None.

## Fund-path safety
- `safeNodeFeeAddress` (`spend.ts`) — byte-identical to the originals in both services.
- `decodeFeeRecipient` (`spend.ts`) — byte-identical: `isValidAddress(feeAddress) ? feeAddress : WALLET_DONATION_ADDRESS` then `decodeRecipient(target)`. The `message.service.ts` inline replacement produces the identical `nodeFee` object.
- `isValidAddress` / `WALLET_DONATION_ADDRESS` imported correctly in `spend.ts`; the services still import `isValidAddress` for their own address-validation guards. No dangling references to the deleted local copies.

## Fee constants
`NETWORK_FEE_CCX`/`REMOTE_NODE_FEE_CCX`/`SEND_FEE_CCX` in `config.ts` match the prior inline math. Send page imports them aliased (`as NETWORK_FEE`, etc.); all 7 sites resolve. Send rail imports `SEND_FEE_CCX as SEND_FEE`. No circular import (`config.ts` imports only `./wallet-network-scalars.mjs`).

## Deposit terms
`DEPOSIT_DURATION_OPTIONS` equivalent to the former inline `.map`; both dialogs consume it. `DEPOSIT_MAX_TERM_MONTH` import kept where still used (tier note).

## WalletSwitcher
`sidebar` variant + `collapsed` prop removed; sole caller (`global-header.tsx`) uses `<WalletSwitcher />`. No dangling refs; `ChevronDown` import removed; dropdown still renders.

## Dead files
`tabs.tsx` / `separator.tsx` / `info-pill-button.tsx` deleted with zero remaining references.

## mock markRead
Old `?? mockMessages[0]` fallback gone; throws `"Message not found."` on an unknown id (matches the real SDK). No test/caller relied on the old fallback.

## Summary
All six review items behavior-identical; regressions absent; deletions complete. Clean to merge.

---
*Note: this batch's Codex / Antigravity / CodeRabbit review files were inadvertently deleted before commit and are not recoverable. GLM (`glm.md`) + this internal review are the retained artifacts. Codex (gpt-5.5) and Antigravity (Gemini 3.1 Pro) both returned **clean** with no findings; CodeRabbit returned **No findings**.*
