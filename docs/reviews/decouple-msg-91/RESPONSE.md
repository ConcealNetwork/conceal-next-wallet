# #91 — decouple message-thread mappers from wallet-core — review response

Pure-move decoupling of the message-thread + address-book mappers out of `lib/wallet-core`
into a neutral `lib/messages/thread-mappers.ts`, plus relocating the `RawAddressEntry` type to
`lib/types`. Reviewers: Codex, CodeRabbit. GLM unavailable (opencode hang).

## Independent verification (orchestrator)

- The 4 moved functions (`resolveThreadKeyFromMeta`, `findAddressBookContact`,
  `compareMessagesChronological`, `sortMessagesByHeight` + private `messageChronologyHeight`)
  are behavior-identical to the originals (same thread-key/contact-match logic, the
  mempool-sorts-last comparator, immutable `[...messages].sort()`).
- New module imports ONLY `@/lib/messages/thread-key`, `@/lib/types`, `@/lib/validation/ccx` —
  no `@/lib/wallet-core`.
- No `app`/`components`/`lib` file imports the 4 names from `@/lib/wallet-core/mappers` any more.
- `RawAddressEntry` (id/label/address/paymentId?/avatar?) now in `lib/types` (a leaf); `Wallet.ts`
  re-exports it so wallet-core-internal users keep working.
- Gate: types ✓, lint ✓ (0/0), 25 message tests (wallet-mappers + message-conversations) ✓,
  514 full unit ✓, shell-redesign e2e 8/8.

### Note: the SDK's own RawAddressEntry
`lib/services/real-sdk/address-book.service.ts` imports `RawAddressEntry` from `conceal-wallet-sdk`
(the SDK's own type), NOT wallet-core's — correctly LEFT untouched (repointing would swap a
distinct SDK type for ours).

## Codex (gpt-5.5)

**No findings.** Confirmed moved bodies match the deleted originals, neutral imports, RawAddressEntry shape + re-export, mappers internal-use + back-compat coverage, SDK type untouched.

## CodeRabbit

One minor: `compareMessagesChronological` has no NaN-timestamp guard. **Rejected for this slice** — it is a PURE MOVE (behavior must stay byte-identical); adding the guard would CHANGE the sort for an edge case the original never guarded, and message timestamps are always valid ISO strings from on-chain data (NaN does not occur). A defensive guard, if wanted, belongs in a separate hardening change, not a decoupling move.

## Scope

With this + #129 (transaction mappers) + #130 (CoinUri), the UI and services are decoupled from
`wallet-core` for transaction classification, payment URIs, and message threading. Remaining
UI→wallet-core coupling: `InterestCalculator` (reads a legacy global `config`, must match the
conceal-core daemon's integer math — a behavior-sensitive de-globalization, not a clean move).
The engine deletion + the `NEXT_PUBLIC_WALLET_ENGINE` fallback remain gated on SDK-readiness.
