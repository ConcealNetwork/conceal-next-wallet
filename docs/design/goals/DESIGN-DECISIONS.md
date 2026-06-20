# Goals — design decisions (#149)

> Phase 2 (design) of the multi-agent workflow. Per the `/goal` autonomous directive,
> the orchestrator (Opus) **picked** the direction rather than stopping for sign-off.
> Variants live in `docs/design/goals/agents/`; combined view in `review.html`.

## Variants explored

| Variant | Author | Direction | Outcome |
|---|---|---|---|
| `calm.html` | Opus 4.8 | **Calm tracker** — ring-forward, max continuity with the Deposits page, low chrome, restrained | ✅ **Chosen base** |
| `momentum.html` | Opus 4.8 | Momentum / pace-coach — pace read as the hero, expected-pace markers, sparkline, coach-dashboard rail | Runner-up (graft one idea) |
| `glm.html` | GLM-5.2 | — | ✗ not delivered (opencode stalled — known issue, see memory) |

## Decision: **Calm tracker**, with one graft from Momentum

**Why calm wins.** It is the most spec-aligned (§5: a progress-**ring**-anchored card, restrained
achieved state, "hold the line on gamified slop") and the most on-brand — it reuses the Deposits
`ProgressRing`, `wallet-card`, and rail composition verbatim, so Goals reads as a native part of the
Earn section rather than a new visual language. The ring is coloured by the goal's own token (not by
status), keeping each card calm; status lives in a single pill + bar. Behind = amber, never red.
Achieved = a quiet green check, no confetti/streaks/sound.

**The one graft from Momentum:** the **expected-pace marker on the progress bar** plus a small
`Logged X% · Expected Y%` micro-legend. This is the only Momentum element that adds genuine clarity
without gamified noise — it's a direct visual of spec §6's linear-plan on-track test, making
"on track / behind" self-explanatory at a glance. It will be **subtle** (a thin tick on the bar +
muted legend), deadline-goals only, reduced-motion safe.

**Rejected from Momentum** (too heavy / off-spec for MVP):
- The dominant "pace-hero" block (a big `~96 CCX/week` headline per card) — it demotes the ring and
  reads as a coach app; spec wants the ring as the anchor.
- "You're ahead by 84 CCX / behind by ~1,440" deltas everywhere — coach-y, and amber-pill + suggested
  rate already convey it.
- Per-card cumulative-saved **sparkline** — spec marks the projection chart **P1 polish**, not MVP.
- The rail reframed as a "PACE CHECK" dashboard — calm's rail (Overall → Next milestone → Soonest
  deadline) is more restrained and matches the spec's "single classy nudge"; the on-track/behind
  count folds into Overall.

## Per-element decisions (implementation contract)

- **Page** — `PageHeader` ("Goals" + honest subline) → empty state with the framing line
  *"Goals are a personal tracker — they never move or lock your CCX."* in a lock chip → active grid
  (`@container`: 1 → `@3xl:2` → `@5xl:3`, matching Deposits) → achieved (dimmed, in Active) →
  archived behind a disclosure.
- **Card** — token-coloured `ProgressRing` + Lucide icon + name + overflow menu; target/deadline
  subline; `saved / target` (mono) + `remaining` + `≈ $USD` subline; linear progress bar **with the
  expected-pace tick** (deadline goals); status pill (`Not started` / `On track ·~X/wk` green /
  `Behind ·~X/wk to catch up` amber / `Due soon` amber / `Past deadline` muted / `Goal met` green);
  `+ Add` · `Edit`; collapsible recent-contributions trail.
- **Add/Edit dialog** — single step: Name, Target (CCX), Deadline (optional, today-or-future), Lucide
  icon picker, GoalColor swatch row (`amber/incoming/deposit/violet/rose/sky/slate`), live preview
  line.
- **Log-contribution dialog** — Amount, Date (default now, backdate ok), Note; muted helper
  *"This records money you've set aside — it doesn't move any CCX."* (English, consequence-adjacent).
  Positive-only (reduce via edit/delete).
- **Achieved** — one-shot: ring sweep + checkmark + small badge; reduced-motion → just the green
  state. No confetti/sound/streaks.
- **Rail** (`GoalsRail`) — Overall (total saved/target, blended %, on-track vs behind count, ≈USD) →
  Next milestone (goal closest to done, mini ring) → Soonest deadline (days left + pill) →
  `RailMarketSection`; `embedded` `min-[1200px]:hidden` body fallback.
- **Colour mapping** — GoalColor tokens map to existing theme vars
  (`amber`→`--primary`, `incoming`/`deposit`→`--wallet-*`, plus `violet/rose/sky/slate`).
