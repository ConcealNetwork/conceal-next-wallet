# Legacy V1 deposit-interest constants — review notes

Small, focused fix: the legacy V1 path in `lib/wallet-core/Interest.ts` shipped with placeholder constants (`END_MULTIPLIER_BLOCK = 1000000`, `MULTIPLIER_FACTOR = 3`, divisor `DEPOSIT_MAX_TERM_V1`). Replaced with the authoritative values read directly from the Conceal C++ daemon via `opensrc` (`ConcealNetwork/conceal-core@master`).

## Source of truth (conceal-core)

- `src/CryptoNoteConfig.h:85-86` — `MULTIPLIER_FACTOR = 100`, `END_MULTIPLIER_BLOCK = 12750`.
- `src/CryptoNoteConfig.h` + `src/CryptoNoteCore/Currency.cpp:1371` — `m_depositMaxTerm` is built from `DEPOSIT_MAX_TERM` (`1*12*21900 = 262800`, one year), **not** the five-year `DEPOSIT_MAX_TERM_V1` (which only bounds the term in validation at `Currency.cpp:1307`).
- `src/CryptoNoteCore/Currency.cpp:268-289` — `a = term*4`; `c = div128_32(amount*a, 100*m_depositMaxTerm)` (128-bit multiply, **truncating** divide); `if (lockHeight <= END_MULTIPLIER_BLOCK) interest = c * MULTIPLIER_FACTOR`.

## Changes

1. The two named constants → `12750` / `100`.
2. Divisor → `DEPOSIT_MAX_TERM` (262800).
3. **Integer semantics:** truncate the divide *before* the multiplier (the daemon's `div128_32` runs first), and use `BigInt` for `amount*a` — that product can exceed `Number.MAX_SAFE_INTEGER` (≈9.007e15) for large deposits, where float division diverges from the exact result by up to `MULTIPLIER_FACTOR` atomic units.
4. Tests (`tests/interest.test.ts`, none existed before) pin the V1 path to the C++ semantics: multiplier window boundary (≤12750), truncate-before-multiply, and a large-deposit case (90M CCX, term 1,200,002) where float floors to `…819` while BigInt gives the correct `…818`.

## Reachability

This V1 branch is a documented fallback: every real Conceal deposit term is a multiple of 5040 / 21900 / 64800, so the daemon (and this port) routes to V2/V3 and never hits V1 in practice. The fix makes the port bit-exact regardless.

## Review

- **CodeRabbit** — no findings (reviewed the final BigInt version).
- **GLM-5.2** — third-opinion pass; if it surfaces anything it's noted on the PR.
- **Codex** — out of credits this run.
- **Self-cross-check** — each constant and the arithmetic ordering verified line-by-line against the `conceal-core` source cited above.

## Verification

`npm run types && npm run lint && npm test` (253 unit, +4 interest) green; `NEXT_PUBLIC_USE_MOCK=false npm run build` clean.
