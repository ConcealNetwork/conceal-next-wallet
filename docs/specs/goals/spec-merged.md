# Goals — merged spec (orchestrator synthesis)

> Synthesized by the Opus main thread from 3 independent specs: **Gemini 3.1 Pro**,
> **GLM-4.6**, **Opus 4.8** (Codex produced no file — out of credits). Provenance noted
> inline as _(G)_, _(GLM)_, _(O)_. Forks are resolved with a stated reason. The
> agent specs live in `docs/specs/goals/agents/`.

---

## 0. Consensus (all three agreed)

- **Savings model = manual-contribution ledger** ("virtual envelope" / piggy-bank). A goal
  is a **tracker, never a vault** — the wallet never auto-moves or locks CCX. Progress =
  what the user *logged*, not their live balance.
- **Balance-linked (live) is rejected** _(O, G, GLM all independently)_ — on a shared-pool
  self-custody wallet it lies and regresses when you spend normally.
- **Deposit-backed is the flagship "Later"** — a time-locked Deposit is the real envelope
  (principal + interest = honest "saved", maturity ↔ deadline). Deferred from MVP because it
  couples to the deposit service surface + needs richer SDK deposit identity.
- **Device-local, keyed per wallet.** No service-spine (pure local metadata, identical mock
  & real → routing it through the 8 services would just duplicate localStorage code).
- **Lives in the Earn nav group** (Deposits / Market / Insights / **Goals**).
- **Progress**: `saved = Σ contributions`, `progressPct = clamp(saved/target·100, 0, 100)`,
  `remaining = max(target − saved, 0)`.
- **On-track** = observed pace ≥ required pace, computed purely from logged data (no movement).
- Goal card with a **progress ring** (reuse the Deposits `ProgressRing` SVG), add/edit form,
  contribute modal, **achieved celebration** (reduced-motion safe), and a **Goals right rail**.

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

`lib/storage/goals-store.ts`, mirroring the existing `check-ins` / `scheduled-payments`
stores (guard for the no-storage/SSR/static-export case → `[]`; JSON; per-item type guard
`isGoal`; immutable save/remove/update; **no `wallet-core` import**). **Match the exact
mechanism those siblings use** (verify localStorage vs the `lib/storage/*` IndexedDB guard at
implementation — CLAUDE.md notes `lib/storage/*` guards `typeof indexedDB`).

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

## 6. Progress + projection _(Opus's reads; matches G & GLM's pace math)_

Pure fns in `lib/goals/progress.ts` (no React/engine; unit-tested; atomic-unit math):

```
saved           = Σ contributions.amount
progressPct     = clamp(saved / target · 100, 0, 100)
remaining       = max(target − saved, 0)
weeksLeft       = max((deadline − now) / 7d, 0)
requiredPerWeek = weeksLeft > 0 ? remaining / weeksLeft : remaining     // "~225 CCX/week keeps you on pace"
observedPerWeek = saved / max(weeksElapsedSince(createdAt), 1 week)     // their real rate so far
status:
  saved ≥ target                  → "met"
  no deadline                     → no pill ("Keep going"; optional soft ETA P1)
  observedPerWeek ≥ requiredPerWeek → "on-track"
  else                            → "behind"
```

Floor `weeksElapsed` at 1 week so a day-old goal isn't shamed as "behind". No deadline → no
behind state (an aspiration, not a commitment); optional soft ETA `remaining / observedPerWeek`
("~14 weeks at your pace"). Projection area chart (saved-over-time + dashed deadline guide,
reusing the deposits chart) is **P1 polish**, not MVP.

---

## 7. Edge cases _(union of all three; Opus's table is the base)_

| Case | Resolution |
|---|---|
| Target reached | First `saved ≥ target` → set `achievedAt` once (idempotent — gates the one celebration), status `achieved`, card to Achieved group, ring green. |
| Target exceeded | Clamp ring to 100%; "Over by N CCX 🎉" (positive). Ledger uncapped. |
| Deadline passed, unmet | Pill → "Past deadline" (**muted/amber, never red**); no auto-archive/nag; inline "Extend deadline" + "Mark achieved anyway". |
| Goal deleted | Confirm dialog; removes goal + its ledger. **No CCX affected** — copy says so. (P2: deleting a deposit-linked goal never touches the deposit.) |
| Contribution mistake | Edit/delete the `GoalContribution` by id (immutable); or log a negative ("withdraw from goal") to keep history. |
| Multi-wallet | Per-wallet keyed (`ccx-goals:<walletId>`); never merge across wallets. |
| View-only wallet | Fully usable for MVP (manual ledger = no spend). Only the P2 "Fund with a deposit" action is `viewOnly`-gated. |
| Over-allocation | _(G)_ Σ saved > wallet balance → gentle **amber hint banner**, non-blocking, no forced reconcile (P1). |
| CCX 6dp | Atomic-string storage; atomic arithmetic; `formatCcx` display; inputs parsed via the send/deposit helper (reject NaN/negative/over-precision). |
| Optional USD | `≈ $X` via `usdSubline(ccx, marketPrice)`; derived at render; absent if price unavailable. |
| Spending elsewhere | Zero effect on progress (manual model) — by design; the over-allocation hint is the only balance touchpoint. |
| No storage / SSR / corrupt JSON | Guard → `[]`; try/catch + `isGoal` per-item drop (mirrors `isWatchedContact`). |
| Name/note injection | React escapes; also trim + length-cap + strip control chars on save. |
| Absurd target / clock skew | Validate `0 < target ≤` sane ceiling; floor elapsed at 1 week, clamp `weeksLeft ≥ 0` so pace can't go ∞/negative. |

---

## 8. MVP vs Later

**MVP** — `lib/goals/{goal.ts,progress.ts}` + `isGoal`; per-wallet `goals-store.ts`;
`useGoals()`; Goals page in Earn (`Target` icon, `+` deep-link); empty state; goal cards
(ring/name/icon/colour, target/deadline, saved/remaining ±USD, progress bar, status pill,
recent trail); create/edit dialog w/ live preview; contribute dialog (± / note / date);
achieved + one tasteful celebration; edit/delete goal + contributions; archive; `GoalsRail`
(overall/next-milestone/soonest-deadline + market + embedded fallback); deadline projection
(required + observed-vs-required on-track); per-wallet keying; view-only usable; 6dp/atomic
money; i18n `goals.*` + `nav.goals` across **all 10** locales (consequence/celebration copy
English); unit tests (`progress.ts`, store guards/immutability) + one e2e
(`e2e/goals.spec.ts`: create → contribute → progress → achieve, forced-mock).

**Later** — P2 deposit-linking (flagship); over-allocation hint (P1); "remind me to save"
Reminders nudge (P1); projection area chart + no-deadline ETA; Insights-suggested rate;
one-tap "snapshot current available"; overall USD + an Account summary widget; export/share
a goal.

---

## 9. Open questions / risks (for sign-off before implement)

1. **Storage mechanism** — confirm goals match the siblings' actual mechanism (localStorage
   vs `lib/storage/*` IndexedDB guard); keep per-wallet keying regardless.
2. **First per-wallet local store** — accept the new keying convention (and optionally migrate
   check-ins/reminders later)?
3. **Behind = amber, never red** — confirm (red is reserved for irreversible-spend warnings).
4. **Celebration tastefulness** — single ring sweep + checkmark, reduced-motion gated; hold
   against gamified slop.
5. **Manual honesty** — a user can log "saved" beyond their balance; the over-allocation hint
   (P1) addresses it softly. Confirm hint-not-block.
6. **Icon vs emoji** — MVP ships a Lucide icon picker (chosen); emoji deferred. OK?
7. **i18n budget** — target ~40–60 `goals.*` keys; lean on shared keys. Acceptable?
8. **Design phase next** — per the multi-agent workflow, Goals UI goes through `huashu-design`
   (3 variants → review.html → **STOP for your approval**) before implementation.
