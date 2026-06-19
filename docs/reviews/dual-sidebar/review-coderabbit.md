# CodeRabbit — #122 stage 2 review

Run: `coderabbit review --plain -t all --base main` (free CLI allowance).

## Findings

### 1. `right-rail.tsx:103` — "`focus-visible:outline-hidden` is not a valid Tailwind class" — minor

**Verdict: REJECTED (false positive — Tailwind v3 vs v4).**

This repo runs Tailwind **v4.3.1**. In v4, `outline-hidden` IS the valid utility (it
reproduces v3's old `outline-none` behaviour: removes the visible outline while keeping a
transparent one for forced-colors mode). v4's `outline-none` now means `outline-style: none`.
CodeRabbit is applying stale v3 knowledge.

Evidence: `outline-hidden` is used 59× across the codebase (the entire `components/ui`
shadcn kit), `focus-visible:outline-none` 0×. Changing it would break the established
convention. No change.

No other findings.
