No real issues found.

- Behavior preservation: clean. `lib/ui/transaction-kind.ts:12-33` preserves the moved signatures and logic for `isSentMessageAmount`, `isUiMessageIn`, `isUiMessageOut`, and `resolveUiTransactionType`; constants are the same `MESSAGE_TX_AMOUNT_ATOMIC`, `SENT_MESSAGE_AMOUNT_SELF_ATOMIC`, and `SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC` imports at `lib/ui/transaction-kind.ts:4-8`.
- Circular import: clean. `lib/ui/transaction-kind.ts:4-9` imports only config/types; `lib/wallet-core/mappers.ts:17` imports the new module one-way. `lib/types/index.ts:1-203` is type-only domain data and does not import wallet-core.
- Missed callers: clean for source/test callers. The repointed importers are `app/(wallet)/wallet/transactions/transactions-page-client.tsx:53`, `components/layout/global-header.tsx:33`, `components/layout/rails/transactions-rail.tsx:21`, `components/wallet/transaction-display.tsx:15`, `lib/ui/transaction-csv.ts:4`, and `tests/wallet-mappers.test.ts:9`. Remaining `@/lib/wallet-core/mappers` imports do not import these four names.
- `mappers.ts` imports: clean. `MESSAGE_TX_AMOUNT_ATOMIC` remains used by core message classification at `lib/wallet-core/mappers.ts:115`, and `isSentMessageAmount` / `isUiMessageOut` are used at `lib/wallet-core/mappers.ts:121` and `lib/wallet-core/mappers.ts:264`.
- Re-export plus internal import: clean. `lib/wallet-core/mappers.ts:17` imports the two names it uses locally, while `lib/wallet-core/mappers.ts:100-105` re-exports all four from the same source; `npm run types` passes, confirming no duplicate declaration/export conflict.

Verification:
- `npm run types`
- `npm test -- tests/wallet-mappers.test.ts` (19 passed)
