# #91 — decouple UI mappers from wallet-core — review response

Contained slice of #91: moves the 4 UI-facing transaction-classification functions
out of `lib/wallet-core/mappers.ts` into a neutral `lib/ui/transaction-kind.ts` so the
UI/services no longer import the engine for these. Reviewers: CodeRabbit, Codex. GLM
omitted (opencode review-size hang, as all session).

## Independent verification (orchestrator)

- The moved functions in `lib/ui/transaction-kind.ts` are byte-identical to the originals
  (same signatures, JSDoc, constants) — diffed line-by-line.
- New module imports ONLY `@/lib/config/config` + `@/lib/types` — no `@/lib/wallet-core`.
- No `app`/`components`/`lib/ui` file imports the 4 names from `@/lib/wallet-core/mappers`
  any more — UI fully decoupled for these.
- Gate: types ✓, lint ✓ (0 warnings), 514 unit ✓, e2e (shell-redesign + tx-notes) 9 ✓.

## Codex (gpt-5.5)

**No real issues.** Confirmed: behavior preservation (identical logic + constants),
no circular import (new module one-way; `lib/types` is type-only), no missed callers
(5 importers + `tests/wallet-mappers.test.ts` repointed; remaining mappers imports don't
touch the 4 names), `mappers.ts` import hygiene (`MESSAGE_TX_AMOUNT_ATOMIC` still used at
:115; internal use of `isSentMessageAmount`/`isUiMessageOut`), and the re-export + internal
import from the same source compiles cleanly (no duplicate-declaration conflict).

## CodeRabbit

`coderabbit review --plain -t all --base main` → **No findings.**

## Scope

This is a PREREQUISITE for #91, not the removal itself. `lib/wallet-core` still exists
and still re-exports the 4 names for back-compat; the engine, the `NEXT_PUBLIC_WALLET_ENGINE`
flag, and `lib/services/real/` are untouched. Removing them is later #91 work.
