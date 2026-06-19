# #122 stage 2 — review response

Pre-PR multi-agent review of the contextual right rail (stage 2). Reviewers:
CodeRabbit (CLI), Codex (gpt-5.5), GLM-5.2.

## CodeRabbit

| # | Finding | Verdict |
|---|---------|---------|
| 1 | `right-rail.tsx:103` — `focus-visible:outline-hidden` "not a valid Tailwind class" | **Rejected — false positive.** Tailwind v4.3.1: `outline-hidden` is the valid utility (v3's old `outline-none` behaviour); v4 `outline-none` = `outline-style: none`. Used 59× repo-wide (the whole `components/ui` kit), `outline-none` 0×. CR applied stale v3 knowledge. |

## Codex (gpt-5.5)

| # | Finding | Verdict |
|---|---------|---------|
| 1 | Rail hidden < 1200px + Market Summary moved out of the body → narrow screens lose the market/holdings summary until stage 3's drawer (HIGH) | **Fixed.** Added a small-screen body fallback: `AccountRail` gained an `embedded` mode (no header/collapse pin), rendered inline below the Transaction Summary inside `min-[1200px]:hidden`. Complementary to the rail's `max-[1199px]:hidden`, so exactly one shows and nothing is lost. New e2e asserts it at 860px. |
| 2 | Old Market card exposed "View Full Market" link, portfolio USD, 24h volume, available/locked % — not carried into the rail (MED) | **Partially fixed; rest by design.** "View full market →" link **added** to the rail Market section (real removed affordance). Portfolio USD and Available/Locked % are already shown in `BalanceHero` (total USD + segmented "ready to spend · 51%" bar) — not lost. 24h volume was **not** in the approved mockup (Market/Holdings/Quick-actions only) and is available on the Market page; adding it would be data not in the design, so omitted. |

Codex confirmed clean: `usePageRightRail` register (no re-render loop / stale rail), context value memoization, unmount cleanup, SSR/static-export safety, accessibility (aside label, named collapse/expand buttons, distinct quick-action aria-labels).

## GLM-5.2

See `review-glm.md`. GLM via opencode `run` **hung with zero output** and was
SIGTERM'd at the 900s timeout (`rc=124`) — the known opencode review-size hang
(the `consult` workaround CLI is not installed here). No findings produced;
treated as no actionable findings (GLM is the advisory/least-capable reviewer,
and CodeRabbit + Codex cover the diff).
