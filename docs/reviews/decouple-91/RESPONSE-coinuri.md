# #91 — relocate CoinUri off wallet-core — review response

Moves the `CoinUri` payment-URI utility from `lib/wallet-core/CoinUri.ts` to a neutral
`lib/ui/coin-uri.ts`, cleaning its legacy lint warnings with no behaviour change.
Reviewers: CodeRabbit, Codex. GLM omitted (opencode review-size hang).

## Independent verification (orchestrator)

- New module imports ONLY `COIN_URI_PREFIX` from `@/lib/config/config` — no engine.
- Object-literal conversion safe: `grep` shows 0 `this.` (methods self-reference via
  `CoinUri.*`, resolved at call time). Static fields preserved.
- encodeTx template literals are guarded by `!== null` → identical output.
- 38 round-trip tests (coin-uri 14 + payment-link + parse-scanned) pass; full 514 suite
  + receive-qr/send-safety e2e green.

## Codex (gpt-5.5)

**No real issues.** Verified: object-literal extraction (no `this`), `DecodedTxUri`/
`DecodedWalletUri` exactly match the old inline shapes, encoder strings preserved (incl.
the `height: number | null` null-omit), bare-string throws/prefixes/edge-cases unchanged,
and the shim keeps engine-internal `./CoinUri` callers working.

## CodeRabbit

One finding (major): the back-compat shim still carried `// @ts-nocheck` from the legacy
file — unnecessary on a one-line re-export of a fully-typed module, and it masks errors.
**Fixed** — removed it; `npm run types` still passes.

## Scope

Prerequisite for #91. `CoinUri` is now engine-free; remaining UI→wallet-core couplings:
`InterestCalculator` (1 importer) and two message mappers (`conversations.ts`). The engine
itself + the `NEXT_PUBLIC_WALLET_ENGINE` flag removal remain later #91 work.
