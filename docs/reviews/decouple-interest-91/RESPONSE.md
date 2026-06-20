# #91 — de-globalize + relocate InterestCalculator — review response

Final UI-decoupling slice of #91: moves `InterestCalculator` (deposit interest math) off
`lib/wallet-core` into a neutral `lib/deposits/interest.ts` and removes its global-`config`
dependency. FINANCIAL code — pinned by a golden-master test. Reviewers: Codex, CodeRabbit.
GLM unavailable (opencode hang).

## Why it's safe (golden master + value equivalence)

1. **Golden master FIRST:** 16 outputs of `calculateInterest` captured against the UNCHANGED
   `Interest.ts` (real-mode config stub) across every routing branch — V3 (3 rate tiers, term
   cap, boundary), V2-investment (q-tiers), V2-weekly, plus the 4 pre-existing V1 cases.
   After the refactor, **every number is identical** (no expected value adjusted). 520 tests pass.
2. **Value equivalence:** the global reads were replaced by their CURRENT EFFECTIVE values —
   `public/config.js` only ever set `coinUnitPlaces:6` + `depositRateV3:[0.029,0.039,0.049]`
   (both now from typed `@/lib/config/config`); it NEVER set `investmentMq`/`weeklyBaseInterest`/
   `weeklyInterestIncrement`/`depositHeightV3`, so both real and mock already used the hardcoded
   defaults (1.4473 / 0.0696 / 0.0002 / 413400), now named consts. Dropping `depositRateV3[i] ||
   0.029` is safe because no element is 0.
3. **Math unchanged:** V3/V2 formulas diff byte-identical vs the deleted original (verified);
   `Math.pow(10,x)→10**x` is identical for these integer exponents (golden master confirms).

## Independent verification (orchestrator)

- New module: zero global `config`/`window`/`globalThis` reads, no `@/lib/wallet-core` import
  (sole import: `COIN_UNIT_PLACES`, `DEPOSIT_RATE_V3` from config).
- No `app`/`components`/`lib` file imports `InterestCalculator` from wallet-core any more; the
  dialog's `legacy-interest-config` side-effect import is removed (that polyfill is now unused).
- `lib/wallet-core/Interest.ts` re-exports for the 2 in-engine consumers (TransactionsExplorer,
  wallet-operations).
- Gate: types ✓, lint ✓ (0/0), interest 10 (22 assertions) ✓, full 520 unit ✓, shell e2e 8/8.

## Codex (gpt-5.5)

One LOW: the tracked worker artifact `public/workers/wallet-sync.bundle.js` still bundled the OLD global-reading InterestCalculator (the source moved; the generated bundle was stale). **Fixed** — regenerated via `npm run build:sync-worker` (old `config.*` interest reads now gone from the bundle). Interest is not computed during sync, so behavior impact was nil regardless. Codex confirmed clean: value equivalence (rate array non-zero, the 4 defaults match the prior effective values), Math.pow→** identical, V1/V3/V2 routing + Math.floor/BigInt truncation byte-identical, golden-master coverage, logDebugMsg is debug-only.

## CodeRabbit

`coderabbit review --plain -t all --base main` -> **No findings.**

## Scope — UI now fully decoupled from wallet-core

With this + #129 / #130 / #145, **no UI or service file imports `lib/wallet-core`** for
transaction classification, payment URIs, message threading, or interest. The remaining #91
work is the engine deletion itself (`lib/wallet-core`, `lib/services/real/`, the
`NEXT_PUBLIC_WALLET_ENGINE` fallback) — gated on the SDK-readiness product decision.
