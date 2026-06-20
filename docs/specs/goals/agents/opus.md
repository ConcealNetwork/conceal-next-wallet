# Goals — savings-goal tracker for Conceal Next Wallet

> Opus 4.8 spec. Opinionated. Where I fork from the obvious, I say so and why.

---

## 1. Product summary + savings model

**Goals** lets a user name a savings target ("New laptop — 5,000 CCX by Dec 2026",
"Emergency fund — 20,000 CCX") and watch their CCX climb toward it. It lives in the
left-sidebar **Earn** group alongside Deposits / Market / Insights. A goal is a
*tracker*, never a vault: the wallet shows progress, a remaining amount, and — when a
deadline is set — an honest on-track / behind read with a suggested per-week
contribution. Nothing moves CCX automatically; every contribution is either a number the
user types into a ledger, or an explicit, separately-confirmed action (a Send, a
Deposit) they already control.

### The savings model I chose: **manual-contribution ledger (piggy-bank), MVP** — with **deposit-linking as the headline "Later"**

The brief's four options are (a) manual contributions, (b) balance-linked, (c)
deposit-backed, (d) hybrid. I pick **(a) manual contributions** for the MVP and I am
opinionated that it is the *only* honest, simple, genuinely-useful first cut. Reasoning,
because this is the most consequential fork in the spec:

- **Balance-linked (b) is a trap on a self-custody wallet, and I reject it for MVP.**
  A goal that auto-tracks "a slice of Available balance" looks magical in the demo and
  lies in practice. Available balance is one shared pool. If you have a 5,000-CCX
  "laptop" goal and a 20,000-CCX "emergency fund" goal and 22,000 CCX available, what is
  each goal's progress? Any apportionment is a fiction the user didn't author. Worse: the
  moment they *spend* on anything (groceries, a transfer), every balance-linked goal
  silently regresses — progress bars march backward with no action the user took *toward
  the goal*. That is the opposite of motivating; it punishes normal wallet use. It also
  can't survive multi-wallet (which pool? all of them?) or view-only sensibly. Balance is
  the wrong primitive for "money I'm intentionally setting aside."
- **Deposit-backed (c) is the *best* model but not the *first* model.** Conceal Deposits
  are the real envelope: a time-locked deposit *is* money you genuinely can't casually
  spend, with a maturity date that maps perfectly to a goal deadline, and principal +
  accrued interest is an unambiguous, on-chain-true "saved" number. This is where Goals
  should ultimately shine and it's my flagship Phase 2. But it's not MVP because (i) it
  couples Goals to the deposit service's create/withdraw/maturity surface and its
  view-only and pending-mempool states, (ii) a deposit's term is rigid (you can't top up
  a lock; you'd open *another* deposit per contribution), and (iii) it needs the SDK
  engine's richer deposit identity to link reliably. Shipping (a) first lets Goals exist,
  prove the UX, and localize, with zero new service-spine surface.
- **Manual (a) is honest and complete on its own.** A logged contribution is a fact the
  user asserts ("I set aside 500 CCX today"). It never regresses behind their back, it's
  trivially correct in multi-wallet and view-only, it needs no chain round-trip, and it
  maps onto the exact `localStorage`-guarded device-local pattern Check-ins and Reminders
  already use. It is a ledger, like the rest of the family.

So: **MVP = a per-goal contribution ledger** (add / withdraw bookkeeping entries),
plus progress and a deadline-aware projection. **Phase 2 = deposit-linking** (mark a
deposit as "funding this goal"; principal + interest auto-counts; maturity vs deadline
shown). Optional later: a *read-only, opt-in, per-goal* "snapshot from balance" button
that records a one-off manual contribution sized to current Available — convenience for
the user who really does treat their whole balance as the goal — but it writes a normal
ledger entry, it does not live-track. Balance-linked as a *live* model is intentionally
out of scope, possibly forever.

---

## 2. User stories (prioritized)

**P0 — MVP**

1. As a saver, I want to **create a goal** with a name, a target CCX amount, and an
   optional deadline/icon/colour, so that I have something concrete to save toward.
2. As a saver, I want to **log a contribution** ("set aside 500 CCX") against a goal, so
   that my progress reflects money I've intentionally put away.
3. As a saver, I want to **see progress** — a ring/bar, percentage, amount saved, and
   amount remaining — so I know at a glance how close I am.
4. As a saver with a deadline, I want an **on-track / behind read and a suggested
   weekly amount**, so I know whether my pace will get me there in time.
5. As a saver, I want to **edit or delete** a goal, and **undo / correct a contribution**,
   so that mistakes (wrong amount, fat-fingered target) are fixable.
6. As a saver, I want a goal to **celebrate when I hit it** and move to an *Achieved*
   state, so reaching the target feels like an arrival, not a silently-stalled bar.
7. As a multi-wallet user, I want **each wallet's goals kept separate**, so my personal
   and shared wallets don't bleed into each other.
8. As a non-English user, I want all the neutral UI **in my language**.

**P1 — fast-follow**

9. As a saver, I want an **"add to goal" reminder** (e.g. weekly) that nudges me to log a
   contribution — reusing Reminders, never auto-sending.
10. As a saver, I want to **archive** goals I've paused on, so the active list stays clean.
11. As a saver, I want **overall progress across all goals** in the right rail, so I see
    the forest, not just one tree.
12. As a saver, I want an optional **USD subline** on amounts (via the market price), like
    the rest of the wallet.

**P2 — deposit-linking (the flagship later)**

13. As a saver, I want to **fund a goal by opening a Deposit**, so my goal money is
    genuinely time-locked and earning interest.
14. As a saver, I want a **linked deposit's principal + accrued interest to count** toward
    the goal automatically, and its **maturity shown against my deadline**.

---

## 3. Data model

### The `Goal` type

All amounts are stored as **atomic-unit strings** (the `CcxAmount` convention used across
`lib/types`), never floats — CCX is 6dp and float math on 6-decimal money drifts. The UI
converts with `ccxToNumber` only at the display edge, exactly like Deposits.

```ts
// lib/goals/goal.ts  (neutral UI module — NO wallet-core import)

/** A logged movement of CCX into (or out of) a goal's piggy-bank ledger. */
export interface GoalContribution {
  id: string;                 // crypto.randomUUID()
  /** Atomic-unit string. Positive = set aside; negative = took back out. */
  amount: string;             // e.g. "500000000" for 500 CCX at 6dp
  /** ISO timestamp the user logged it. */
  at: string;
  /** Optional free-text the user attached ("from October paycheck"). Capped, sanitized. */
  note?: string;
  /**
   * Provenance. "manual" = typed into the ledger (MVP). "snapshot" = the optional
   * one-tap "record current available" convenience. "deposit" = reserved for Phase 2
   * deposit-linked auto-entries (carries depositId).
   */
  source: "manual" | "snapshot" | "deposit";
  depositId?: string;         // Phase 2 only
}

export type GoalStatus = "active" | "achieved" | "archived";

export interface Goal {
  id: string;                 // crypto.randomUUID()
  name: string;               // user label, capped + sanitized (see §7)
  /** Target amount, atomic-unit string. > 0. */
  target: string;
  /** Optional. ISO date (date only, no time) the user wants it by. */
  deadline?: string;
  /** Optional emoji (single grapheme) for the card avatar. */
  emoji?: string;
  /** Optional colour token key (a fixed palette, not free hex — see §4). */
  color?: GoalColor;
  /** Append-only-ish ledger. Edits replace by id; deletes filter by id. */
  contributions: GoalContribution[];
  status: GoalStatus;
  createdAt: string;          // ISO
  /** Set the first time the goal's saved total reaches target. Drives celebration once. */
  achievedAt?: string;
  /** Phase 2: deposit ids whose principal+interest count toward this goal. */
  linkedDepositIds?: string[];
}

export type GoalColor =
  | "amber" | "incoming" | "deposit" | "violet" | "rose" | "sky" | "slate";
```

**Why a contribution *ledger* and not a single `saved` number:** an append ledger gives
us (i) undo/correct without losing history, (ii) a "you added 500 CCX on 12 Oct" activity
trail that makes the card feel alive without gamification, (iii) a clean place for Phase-2
deposit entries to slot in, and (iv) trivial recompute of `saved = Σ contributions`. A
single mutable number would lose all of that and invite mutation bugs (immutability rule).

**Derived, never stored:** `saved`, `progressPct`, `remaining`, on-track status, suggested
rate. Stored state is only what the user authored. Pure functions in `lib/goals/progress.ts`
compute the rest (see §5) — same split as `lib/ui/check-ins.ts`.

### Storage location + keying — **per wallet** (a deliberate upgrade over the older stores)

`lib/storage/goals-store.ts`, mirroring `check-ins-store.ts` / `scheduled-payments-store.ts`:
`localStorage`-guarded (`typeof localStorage === "undefined"` → `[]`), JSON array, runtime
type-guard on read, immutable save/remove/update returning the new list, **no `wallet-core`
import**.

**Fork I'm calling out:** Check-ins and Reminders today use a *single global* key
(`ccx-check-in-watchers`, `ccx-scheduled-payments`) — they are **not** per-wallet, which is
arguably a latent multi-wallet bug in those modules. The brief explicitly wants Goals keyed
per wallet, and goals are far more wallet-specific than a contact-watch list, so I key
Goals per wallet from day one:

```
ccx-goals:<walletId>      // e.g. "ccx-goals:default", "ccx-goals:<uuid>"
```

`walletId` comes from `getActiveWalletId()` (`lib/auth/active-wallet-id.ts`) — already
built for exactly this: real-SDK mode resolves the registry's active id, **mock mode and
the legacy engine resolve to `DEFAULT_WALLET_ID` ("default")** without pulling the engine.
The default wallet's goals therefore live under `ccx-goals:default`, which is stable across
the single-wallet legacy engine and the SDK's default entry — same back-compat story the
passkey store uses.

Because `getActiveWalletId()` is async, the store's read/write take an explicit
`walletId: string` parameter (pure, synchronous, testable); a thin `useGoals()` hook
resolves the active id once and feeds it in:

```ts
// lib/storage/goals-store.ts
export function listGoals(walletId: string): Goal[];
export function saveGoal(walletId: string, goal: Goal): Goal[];      // upsert by id
export function removeGoal(walletId: string, id: string): Goal[];
export function updateGoal(walletId: string, id: string, patch: Partial<Goal>): Goal[];
```

This keeps the store a pure function of `(walletId, payload)` — easy to unit-test, no async
inside the persistence layer — and the async id-resolution lives in the hook, where the
rest of the app already does that.

**Why local-store, not a 9th service (explicit position):** goals are pure device-local
metadata that never round-trip the chain and are *identical* in mock and real mode. Routing
them through the service spine would force me to write — and keep in sync — a mock impl and
a real impl of code that does nothing but read/write `localStorage`, for zero behavioural
difference. That's exactly the duplication the CLAUDE.md "purely-local UI metadata bypasses
the service layer" rule exists to avoid. Goals are a local store, full stop. (Phase-2
deposit-linking *reads* the deposit service via the existing `useDeposits()` hook — but it
*reads*; it never adds a goals service.)

---

## 4. UX — screens, states, card anatomy, form, rail

### Route + nav

- Page: `app/(wallet)/wallet/goals/page.tsx` (client component, like deposits/check-ins).
- Sidebar: add `{ href: "/wallet/goals", labelKey: "nav.goals", icon: Target, canCreate: true }`
  to the **Earn** group in `components/layout/sidebar.tsx`, between Deposits and Insights.
  `canCreate: true` wires the sidebar quick-create "+" → `?new=1` → `useCreateDeepLink`
  opens the create dialog, exactly like Deposits. Icon: lucide `Target` (a goal/bullseye —
  on-brand, distinct from Deposits' `Coins` and Check-ins' `HeartPulse`).

### Page states

1. **Empty** — `EmptyState` (illustration `/brand/empty/goals.png` via `publicAssetPath`),
   a one-line "Set a savings goal and watch your CCX climb toward it," and a primary
   **Create goal** button. Honest framing line underneath (English, security-adjacent
   tone but neutral): *"Goals are a personal tracker — they never move or lock your CCX."*
2. **List** — a responsive grid of **goal cards** (1-col mobile → 2-col `@3xl` → 3-col
   `@5xl`, matching the deposits grid breakpoints). Active goals first (sorted by *nearest
   deadline*, then by *highest progress*), then Achieved (collapsed/dimmed), then Archived
   behind a "Show archived (n)" disclosure.
3. **Create / Edit** — a `Dialog` form (below).
4. **Contribute** — a small `Dialog` (or inline popover on the card) to log a contribution.
5. **Achieved** — when `saved ≥ target`, the card flips to a celebratory state: ring fills
   to 100% in `wallet-incoming` green, a one-shot confetti-light shimmer (respect
   `prefers-reduced-motion` → no animation, just the green state), a "Reached!" badge, and
   the date. **Tasteful, not slot-machine:** a single sweep on the ring, a checkmark, done.
   No coins raining, no sound, no streak counters.

### Goal-card anatomy

```
┌─────────────────────────────────────────────────────────┐
│  ◐ 64%        💻  New laptop                  ⋯ (menu)    │   ← progress ring + emoji + name + overflow
│  ring         5,000 CCX target · by 31 Dec 2026          │   ← target + deadline subline
│                                                          │
│  3,200 CCX saved        1,800 CCX to go                  │   ← saved / remaining (mono, USD subline opt)
│  ≈ $128.00              ≈ $72.00                         │
│                                                          │
│  ▰▰▰▰▰▰▰▱▱▱  64%                                          │   ← linear progress (animated, amber→#ffc266)
│                                                          │
│  ● On track · ~225 CCX/week keeps you on pace            │   ← status pill + suggestion (deadline goals)
│                                                          │
│  [ + Add ]   [ Edit ]                                    │   ← actions; Add disabled in view-only? (see §7)
└─────────────────────────────────────────────────────────┘
```

- **Ring** reuses the deposits `ProgressRing` SVG pattern (44×44, `--donut-sweep`
  animation, reduced-motion safe). Colour = the goal's `color` token (default `amber` =
  primary `#FFA500`); green when achieved.
- **Status pill** (deadline goals only): `On track` (incoming-green), `Behind`
  (amber/primary — *not* red; behind-on-savings is a nudge, never an error), `Met` (green),
  `No deadline` goals show no pill, just "Keep going."
- **Overflow menu (⋯):** Edit · Contribute · Mark achieved (manual override) · Archive ·
  Delete. Delete is a confirm dialog ("This removes the goal and its contribution history.
  Your CCX is untouched." — English, since it's a delete-consequence string per the i18n
  policy).
- **Contribution trail** (collapsible "Recent" disclosure inside the card or in the
  edit/detail view): "+500 CCX · 12 Oct" rows — the alive-but-quiet motivation, no badges.

### Add / Edit goal form (fields)

| Field            | Control                    | Notes / validation |
|------------------|----------------------------|--------------------|
| Name             | `Input`                    | required, 1–60 chars, trimmed, sanitized |
| Target (CCX)     | `Input` numeric            | required, > 0, ≤ a sane max; parsed to atomic string |
| Deadline         | date `Input` (optional)    | optional; must be today-or-future on create |
| Emoji            | small emoji picker / `Input` | optional, single grapheme; defaults by name heuristic? No — keep simple, blank = colour avatar |
| Colour           | swatch row (`GoalColor`)   | optional, defaults `amber` |
| (Edit only) Starting/adjust contributions handled via the Contribute flow, not the edit form |

The form is a single-step `Dialog` (goals have no irreversible consequence, so no
two-step confirm like Deposits — that confirm exists because a deposit *spends* CCX; a goal
spends nothing). A **live preview** line echoes "Target 5,000 CCX · by 31 Dec 2026 ·
~96 CCX/week from today" so the user sees the implied pace before saving.

### Contribute form (fields)

| Field   | Control          | Notes |
|---------|------------------|-------|
| Amount  | `Input` numeric  | required, ≠ 0; **+** sets aside, a "Withdraw from goal" toggle flips the sign for taking money back out of the tracker |
| Note    | `Input` optional | ≤ 80 chars, sanitized |
| Date    | defaults to now; advanced users can backdate |

On submit: append a `GoalContribution`, recompute, toast `t("goals.contributionLogged", { amount })`,
and if this tips `saved ≥ target` for the first time, set `achievedAt`, flip status to
`achieved`, and fire the celebration. **No CCX is sent or locked** — this is bookkeeping.
A muted helper sits under the amount: *"This records money you've set aside — it doesn't
move any CCX."* (English; consequence-adjacent clarity.)

### Right rail (`usePageRightRail(<GoalsRail />)`)

Registered once at the top of the page, like `DepositsPageClient`. Content:

- **Overall** section (`RailSectionHeading` + `RailStatRow`s): total saved across active
  goals, total target, blended progress %, count of goals on track vs behind.
- **Next milestone** stat: the active goal closest to *completion* ("New laptop — 92% ·
  400 CCX to go") with a mini ring — the single "next step" nudge, classy.
- **Soonest deadline** stat: the goal whose deadline is nearest, with days remaining.
- Reuse `RailMarketSection` at the bottom (price context for the USD sublines), same as the
  deposits rail.
- Below the 1200px breakpoint, render `<GoalsRail embedded />` inline at the page foot
  (the `min-[1200px]:hidden` fallback the shell convention uses).

---

## 5. Progress + projection logic

All pure functions in `lib/goals/progress.ts` (unit-tested, no React, no engine). Money
math is done in atomic units (integers / BigInt where needed) and only converted to
display numbers at the edge.

### Saved, progress, remaining

```
saved(goal)      = Σ contributions.amount                  // atomic; can't go below 0 for display
progressPct(goal)= clamp(saved / target * 100, 0, 100)     // display-clamped; raw can exceed 100
remaining(goal)  = max(target - saved, 0)                  // atomic
exceededBy(goal) = max(saved - target, 0)                  // for the "over-saved" note
```

### "On track" — defined so it needs **zero auto-movement**

The whole point: on-track is a *pure read* over (saved, target, deadline, now) and the
goal's own **observed pace**. No funds move; we only compare numbers the user already
authored.

Two complementary reads, both shown:

**A. Required pace (always computable for a deadline goal):**

```
weeksLeft        = max((deadline - now) / 7days, fractional, min 0)
requiredPerWeek  = weeksLeft > 0 ? remaining / weeksLeft : remaining   // "need it all now" if due
```

This is the "~225 CCX/week keeps you on pace" suggestion. It's honest and assumption-free:
it's literally remaining ÷ time. As the user contributes, `remaining` shrinks and the
suggestion eases.

**B. Observed-pace vs required-pace → the status pill.** I define **on track** as:

```
observedPerWeek = saved / max(weeksElapsedSince(createdAt), 1week)     // their actual rate so far
status =
  saved >= target                         → "met"
  no deadline                             → "active" (no pill)
  observedPerWeek >= requiredPerWeek       → "on-track"
  else                                    → "behind"
```

Plainly: *"At the rate you've actually been setting money aside, will you arrive by the
deadline?"* If yes → on track. This is defensible (it's their own demonstrated behaviour,
not a forecast of balance), needs nothing to move, and degrades gracefully:

- Brand-new goal with one contribution: `weeksElapsed` floored at 1 week so we never divide
  by ~0 and scream "behind" on day one. A fresh goal with a deadline reads **on track**
  until enough time passes to judge — we don't shame people for just starting.
- No deadline: there's no "behind." We show "Keep going" + saved/remaining only. A goal
  without a date is an aspiration, not a commitment, and the UI respects that.

**Projection chart (rail/detail, optional polish):** a small area line like the deposits
projection — plot `saved` over time from the contribution timestamps (a step function), and
optionally a dashed "to hit your deadline" guide line from today's `saved` to `target` at
`deadline`. Reuses the deposits `MiniArea` / recharts pattern. This is P1 eye-candy, not MVP.

### ETA when there's no deadline

If the user has *no* deadline but a steady pace, show a soft ETA: `etaWeeks = remaining /
observedPerWeek` → "at your current pace, ~14 weeks to go." Phrased as an estimate, never a
promise. P1.

---

## 6. Integrations

- **Deposits (Phase 2 flagship):** "Fund with a deposit" CTA on a goal opens the existing
  create-deposit dialog pre-filled with the goal's `remaining` (capped to max). On success
  we record the deposit id in `goal.linkedDepositIds` and append a `source:"deposit"`
  contribution. Going forward, that contribution's effective amount = the deposit's
  `principal + interest` (read live from `useDeposits()`), and the card shows a small
  "🔒 locked in a deposit, matures 31 Dec" line — deposit maturity rendered against the
  goal deadline. If a linked deposit is withdrawn/spent, its contribution flips to a
  *settled manual* entry at the realised value (so withdrawing your deposit doesn't erase
  goal progress — the money still "arrived"). This is the model that makes Goals genuinely
  powerful; it's deliberately deferred so MVP ships clean.
- **Insights:** Goals can borrow Insights' device-computed net-flow later to *suggest* a
  realistic weekly contribution ("you've netted ~300 CCX/week lately") — a hint in the
  create form. P2, read-only, opt-in. Not MVP.
- **Reminders / Scheduled (P1):** a goal can spawn an "add to goal" reminder via the
  existing scheduled-payments/reminders local store — a recurring nudge to *log* a
  contribution, NOT a payment. Copy stays in the family: *"Your keys never auto-send —
  you'll be prompted to set money aside yourself."* This is the right home for any
  "notification," since there is no server (static export).
- **Account balance:** read-only context only. The goals page may show a quiet "Available:
  X CCX" reference so the user knows what they *could* set aside — but the goal total is
  never derived from balance. The optional one-tap "snapshot current available" convenience
  (writes a manual contribution) is the *only* place balance touches goals, and it's an
  explicit user tap that records a fixed number.

---

## 7. Edge cases + resolutions

| Case | Resolution |
|------|-----------|
| **Target reached** | First time `saved ≥ target`: set `achievedAt`, status → `achieved`, fire one celebration. Card moves to the Achieved group, dimmed, ring green. Idempotent — `achievedAt` is set once and gates the animation so re-renders/re-opens don't re-celebrate. |
| **Target exceeded** (saved > target) | Progress display clamps to 100%; a small note "Over by 1,200 CCX 🎉". We don't cap the ledger — over-saving is a win, not an error. |
| **Deadline passed, unmet** | Status pill → **"Past deadline"** (muted/amber, never red). No nag, no auto-archive. We offer an inline **"Extend deadline"** action and a **"Mark achieved anyway"** option (life happens). The goal stays in Active until the user decides. |
| **Deadline passed, met** | It's just `achieved`; deadline is irrelevant. |
| **Goal deleted** | Confirm dialog. Removes the goal + its contributions from the store. **No CCX is affected** (it was only ever bookkeeping) — confirm copy says exactly that. Phase-2: deleting a deposit-linked goal does NOT touch the deposit (the deposit is real money; only the link/tracker is removed). |
| **Contribution mistake** | Edit or delete the individual `GoalContribution` by id (immutable replace/filter); totals recompute. A negative contribution ("withdraw from goal") is the user-facing way to take money back out of the tracker without deleting history. |
| **Multi-wallet** | Goals are **per wallet**, keyed `ccx-goals:<activeWalletId>` (§3). Switching wallets shows that wallet's goals; they never merge. This is correct because a goal is about *this* wallet's saved CCX. (I explicitly reject "shared across wallets" — a 5,000-CCX laptop goal means nothing if it's funded from three different keysets.) |
| **View-only wallet** | Goals are *metadata*, so a view-only user can still **create/edit/track** goals and **log manual contributions** (it's a personal ledger, not a spend). What's disabled: Phase-2 "Fund with a deposit" (needs spend keys → reuse the existing `viewOnly` guard + `ViewOnlyBadge`, like the deposit create button). MVP has no spend action, so MVP is fully usable view-only. |
| **CCX 6dp** | All amounts stored as atomic-unit strings; arithmetic in atomic units; display via `formatCcx` (defaults to `COIN_UNIT_PLACES`). Inputs parse human CCX → atomic with the same helper the send/deposit forms use; reject NaN/negative/over-precision. Interest/over-saved sublines can use 6dp like deposits do. |
| **Optional USD** | Each amount gets an `≈ $X` subline via `usdSubline(ccx, marketPrice)` (`useMarketData().data?.price.value`), identical to deposits. Gracefully absent when price is unavailable. Never stored — always derived at render. |
| **Spending a "balance-linked" goal's funds** | **Not applicable by design** — I rejected live balance-linking, precisely to avoid this footgun. In the manual model, spending CCX elsewhere has *zero* effect on goal progress, because progress reflects what the user *logged*, not their live balance. This is a feature: your "emergency fund" goal doesn't lurch when you buy coffee. (The honest-framing line on the card/empty-state makes clear a goal is a tracker, so a user is never misled into thinking the CCX is reserved.) |
| **`localStorage` unavailable / SSR / static export** | Store guards `typeof localStorage === "undefined"` → returns `[]` and no-ops on write, same as check-ins. The page renders an empty state, no crash. |
| **Corrupted stored JSON** | Read is wrapped in try/catch + per-item type-guard (`isGoal`), dropping malformed entries rather than throwing — mirrors `isWatchedContact`/`isScheduledPayment`. |
| **Name / note injection** | Names and notes are user free-text rendered as text nodes (React escapes by default). Additionally trim, length-cap (name ≤ 60, note ≤ 80), and strip control chars on save. Emoji field validates a single grapheme. |
| **Huge / absurd target** | Validate `target > 0` and below a sane ceiling (e.g. ≤ total supply order-of-magnitude) so the projection math and ring don't produce nonsense; friendly inline error. |
| **Clock skew / backdated contributions** | Pace math floors elapsed time at 1 week and clamps `weeksLeft ≥ 0`, so a backdated or future-dated contribution can't make pace go infinite/negative. |

---

## 8. MVP scope vs Later

### MVP (ships first — small, useful, parity-free)

- `lib/goals/goal.ts` (types) + `lib/goals/progress.ts` (pure derive fns) + `isGoal` guard.
- `lib/storage/goals-store.ts` — per-wallet `localStorage` store (`ccx-goals:<walletId>`),
  list/save/remove/update, guarded, immutable, type-guarded. No service-spine, no engine.
- `useGoals()` hook resolving the active wallet id → store.
- Goals page in **Earn** nav (`Target` icon, `canCreate` "+" deep-link), with:
  - Empty state (honest "tracker, not a vault" framing).
  - Goal cards: ring, name+emoji+colour, target/deadline, saved/remaining (+ optional USD),
    linear progress, status pill, recent-contributions disclosure.
  - Create/Edit dialog (name, target, deadline?, emoji?, colour?) with live pace preview.
  - Contribute dialog (amount ±, note?, date), append-to-ledger, recompute, toast.
  - Achieved state + single tasteful celebration (reduced-motion safe).
  - Edit/delete goal; edit/delete individual contributions; archive.
- `GoalsRail` right-rail: overall saved/target/blended %, next-milestone, soonest deadline,
  reused market section + the `<GoalsRail embedded />` sub-1200px fallback.
- Deadline projection logic: required-per-week suggestion + observed-vs-required on-track
  pill. Multi-wallet keying, view-only usable, 6dp/atomic-string money.
- i18n: all neutral strings under a `goals.*` namespace + `nav.goals`, added to **all 10**
  dictionaries (the equality test must pass). Consequence/celebration-adjacent copy
  (delete confirm, "doesn't move CCX" clarifiers) kept English per policy.
- Tests: unit (`progress.ts` math: progress/remaining/on-track/exceeded/edge clocks; store
  guards + immutability) and one e2e (`e2e/goals.spec.ts`: create → contribute → progress →
  achieve, in forced-mock).

### Later

- **Phase 2 — Deposit-linking (flagship):** "Fund with a deposit" CTA, `source:"deposit"`
  contributions valued at live principal+interest, maturity-vs-deadline display, withdraw →
  settle-as-manual. View-only-disabled for the fund action.
- "Add to goal" recurring **Reminder** integration (P1).
- **Projection area chart** (saved-over-time + deadline guide line) and no-deadline **ETA**.
- **Insights-driven suggested rate** in the create form.
- One-tap **"snapshot current available"** manual-contribution convenience.
- **Overall USD** valuation + a tiny goals summary widget on the Account/dashboard.
- (Maybe, low priority) export/share a goal's progress.

---

## 9. Open questions / risks for the orchestrator

1. **Does the team accept that the older local stores (check-ins, reminders) are
   *not* per-wallet, and that Goals should be the first per-wallet local store?** I argue
   yes and that it's the correct design; but it introduces a *second* keying convention in
   `lib/storage/*`. If the team wants consistency, the cheap follow-up is to migrate
   check-ins/reminders to the same per-wallet scheme — out of scope for Goals, worth a note.
2. **`getActiveWalletId()` is async; the store is sync.** I resolve this by passing
   `walletId` into the store and doing the async resolve in `useGoals()`. Confirm that's the
   preferred shape (vs. an async store, which I avoided to keep persistence pure/testable).
   There's a brief window on first paint before the id resolves — render a skeleton, not the
   `default` wallet's goals, to avoid a flash of the wrong wallet's data on a namespaced
   wallet.
3. **Celebration tastefulness.** I've specced a single ring-sweep + checkmark + badge,
   reduced-motion safe, no sound/confetti-storm. If design wants *slightly* more (a brief
   shimmer), keep it one-shot and `prefers-reduced-motion`-gated. Risk: gamified slop is
   easy to drift into; hold the line.
4. **Behind = amber, never red.** I deliberately never use the destructive/red token for a
   savings shortfall (red is for irreversible spend warnings in this wallet). Confirm the
   design language agrees that "behind on a goal" is a gentle nudge, not an error.
5. **Manual ledger honesty.** Because nothing is locked, a user *could* log 5,000 CCX
   "saved" while their balance is 12 CCX. That's fine (it's a personal tracker, and the
   "tracker, not a vault" framing is everywhere), but the orchestrator should decide whether
   to add an *optional, non-blocking* "heads up: your available balance is below your saved
   total" hint. I lean: P1 hint, never a hard validation — the user owns their bookkeeping.
6. **Phase-2 deposit identity.** Reliable deposit-linking likely needs the SDK engine's
   richer deposit ids (the legacy engine's deposit identity is thinner). Gate Phase 2 on
   SDK-readiness, same as the #91/#95 multi-wallet work.
7. **String budget.** Goals adds a `goals.*` namespace. Keep it lean (target ~40–60 keys)
   so the all-10-locale equality test stays maintainable; lean on shared keys
   (`action.cancel`, `rail.amount`, etc.) where they exist. Confirm the budget is acceptable.
8. **Emoji input across locales/IMEs.** The single-grapheme emoji field can be fiddly with
   IME composition; if it's a headache, ship MVP with the **colour-swatch avatar only** and
   add emoji in a follow-up. Low risk, flagged.
