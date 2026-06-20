## Findings

### LOW - shipped worker bundle still contains the old global-reading InterestCalculator

public/workers/wallet-sync.bundle.js:2069 - The committed worker artifact still bundles `lib/wallet-core/Interest.ts` with `config.depositHeightV3 || ...`, `config.depositRateV3[i] || ...`, `config.investmentMq || ...`, weekly fallback reads, and the removed `logDebugMsg` call at public/workers/wallet-sync.bundle.js:2082, public/workers/wallet-sync.bundle.js:2102, public/workers/wallet-sync.bundle.js:2104, public/workers/wallet-sync.bundle.js:2145, and public/workers/wallet-sync.bundle.js:2156. The worker is loaded from `public/workers/wallet-sync-entrypoint.js` at public/workers/wallet-sync-entrypoint.js:16, so a checkout that serves the tracked public assets without regenerating them still runs the pre-decoupling interest code in sync parsing. Fix: run `npm run build:sync-worker` after the source move and include the regenerated `public/workers/wallet-sync.bundle.js`, or remove the tracked generated artifact from the shipped path.

## Checked Clean

lib/deposits/interest.ts:15 - `COIN_UNIT_PLACES` and `DEPOSIT_RATE_V3` come from typed config; lib/config/config.ts:11 pins `COIN_UNIT_PLACES` to the scalar value, and lib/config/config.ts:21 pins `DEPOSIT_RATE_V3` to `[0.029, 0.039, 0.049]`. None of the three elements is falsy, so dropping the old `|| 0.029/0.039/0.049` fallbacks does not change current effective V3 rates.

lib/deposits/interest.ts:24 - `DEPOSIT_HEIGHT_V3_DEFAULT = 413400` matches the old fallback in `/tmp/decouple-interest.diff`; public/config.js:75 provides only `depositRateV3` and does not provide `depositHeightV3`, so the old effective runtime value was also 413400.

lib/deposits/interest.ts:25 - `INVESTMENT_MQ = 1.4473` matches the old `config.investmentMq || 1.4473`; public/config.js has no `investmentMq`, so the old effective runtime value was also 1.4473.

lib/deposits/interest.ts:26 - `WEEKLY_BASE_INTEREST = 0.0696` and lib/deposits/interest.ts:27 `WEEKLY_INTEREST_INCREMENT = 0.0002` match the old weekly fallbacks; public/config.js has neither key, so the old effective runtime values were the same.

lib/deposits/interest.ts:103 and lib/deposits/interest.ts:142 - `Math.pow(10, config.coinUnitPlaces)` became `10 ** COIN_UNIT_PLACES`; with `COIN_UNIT_PLACES = 6`, this is numerically identical in V8.

lib/deposits/interest.ts:169 - `Math.pow(1.0 + mq / 100.0, termQuarters)` became `(1.0 + mq / 100.0) ** termQuarters`; both operands are finite numbers and the exponent is the same term-derived numeric value, so the quarterly investment formula is unchanged.

lib/deposits/interest.ts:58 - V1, V3, V2-investment, V2-weekly routing and all `Math.floor`/BigInt truncation sites match the deleted implementation in `/tmp/decouple-interest.diff`; the only source-level removal is the V1 `logDebugMsg("Warning: Using legacy V1 interest calculation")`, which only logs when `config.debug` is true and never participates in the returned number.

tests/interest.test.ts:87 - Golden-master tests cover V3 tier thresholds/month cap/boundary, V2 investment, V2 weekly, and the existing V1 fallback tests remain in tests/interest.test.ts:11. Focused verification passed with `npm test -- tests/interest.test.ts` (10 tests).
