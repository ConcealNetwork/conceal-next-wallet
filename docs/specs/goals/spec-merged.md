# Goals — merged spec (orchestrator synthesis)

> Synthesized by the Opus main thread from **4** independent specs: **Gemini 3.1 Pro**,
> **GLM-4.6**, **Opus 4.8**, **Codex (gpt-5.5)**. Provenance noted inline as _(G)_, _(GLM)_,
> _(O)_, _(C)_. Forks are resolved with a stated reason. The agent specs live in
> `docs/specs/goals/agents/`.
>
> _Codex's spec arrived after the first synthesis (reviewer back online 2026-06-21) and
> sharpened several points — grafted below: a **status-precedence enum**, a **pace buffer +
> linear on-track plan**, a **`due-soon`** state, **reject-negative-contributions** (edit/delete
> instead), **IndexedDB** (now 3/4 agree), **"Logged" aggregate terminology**, **reopen-on-edit**,
> and **panic-wipe / wallet-delete cleanup**._

---

## 0. Consensus (all four agreed)

- **Savings model = manual-contribution ledger** ("virtual envelope" / piggy-bank). A goal
  is a **tracker, never a vault** — the wallet never auto-moves or locks CCX. Progress =
  what the user *logged*, not their live balance. _(O, G, GLM, C all independently.)_
- **Balance-linked (live) is rejected** _(all four)_ — on a shared-pool self-custody wallet
  it lies and regresses when you spend normally; it implies custody semantics the wallet
  cannot enforce _(C)_.
- **Deposit-backed is the flagship "Later"** — a time-locked Deposit is the real envelope
  (principal + interest = honest "saved", maturity ↔ deadline). Deferred from MVP because it
  couples to the deposit service surface + needs richer SDK deposit identity, and "starting
  there turns Goals into a deposit product instead of a general savings tracker" _(C)_.
- **Device-local, keyed per wallet.** No service-spine (pure local metadata, identical mock
  & real → routing it through the 8 services would just duplicate the store code).
- **Storage = IndexedDB** _(C, G, GLM — 3/4; resolves the Opus open question)_. Use the
  `lib/storage/*` guarded-IndexedDB pattern (same as tx-notes); never touch IndexedDB at
  module init; corrupt/invalid records skipped per-item, not fatal.
- **Lives in the Earn nav group** (Deposits / **Goals** / Market / Insights).
- **Progress**: `saved = Σ contributions`, `progressPct = clamp(saved/target·100, 0, 100)`,
  `remaining = max(target − saved, 0)` — atomic-unit integer math.
- **On-track** computed purely from logged data, no movement; `due-soon` + `deadline-passed`
  are distinct states; **status has a strict precedence order** _(C, §6)_.
- Goal card with a **progress ring** (reuse the Deposits `ProgressRing` SVG), add/edit form,
  **"Log contribution"** modal (never bare "Contribute" _(C)_), restrained **achieved**
  state (reduced-motion safe), and a **Goals right rail**.

---

## 1. Product summary

**Goals** lets a user name a savings target ("New laptop — 5,000 CCX by Dec 2026",
"Emergency fund — 20,000 CCX") and watch their CCX climb toward it, in the **Earn** section.
It's a personal tracker: the user **logs contributions** ("I set aside 500 CCX today") into a
device-local ledger; the wallet shows progress, remaining, and — when a deadline is set — an
honest on-track/behind read with a suggested weekly amount. **Nothing moves CCX
automatically.** The headline future upgrade is funding a goal with a real **Deposit**.

---

## 2. Savings model decision (the key fork)

**MVP = manual-contribution ledger.** _(O/G/GLM unanimous.)_ Rationale (sharpest from _O_):

- **Balance-linked rejected:** Available balance is one shared pool; apportioning it across
  goals is a fiction, and every normal spend makes goals regress with no user action toward
  them. Fails multi-wallet + view-only. Wrong primitive.
- **Deposit-backed deferred:** best model, but couples to deposit create/withdraw/maturity +
  view-only/pending states, deposit terms are rigid (can't top-up a lock), and reliable
  linking wants the SDK engine's richer deposit identity. Ship manual first → Goals exists,
  proves UX, localizes, with zero new service surface.
- **Manual is honest + complete:** a logged contribution is a fact the user asserts; never
  regresses behind their back; trivially correct multi-wallet/view-only; maps onto the exact
  device-local pattern Check-ins/Reminders use.

**Grounding touch (from _G_, adopted as P1, non-blocking):** an **over-allocation hint** — if
Σ saved across active goals exceeds the wallet's actual balance (Available + Locked), show a
gentle amber banner ("Your goals total more than your wallet balance"). Never blocks, never
auto-reconciles — keeps the virtual ledger honest without live-linking. _(O flagged this as
an open question; G specced it; resolved → include as a P1 hint.)_

---

## 3. User stories (prioritized)

**P0 (MVP)** — create a goal (name, target, optional deadline/icon/colour); log a
contribution; see progress (ring, %, saved, remaining); on-track read + suggested weekly
amount for deadline goals; edit/delete goal + edit/delete/undo a contribution; celebrate on
achieve; per-wallet separation; full i18n.

**P1 (fast-follow)** — over-allocation hint; "remind me to save" → Reminders nudge (never
auto-send); archive goals; overall progress in the rail; optional USD subline; no-deadline
soft ETA.

**P2 (flagship later)** — fund a goal by opening a **Deposit**; linked deposit's principal +
interest counts toward the goal; maturity shown vs deadline.

---

## 4. Data model _(Opus's, adopted — atomic-string money + ledger)_

```ts
// lib/goals/goal.ts  — neutral UI module, NO wallet-core import

export interface GoalContribution {
  id: string;                 // crypto.randomUUID()
  amount: string;             // atomic-unit string (+ set aside / − take back out)
  at: string;                 // ISO timestamp
  note?: string;              // optional, ≤ 80 chars, sanitized
  source: "manual" | "snapshot" | "deposit";  // "deposit" reserved for P2
  depositId?: string;         // P2 only
}

export type GoalStatus = "active" | "achieved" | "archived";

export interface Goal {
  id: string;                 // crypto.randomUUID()
  name: string;               // 1–60 chars, trimmed, sanitized
  target: string;             // atomic-unit string, > 0
  deadline?: string;          // optional ISO date (date-only)
  icon?: GoalIcon;            // Lucide icon key from a fixed subset (see §5) — (G)
  color?: GoalColor;          // fixed palette token, not free hex
  contributions: GoalContribution[];
  status: GoalStatus;
  createdAt: string;
  achievedAt?: string;        // set once; gates one-shot celebration
  linkedDepositIds?: string[];// P2
}

export type GoalColor = "amber" | "incoming" | "deposit" | "violet" | "rose" | "sky" | "slate";
```

- **Money as atomic-unit strings** _(O)_ — CCX is 6dp; float math drifts. Convert with
  `ccxToNumber`/`formatCcx` only at the display edge, like Deposits/Send.
- **A ledger, not a single `saved` number** _(O)_ — gives undo/correct, an activity trail,
  a P2 slot for deposit entries, and trivial recompute. Derived values (`saved`,
  `progressPct`, `remaining`, on-track, suggested rate) are **never stored** — pure functions
  in `lib/goals/progress.ts`.
- **Icon over emoji** _(fork: G's Lucide icon picker chosen over O's emoji)_ — a fixed Lucide
  subset (Target, Laptop, Home, Car, Plane, PiggyBank, GraduationCap, Gift, Heart, …) is
  cleaner, on-brand with the design system, and dodges emoji/IME headaches O flagged. Emoji
  support can come later.

### Storage & keying — **per wallet** _(O's deliberate upgrade)_

`lib/storage/goals-store.ts`, **IndexedDB** (the `lib/storage/*` guarded pattern, same as
tx-notes — _resolved: C/G/GLM all chose IndexedDB_). Guard for no-storage/SSR/static-export →
disable writes + storage-unavailable UI; **never touch IndexedDB at module init** _(C)_; JSON;
per-item type guard `isGoal`; corrupt/invalid-amount records skipped per-item, not fatal _(C)_;
immutable save/remove/update; **no `wallet-core` import**.

Keyed **per wallet** from day one (the brief requires it; goals are wallet-specific):

```
ccx-goals:<walletId>      // e.g. "ccx-goals:default", "ccx-goals:<uuid>"
```

`walletId` from `getActiveWalletId()` (`lib/auth/active-wallet-id.ts`) — resolves the SDK
active id; mock + legacy resolve to `DEFAULT_WALLET_ID` ("default") without pulling the
engine (same back-compat as the passkey store). Because that resolver is **async** and the
store should stay **sync/pure/testable**, the store takes `walletId` as a param and a thin
`useGoals()` hook resolves the id once and feeds it in:

```ts
listGoals(walletId): Goal[]
saveGoal(walletId, goal): Goal[]      // upsert by id
removeGoal(walletId, id): Goal[]
updateGoal(walletId, id, patch): Goal[]
```

> **Open item (O):** Check-ins/Reminders today use a *single global* key (latent multi-wallet
> bug). Goals is the first per-wallet local store. Optional cheap follow-up: migrate the
> siblings to the same scheme. Out of scope for Goals.

---

## 5. UX

- **Route/nav:** `app/(wallet)/wallet/goals/page.tsx` (client). Add to the **Earn** group in
  `sidebar.tsx` between Deposits and Insights: `{ href:"/wallet/goals", labelKey:"nav.goals",
  icon: Target, canCreate: true }` — the `+` deep-links `?new=1` → create dialog (like
  Deposits/Address-Book).
- **Page states:** Empty (honest framing line: _"Goals are a personal tracker — they never
  move or lock your CCX."_) → grid of goal cards (container-query responsive `1 → @3xl:2 →
  @5xl:3`, matching the deposits grid) sorted active(nearest deadline, then highest progress)
  → achieved (dimmed) → archived behind a disclosure.
- **Goal card anatomy:** progress **ring** (reuse deposits `ProgressRing`, colour = goal token,
  green when achieved) + icon + name + overflow menu; target/deadline subline; **saved /
  remaining** (mono, optional `≈ $USD` subline via `usdSubline`); linear progress bar; a
  **status pill** for deadline goals (`On track` green / `Behind` **amber, never red** / `Met`
  green / past-deadline muted) with the suggested weekly amount; a collapsible recent-
  contributions trail. Actions: `+ Add` · `Edit`.
- **Add/Edit dialog** (single-step — a goal spends nothing, so no two-step confirm like
  Deposits): Name, Target (CCX), Deadline (optional, today-or-future), Icon picker (Lucide
  subset), Colour swatch. Live preview line ("Target 5,000 CCX · by 31 Dec 2026 · ~96
  CCX/week from today").
- **Contribute dialog:** Amount (± with a "withdraw from goal" toggle to flip sign), Note
  (optional), Date (defaults now, backdate allowed). Muted helper: _"This records money
  you've set aside — it doesn't move any CCX."_ (English; consequence-adjacent clarity.) On
  submit → append contribution, recompute, toast; if it first reaches target → set
  `achievedAt`, status `achieved`, fire the **one-shot tasteful celebration** (single ring
  sweep + checkmark + badge; reduced-motion → just the green state; **no confetti storm /
  sound / streaks** — hold the line on gamified slop, per O).
- **Right rail** (`usePageRightRail(<GoalsRail/>)`): Overall (total saved/target, blended %,
  on-track vs behind count), **Next milestone** (goal closest to completion, mini ring — the
  single classy nudge), Soonest deadline (days left), reuse `RailMarketSection`, with the
  `<GoalsRail embedded/>` `min-[1200px]:hidden` body fallback.

---

## 6. Progress + projection _(Codex's linear-plan + buffer adopted over the rate-comparison)_

Pure fns in `lib/goals/progress.ts` (no React/engine; unit-tested; **atomic-unit integer math**):

```
saved           = Σ contributions.amount
progressPct     = saved / target · 100
visualPct       = clamp(progressPct, 0, 100)                  // ring clamps; overage shown as text
remaining       = max(target − saved, 0)
overage         = max(saved − target, 0)
```

**Pace (deadline goals only),** UTC day boundaries _(C)_:
```
daysLeft        = floor((deadline − today) / 1d)
requiredPerDay  = ceil(remaining / max(daysLeft, 1))
requiredPerWeek = requiredPerDay · 7
show weekly pace when daysLeft ≤ 60, else monthly (≈ requiredPerDay · 30.4375)
```

**On-track = linear plan from createdAt→deadline, with a buffer** _(fork: C's linear plan
chosen over O/G/GLM's observed-vs-required rate — more explainable + testable, and the buffer
kills the day-old-goal "behind" noise more cleanly than flooring elapsed at 1 week):_
```
totalPlanDays  = max(daysBetween(createdAt, deadline), 1)
elapsedDays    = clamp(daysBetween(createdAt, today), 0, totalPlanDays)
expectedSaved  = floor(target · elapsedDays / totalPlanDays)
buffer         = max(floor(target · 0.02), 1 CCX)            // 2% or 1 CCX, whichever larger
onTrack        = saved + buffer ≥ expectedSaved
```

**Status (strict precedence, highest wins)** _(C)_:
```
archived > achieved > deadline-passed > behind > due-soon > on-track > not-started
  achieved        = saved ≥ target
  deadlinePassed  = daysLeft < 0 && !achieved
  dueSoon         = 0 ≤ daysLeft ≤ 14 && !achieved          // amber, distinct from behind
  behind          = !onTrack (deadline goals)
  notStarted      = saved == 0
```
No deadline → no on-track/behind/due-soon (an aspiration, not a commitment); show progress +
remaining only, plus an optional soft ETA `remaining / observedPerWeek` ("~14 weeks at your
pace", P1). One next-step line per card (Codex's strings): _"Log a first contribution" /
"Remaining: X CCX" / "Keep roughly X CCX/week" / "Needs X CCX/week" / "Target reached" /
"Edit deadline or archive"_. Projection area chart is **P1 polish**, not MVP.

---

## 7. Edge cases _(union of all four; Opus's table base + Codex's lifecycle additions)_

| Case | Resolution |
|---|---|
| Target reached | First `saved ≥ target` → set `achievedAt` once (idempotent), status `achieved`, stays in Active tab with a check + restrained success styling, offers Archive / Keep tracking _(C)_. |
| Target exceeded | Clamp ring to 100%; show overage as text ("Over by N CCX"). Ledger uncapped. |
| **Reopen-on-edit** _(C)_ | If editing/deleting contributions drops `saved` below target, **reopen as `active`** + toast "reopened — logged progress is below target". (Open Q: whether to clear `achievedAt`.) |
| Deadline passed, unmet | Stays `active`; pill "Past deadline" (**muted/amber, never red** — O); no auto-archive/nag; inline "Extend deadline" + "Log" + "Archive". |
| Goal deleted | Confirm dialog; removes goal + its ledger only. **No CCX affected** — copy says so. (P2: deleting a deposit-linked goal never touches the deposit.) |
| Contribution mistake | **Reject negative contributions in MVP** _(fork: C over O/G — no "withdraw from goal" label; reduce progress by editing/deleting entries instead, cleaner mental model)_. Edit/delete `GoalContribution` by id (immutable). Negative *adjustment entries* are a Later item. |
| Multi-wallet | Per-wallet keyed (`ccx-goals:<walletId>`); show only the active wallet's goals; never merge. |
| Wallet id unresolved | **Block writes + storage/session error state** _(C)_ — don't silently write to a wrong/empty key. |
| View-only wallet | Fully usable for MVP (manual ledger = no spend). Only spend/deposit CTAs + the P2 "Fund with a deposit" action are `viewOnly`-gated. |
| Over-allocation / drift | _(G + C)_ Σ logged (non-archived) > Available + Withdrawable → gentle **amber hint** (in the rail's Balance-context section), non-blocking, **never auto-corrects progress**. |
| **Panic-wipe / wallet-delete** _(C)_ | Goals for that wallet id are cleared alongside other local metadata (wire into the existing panic-wipe + delete-wallet cleanup hooks). |
| **Backups** _(C)_ | Goals are NOT included in wallet backups unless the user explicitly exports local metadata; never written to chain/tx metadata. |
| **Multi-tab** _(C)_ | Last write wins for MVP (no cross-tab sync). |
| CCX 6dp | Atomic-unit integer storage/arithmetic; `formatCcx` at display edge; inputs parsed via the send/deposit helper (reject NaN/negative/over-precision; allow down to 0.000001). |
| Optional USD | `≈ $X` via `usdSubline(ccx, marketPrice)`; derived at render; hidden if price unavailable; never a stored USD target; price moves never change CCX progress. |
| Spending elsewhere | Zero effect on progress (manual model) — by design; the drift hint is the only balance touchpoint. |
| No storage / SSR / corrupt record | Storage-unavailable UI + disable writes; never touch IDB at module init; corrupt/invalid-amount records skipped per-item (`isGoal`), not fatal. |
| Name/note injection | React escapes; also trim + length-cap (name ≤60, note ≤120) + strip control chars on save. |
| Clock skew | Projections use local device time; `daysForPace = max(daysLeft, 1)` + clamped elapsed so pace can't go ∞/negative. |

---

## 8. MVP vs Later

**MVP** — `lib/goals/{goal.ts,progress.ts}` + `isGoal`; per-wallet IndexedDB `goals-store.ts`;
`useGoals()`; Goals page in Earn (`Target` icon, `+` deep-link); empty state; goal cards
(ring/name/icon/colour, target/deadline, logged/remaining ±USD, progress bar, status pill,
one next-step line); Active/Archived segmented view; create/edit dialog w/ live preview;
**"Log contribution"** dialog (amount / date / note — positive only); achieved (restrained,
reduced-motion safe) + reopen-on-edit; edit/delete goal + contributions; archive/restore;
`GoalsRail` (summary / balance-context+drift / focus-goal / earn-action / market + embedded
fallback); deadline pace (linear-plan on-track + buffer, due-soon, precedence); per-wallet
keying; view-only usable; panic-wipe/delete cleanup; 6dp/atomic money; i18n `goals.*` +
`nav.goals` across **all 10** locales (consequence copy English); unit tests (atomic parser,
`progress.ts`, status precedence, store guards/immutability) + one e2e (`e2e/goals.spec.ts`:
create → log → progress → achieve → archive → wallet-switch scoping, forced-mock).

**Later** — P2 deposit-linking (flagship); over-allocation hint (P1); "remind me to save"
Reminders nudge (P1); projection area chart + no-deadline ETA; Insights-suggested rate;
one-tap "snapshot current available"; overall USD + an Account summary widget; export/share
a goal.

---

## 9. Open questions / risks (for sign-off before implement)

1. ~~Storage mechanism~~ **Resolved → IndexedDB** (C/G/GLM); confirm the exact DB home (new
   `ccx-wallet-local-metadata` DB vs extending an existing local-metadata IDB — C's open Q).
2. **First per-wallet local store** — accept the new keying convention (and optionally migrate
   check-ins/reminders later)? Plus: wire goal cleanup into panic-wipe + delete-wallet hooks.
2b. ~~Negative/withdraw contributions~~ **Resolved → rejected in MVP** (C); reduce progress by
   edit/delete, negative adjustment entries are Later. Confirm.
3. **Behind = amber, never red** — confirm (red is reserved for irreversible-spend warnings).
4. **Celebration tastefulness** — single ring sweep + checkmark, reduced-motion gated; hold
   against gamified slop.
5. **Manual honesty** — a user can log "saved" beyond their balance; the over-allocation hint
   (P1) addresses it softly. Confirm hint-not-block.
6. **Icon vs emoji** — MVP ships a Lucide icon picker (chosen); emoji deferred. OK?
7. **i18n budget** — target ~40–60 `goals.*` keys; lean on shared keys. Acceptable?
8. **Design phase next** — per the multi-agent workflow, Goals UI goes through `huashu-design`
   (3 variants → review.html → **STOP for your approval**) before implementation.
