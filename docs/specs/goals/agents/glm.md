# Goals Feature Spec — GLM

## Product Summary

A device-local savings goal tracker that lets users set financial goals (e.g., "New laptop — 5,000 CCX") and monitor progress through **manual contribution bookkeeping**. The user records contributions to a goal, creating a personal savings ledger without the wallet ever moving funds automatically. Progress is tracked against a target amount and optional deadline, with on-track status derived from contribution velocity. Goals persist in a wallet-specific IndexedDB store, integrate with Deposits as a "Fund this goal" entry point, surface in the Insights flow context, and expose a rich right-rail with progress rings, milestones, and contribution timeline. The model prioritizes user control and safety: the wallet remains a tracker, not a vault.

## Chosen Savings Model: Manual Contribution Bookkeeping

**MVP Choice:** Manual contributions (option (a)) — the user explicitly records amounts as "saved toward a goal," creating a bookkeeping ledger.

**Rationale:**

1. **Safety & Control:** This is the only model that genuinely respects the non-custodial, no-auto-movement principle. Balance-linked tracking would create a fragile illusion — if the user spends the tracked balance, the goal's progress magically disappears, which feels dishonest and confusing. Deposit-backed tracking would force users to lock funds, which is too restrictive for general savings goals (some goals are aspirational, not tied to interest-earning). Manual bookkeeping puts the user fully in control of what counts toward a goal.
2. **Flexibility:** Users can record contributions from any source — a deposit, a received payment, a portion of available balance, even an external savings plan. The goal becomes a personal accounting layer over their wallet activity.
3. **Simplicity:** One clear data model (contribution entries) with no complex state synchronization to deposits or balance slices. Easy to reason about, test, and maintain.
4. **Parity with Existing Patterns:** Mirrors how Check-ins and Reminders work — device-local, user-driven metadata that augments wallet data without altering it.

**Later (Non-MVP):** Balance-linked tracking as an optional "auto-track" mode (opt-in, with clear disclosure that spending reduces progress) and deposit linking (mark deposits as "funding goal X"). These can be layered atop the manual core.

## User Stories (Prioritized)

### P0 — Core Goal Creation & Tracking
1. As a saver, I want to create a goal with a name, target amount in CCX, optional deadline, and optional icon/color, so that I have a clear savings target.
2. As a saver, I want to see my goals in a list with a progress ring showing how much I've saved toward the target, so that I can quickly assess my progress.
3. As a saver, I want to record a manual contribution to a goal (amount saved, optional note), so that I can track progress when I set aside funds.
4. As a saver, I want to see a goal's detail view with contribution history, remaining amount, and on-track status, so that I understand my full journey toward the goal.

### P1 — Progress, Projections & Motivation
5. As a saver with a deadline, I want to see whether I'm on track or behind, and a suggested contribution rate to meet the goal, so that I can adjust my saving behavior.
6. As a saver, I want to celebrate when I achieve a goal (visual celebration, status change to "achieved"), so that I feel motivated to complete goals.
7. As a saver, I want to archive or delete a goal (delete permanently or keep as historical record), so that I can maintain a clean list.
8. As a saver, I want to edit a goal's name, target, deadline, or visual styling, so that I can correct mistakes or adapt to changing circumstances.

### P2 — Integrations & Context
9. As a saver, I want to open a Deposit directly from a goal's "Fund this goal" action, so that earning interest can help reach the goal faster.
10. As a saver, I want to see an overall savings summary in the right-rail (total saved across all goals, next deadline, achievement streak), so that I get a macro view of my savings health.
11. As a saver, I want to set a recurring reminder to contribute to a goal (piggyback on existing Reminders infrastructure), so that I stay consistent without manual prompting.
12. As a saver, I want to see optional USD-equivalent values using market price (same display as Insights), so that I have context for fiat value.

### P3 — Later
13. As a saver, I want to see insights into my saving patterns (e.g., monthly contribution trends, goal completion rate) — defer to Insights expansion.
14. As a saver, I want to export my goal data as JSON — power user feature, low priority.
15. As a saver, I want to share my goal (anonymized, read-only card) — social/external feature, out of scope for MVP.

## Data Model

### Goal Entity

```typescript
interface Goal {
  id: string; // UUID v4, wallet-scoped unique
  walletId: string; // The wallet this goal belongs to (for multi-wallet support)
  name: string; // "New laptop", "Emergency fund"
  targetCcx: number; // Target amount in CCX (6 decimal places)
  deadline: Date | null; // Optional target date
  icon: string | null; // Optional emoji or icon identifier (lucide icon name)
  color: string | null; // Optional color hex for card accent (from palette)
  status: 'active' | 'achieved' | 'archived'; // Lifecycle state
  createdAt: Date;
  achievedAt: Date | null; // When target was first reached
  contributionHistory: Contribution[]; // Ordered list of manual contributions
}

interface Contribution {
  id: string; // UUID v4
  amountCcx: number; // Amount contributed (positive, never negative)
  timestamp: Date;
  note: string | null; // Optional note like "From sale of old phone"
}
```

### Storage & Keying

**Location:** `lib/storage/goals.ts` (new module, sibling to `check-ins.ts` and `tx-notes.ts`)

**IndexedDB Store:** `"goals"` — one store per database (same DB as other local stores)

**Key Schema:**
- Primary key: `goal.id` (UUID)
- Indexes:
  - `byWalletId`: on `walletId` — for fetching all goals for a wallet
  - `byStatus`: on `status` — for filtering active/achieved/archived
  - `byDeadline`: on `deadline` — for sorting by nearest deadline (nulls last)

**Per-Wallet Isolation:** Goals are wallet-scoped via `walletId`. The default wallet uses `""` (empty string) to match the legacy `"wallet"` key pattern, but the record itself stores the explicit `walletId` for clarity. Multi-wallet switching loads only goals with matching `walletId`.

### Reading the Model (Helper Functions)

```typescript
async function listGoals(walletId: string): Promise<Goal[]>
async function getGoal(goalId: string): Promise<Goal | null>
async function saveGoal(goal: Goal): Promise<void>async function deleteGoal(goalId: string): Promise<void>
async function addContribution(goalId: string, amountCcx: number, note?: string): Promise<void>
async function updateGoalStatus(goalId: string, status: Goal['status']): Promise<void>

// Computed helpers (pure functions, derived from Goal)
function getSavedAmount(goal: Goal): number {
  return goal.contributionHistory.reduce((sum, c) => sum + c.amountCcx, 0);
}

function getProgressPercent(goal: Goal): number {
  const saved = getSavedAmount(goal);
  return Math.min(100, (saved / goal.targetCcx) * 100);
}

function getRemainingAmount(goal: Goal): number {
  return Math.max(0, goal.targetCcx - getSavedAmount(goal));
}

function isGoalAchieved(goal: Goal): boolean {
  return getSavedAmount(goal) >= goal.targetCcx;
}
```

## UX

### Screens & States

#### 1. Goals Landing Page (`goals/`)

**Layout:** Standard wallet shell page with left-nav selected on "Earn > Goals".

**Main Content:** Two-column layout (responsive, collapses to single column on narrow screens):
- **Left (70%):** Goal cards grid (2 columns on desktop, 1 on mobile)
- **Right (30%):** Contextual right-rail (registered via `usePageRightRail`)

**Goal Grid Header:**
- Page title: "Goals" (localized)
- Action button: "New goal" (primary, icon: `plus-circle`)
- Filter tabs: "Active" | "Achieved" | "Archived" (default: Active)
- Sort dropdown: "Deadline" | "Progress" | "Created" | "Name" (default: Deadline)

**Empty States:**
- No goals: "Create your first savings goal" with illustration + "New goal" CTA
- No active goals (filter applied): "No active goals — achieved goals appear in Achieved tab"

#### 2. Goal Card (List Item)

**Anatomy:**
```
┌─────────────────────────────────────────────────────────────┐
│ [icon] New laptop                   [3-dot menu]            │
│ Target: 5,000 CCX     Deadline: Dec 31, 2026                │
│ ┌────────────────────────────────────────────────────────┐ │
│ │ ████████████░░░░░░░░░░░░░░░░ 60% saved                 │ │
│ └────────────────────────────────────────────────────────┘ │
│ 3,000 / 5,000 CCX saved                 $120.00 (USD)      │
│ +$500 this month                         on track ▲        │
│ [Contribute] [View details]                                │
└─────────────────────────────────────────────────────────────┘
```

**Elements:**
- **Icon/color badge:** User-chosen or default (lucide `target` icon in `#FFA500` primary)
- **Name + 3-dot menu:** Menu actions: "Edit", "Archive", "Delete" (delete only for archived goals; active goals must be archived first)
- **Target + deadline:** Deadline if set, else "No deadline"
- **Progress ring:** SVG circle with percentage fill (animated on mount), matches Deposits pattern
- **Saved amount + USD equivalent:** USD shown as secondary, optional (toggleable in settings)
- **Recent contribution:** "+$X this month" (or this week) — last 30 days contribution sum, localized time bucket
- **On-track status:** "on track" green up-arrow, "behind" orange down-arrow, or neutral dash if no deadline
- **Action buttons:** "Contribute" (primary, opens contribution dialog), "View details" (secondary, navigates to detail page)

**Hover State:** Subtle border lift, "Contribute" button pulses, progress ring glows

#### 3. Add/Edit Goal Form (`goals/new` modal or dedicated page)

**Modal Flow:** Triggered from "New goal" button, multi-step wizard:
1. **Step 1 — Basics:**
   - Name (text input, required, max 50 chars, placeholder: "e.g., Emergency fund")
   - Target amount (number input, required, min 0.000001 CCX, CCX suffix, validation: must be > 0)
   - Deadline (date picker, optional, min: today, clearable)

2. **Step 2 — Styling:**
   - Icon selector: Grid of 12 common icons (target, house, car, gift, plane, etc.) + emoji picker fallback
   - Color picker: Preset palette (6 warm neutrals matching `base-nova`: primary orange, teal, purple, pink, blue, gray) — single select

3. **Step 3 — Review:**
   - Summary card showing the goal as it will appear
   - "Create goal" primary button, "Back" secondary

**Edit Flow:** Same modal, pre-populated with existing goal data. If goal has contributions, disable target/decrement (only allow name/deadline/style edits to prevent breaking progress).

**Validation:**
- Name required, target > 0
- Deadline cannot be in the past (for new goals only; edit allows past for historical tracking)
- If editing target upward, show warning: "You'll need to save more to reach the new target"

**Form State:**
```typescript
interface GoalFormData {
  name: string;
  targetCcx: number;
  deadline: Date | null;
  icon: string | null;
  color: string | null;
}
```

#### 4. Goal Detail Page (`goals/[goalId]`)

**Layout:** Single goal view with two columns:
- **Left (60%):** Goal overview + contribution timeline
- **Right (40%):** Right-rail (same as landing, but scoped to this goal)

**Overview Section:**
- Large goal card (same anatomy as list, but expanded):
  - Progress ring larger (120px), centered
  - Achieved date shown if status is achieved
  - "Edit" and "Archive" actions
- Stats row:
  - "Saved: X CCX ($Y USD)"
  - "Remaining: X CCX ($Y USD)"
  - "Started: [date]"
  - "Contributions: N"

**Contribution Timeline:**
- Heading: "Contribution history"
- Timeline list (reverse chronological):
  - Each entry: date, amount, note (if any), "Edit note" / "Delete" actions (delete only allowed if goal not achieved)
- "Add contribution" button (top-right of list) — opens contribution dialog

**Achieved State (Goal with status `achieved`):**
- Confetti burst animation (one-time, plays on first load)
- Badge: "Achieved on [date]"
- "Archive this goal" CTA (dismisses from active view)
- Contribution history becomes read-only

#### 5. Contribution Dialog

**Trigger:** "Contribute" button on goal card or detail page

**Form:**
- Amount (number input, required, min 0.000001 CCX, max: remaining amount, CCX suffix)
- Note (optional text area, max 140 chars, placeholder: "e.g., From this week's savings")
- Quick presets: "$10 / $25 / $50 / $100" (convert to CCX via current market price)

**Action:** "Record contribution" (primary) — saves contribution, updates goal progress, shows success toast with progress bar

**Validation:**
- Amount must be > 0 and ≤ remaining amount (can't over-save beyond target)
- Show warning if contribution + saved exceeds target: "This will complete your goal!"

**Post-Contribution Flow:**
- Toast: "Contributed X CCX to [goal name]. You're Y% closer!"
- Progress ring animates to new percentage
- If goal achieved, trigger celebration and redirect to detail page with achieved state

### Right-Rail Content

**Landing Page Rail (Global):**
- **Section 1: At a Glance**
  - Stat: "Total saved across goals: X CCX ($Y USD)"
  - Stat: "Active goals: N" / "Achieved this month: N"
  - Stat: "Next deadline: [goal name] on [date]" (if any)

- **Section 2: Milestones**
  - "Streak: N days with contributions" — longest consecutive days with at least one contribution (across all goals)
  - "Top saver this month: [goal name]" — goal with most contributions in current month

- **Section 3: Quick Actions**
  - "Create a new goal" button
  - "View all contributions" button (links to a global contribution history page? or scroll to contribution sections)

**Detail Page Rail (Goal-Scoped):**
- **Section 1: Progress**
  - Progress ring (same as card)
  - "Remaining: X CCX" in bold
  - "On track to reach target by [deadline]" or "Save X CCX/month to stay on track"

- **Section 2: Projection**
  - Suggested contribution rate (calculated per projection logic):
    - "Contribute Y CCX/month to meet deadline"
    - Or "At current pace, you'll reach target in [months]"
  - "What if you contribute more?" slider (interactive prototype): "Add X CCX/month → achieve [N] months earlier"

- **Section 3: Deposits Integration**
  - "Fund this goal with a Deposit" CTA (links to `deposits/new` with goal context)
  - If goal has deposit-linked contributions: "X CCX locked in deposits for this goal"

**Rail Parts Reuse:**
- `RailSectionHeading` for section headers
- `RailStatRow` for stats (label + value)
- `RailMarketSection` (maybe not applicable here)
- Custom `ProgressRing` component (shared with Deposits)

## Progress & Projection Logic

### Progress Calculation

**Saved Amount:**
```typescript
saved = sum(contribution.amountCcx for contribution in goal.contributionHistory)
```

**Progress Percentage:**
```typescript
progressPercent = min(100, (saved / goal.targetCcx) * 100)
```

**Remaining Amount:**
```typescript
remaining = max(0, goal.targetCcx - saved)
```

### On-Track Definition

A goal is **on track** if, at the current rate of contribution, it will reach the target by the deadline.

**Contribution Rate Calculation:**
```typescript
// Rate = average contribution per week/month, based on historical velocity
const firstContributionDate = goal.contributionHistory[0]?.timestamp || goal.createdAt;
const weeksElapsed = max(1, (now - firstContributionDate) / (7 * 24 * 60 * 60 * 1000));
const monthsElapsed = weeksElapsed / 4.345; // Average weeks per month

const weeklyRate = saved / weeksElapsed;
const monthlyRate = saved / monthsElapsed;
```

**Projected Completion:**
```typescript
// Using the higher of weekly or monthly rate (optimistic) or average
const rate = max(weeklyRate, monthlyRate);

if (rate <= 0) {
  // No contributions yet or negative (shouldn't happen)
  projectedDate = Infinity; // Never projected
} else {
  const amountRemaining = goal.targetCcx - saved;
  const weeksRemaining = amountRemaining / weeklyRate;
  projectedDate = now + weeksRemaining * (7 * 24 * 60 * 60 * 1000);
}
```

**On-Track Status:**
```typescript
if (!goal.deadline) {
  return null; // No deadline → no on-track status
}

const weeksToDeadline = (goal.deadline - now) / (7 * 24 * 60 * 60 * 1000);

if (projectedDate <= goal.deadline) {
  return "on_track"; // Will reach before deadline
} else {
  return "behind"; // Will miss deadline
}
```

**Suggested Contribution Rate:**
```typescript
// What rate is needed to hit deadline?
const amountRemaining = goal.targetCcx - saved;
const weeksToDeadline = max(1, (goal.deadline - now) / (7 * 24 * 60 * 60 * 1000));

const requiredWeeklyRate = amountRemaining / weeksToDeadline;
const requiredMonthlyRate = requiredWeeklyRate * 4.345;

// Suggest whichever is more actionable (monthly is more intuitive for most users)
return {
  weekly: requiredWeeklyRate,
  monthly: requiredMonthlyRate
};
```

### On-Track UI Display

**On Track:**
- Status text: "On track to reach target by [deadline]" (green checkmark)
- Optional: "You're contributing X CCX/month ahead of schedule"

**Behind:**
- Status text: "Behind schedule — contribute X CCX/month to stay on track" (orange warning)
- Visual: Down-arrow icon, warm color accent

**No Deadline:**
- No on-track status
- Optional: "At your current pace, you'll reach this goal in [N] months" (calculated from rate)

### Edge Cases in Projection

1. **No contributions yet:** Rate = 0, projected = Infinity. On-track status = null (can't determine). Suggested rate based purely on remaining amount / deadline.

2. **Single contribution:** Treat as first data point. Rate = amount / time elapsed. May be volatile, but better than 0.

3. **Deadline already passed:**
   - If goal not achieved: "Deadline passed" badge, "Save X CCX to still complete" (no on-track status)
   - If goal achieved: "Achieved on [date]" (deadline irrelevant)

4. **Goal achieved:** Projection logic stops; status is permanently achieved.

## Edge Cases

### Target Reached / Exceeded

**Goal Achieved:**
- Status changes to `achieved` automatically when `saved >= targetCcx` (after a contribution)
- `achievedAt` is set to `now` (first time achieved)
- Contributions are still allowed (user can continue "saving" beyond target)
- Progress ring stays at 100%, "X% over target" shown as secondary text
- Confetti celebration plays once per goal (flag in goal metadata to avoid replay)

**Exceeded Target:**
- No upper limit on saved amount
- UI shows "X CCX over target" (positive framing)
- On-track status is irrelevant (goal complete)

### Deadline Passed Unmet

**Behavior:**
- Goal stays `active` (not auto-archived)
- Badge: "Deadline passed" in red
- On-track status shows "behind"
- Suggested rate recalculates as if deadline is now (i.e., "save remaining amount to complete")
- User can edit deadline to extend (if they want to keep the goal alive)
- Or archive/delete

### Goal Deleted

**Hard Delete:**
- Permanent removal from IndexedDB
- Only allowed for `archived` goals (active goals must be archived first to prevent accidental deletion)
- Confirmation dialog: "Are you sure? This cannot be undone."

**Soft Archive (Preferred):**
- Goal status changes to `archived`
- Removed from "Active" list, appears in "Archived" tab
- Can be restored (un-archived) by changing status back to `active`
- Contribution history preserved

### Multi-Wallet Scenarios

**Wallet Switching:**
- Goals are per-wallet (via `walletId`)
- Switching wallets loads only that wallet's goals
- Right-rail stats reflect active wallet only

**View-Only Wallets:**
- Goals are read-only (can't create/edit/contribute)
- Existing goals are visible but all actions disabled
- Clear UI cue: "This wallet is view-only — goals cannot be modified"

**Wallet Deletion:**
- When a wallet is deleted from the multi-wallet registry, all its goals should be deleted (or archived with a reference to deleted wallet)
- Cleanup: query by `walletId` and delete all

### Currency Display (CCX vs USD)

**CCX Primary:**
- All amounts in CCX with 6 decimal places (standard for the wallet)
- Use existing `formatCcx` utility

**USD Optional:**
- Toggle in settings: "Show USD equivalents" (default: off, to avoid overwhelming)
- USD fetched from market price (same service as Insights/Deposits)
- Displayed as secondary text in parentheses: "5,000 CCX ($120.00)"
- If market price unavailable, hide USD without breaking UI

### Spending Tracked Balance

**Scenario:** User manually contributes X CCX to a goal, then spends X CCX from their wallet balance.

**Behavior:**
- Goal progress is **unaffected** — manual contribution is bookkeeping, not a lock on funds
- This is the core trade-off: the goal is a tracker, not a vault. User can overspend against their goals.
- UI shows no warning (to avoid nagging), but the "Total saved across goals" right-rail stat may exceed actual wallet balance (users will notice this)
- Later (optional): "Check your balance" nudge if total saved > available balance (soft warning, not blocking)

### Duplicate Goals

**Prevention:**
- No enforcement — users may have multiple "Emergency fund" goals
- Each goal is independent

**Later Enhancement:** "Goal templates" or "Goal library" (pre-made goals like "3-month emergency fund") to avoid user duplication work

### Contribution Undo / Edit

**Contribution Deletion:**
- Allowed only if goal not `achieved` (to avoid breaking the achieved state)
- Confirmation dialog: "This will reduce your saved amount"
- After deletion, recalculate progress, update status if saved < target

**Contribution Edit:**
- Only note can be edited; amount cannot be changed (to prevent manipulation of progress history)
- If user wants to adjust amount, they must delete and re-add

### Backdating Contributions

**Allowed:**
- Contribution timestamp can be set to any date ≤ now (for historical tracking)
- Useful if user wants to record past savings activity
- Validation: timestamp cannot be in the future
- If backdated before goal creation, show warning but allow (edge case: user sets goal retroactively)

### Multiple Contributions on Same Day

**Allowed:**
- Multiple contributions allowed per day
- Contribution history lists all entries chronologically
- Rate calculation treats them as one data point (aggregated by time bucket)

## MVP vs Later

### MVP Scope (Ship First)

- **Core:** Goal creation (name, target, deadline, icon, color), manual contributions, progress tracking, achievement state
- **UI:** Goals landing page, goal card grid, detail page, contribution dialog, right-rail (global and goal-scoped)
- **Storage:** IndexedDB `goals` store with per-wallet isolation
- **Progress Logic:** Saved amount, progress percent, on-track status (simple rate calculation), suggested contribution rate
- **Integrations:** Deposits "Fund this goal" CTA (opens deposit new page, no automatic linking)
- **I18n:** All neutral UI strings localized to 10 locales (en/es/fr/de/it/pt/ru/zh/ja/ko); security copy stays English

### Later (Post-MVP Follow-Up)

- **Balance-Linked Tracking (Optional Mode):** "Auto-track" toggle where goal progress syncs to a slice of wallet balance (opt-in, clear disclosure, fragile illusion risk)
- **Deposit Linking:** Mark specific deposits as "funding goal X" — contribution entries auto-created from deposit principal + interest
- **Contribution Reminders:** Recurring "Add to [goal]" reminders via existing Reminders infrastructure
- **USD Toggling:** Settings toggle for USD display (MVP uses CCX only to keep scope tight)
- **Milestones & Streaks:** Enhanced right-rail with streak tracking, "Top saver" awards, achievement badges
- **Insights Integration:** Saving patterns analytics (monthly trends, goal completion rate) in Insights
- **Goal Templates:** Pre-built goal library (emergency fund, vacation, etc.) with suggested targets
- **Goal Export/Import:** JSON export/import for power users or migration
- **Social Share:** Anonymous goal card sharing (URL with read-only goal data)
- **Multi-Currency Goals:** Support for saving toward USD targets (requires frequent price conversion, adds complexity)

## Open Questions & Risks

1. **On-Track Rate Calculation Volatility:**
   - **Risk:** With few contributions, the rate calculation can be noisy (e.g., one large contribution skews everything).
   - **Mitigation:** Use a minimum threshold (e.g., require at least 2 weeks of contributions) before showing on-track status; fallback to a simple "at current pace" message without strong "on track/behind" label.
   - **Question:** Should we show a confidence interval (e.g., "70% confident you'll meet deadline")? Probably too complex for MVP.

2. **Manual Contribution vs. Reality Disconnect:**
   - **Risk:** Users may over-contribute to goals (saving more than they actually have) or under-contribute, leading to a disconnect between goal progress and actual wallet balance.
   - **Mitigation:** This is inherent to the manual bookkeeping model. Later, we can add a soft warning: "Your total saved across goals exceeds your available balance — consider your actual funds."
   - **Question:** Should we encourage users to sync contributions with actual sends/deposits? Maybe a "Mark this deposit as a contribution" flow in deposit detail view.

3. **Market Price Dependency for USD:**
   - **Risk:** If market price service fails, USD display breaks.
   - **Mitigation:** Gracefully hide USD without breaking CCX display; use same error handling as Insights.
   - **Question:** Should USD be MVP or later? We're marking it later to keep scope tight, but it's low-risk given existing market service.

4. **Achieved Goal Editing:**
   - **Question:** Should users be allowed to edit an achieved goal (e.g., change target after completion)? Our current model says no (status permanently achieved), but maybe a "extend goal" action (increase target, reset status to active) is useful.
   - **Decision:** Defer to later. MVP: achieved is final.

5. **Right-Rail Performance with Many Goals:**
   - **Risk:** Calculating global stats (total saved across goals, streak, etc.) could be expensive with hundreds of goals.
   - **Mitigation:** Cache computed stats in the Goal entity (update on save/load) or use a lightweight projection (simple sum, no complex queries).
   - **Question:** Should we use a derived stats table (like Insights does for monthly analytics)? Probably overkill for MVP; simple sum is fine.

6. **I18n Surface Area:**
   - **Risk:** Goal-related strings can multiply quickly (status messages, empty states, validation errors, on-track text).
   - **Mitigation:** Keep strings minimal; reuse existing patterns (e.g., "Invalid amount" from shared validation library).
   - **Question:** Should we localize on-track phrases like "You're contributing X CCX/month ahead of schedule"? Yes, but keep them simple and generic to avoid locale-specific grammar issues.

7. **Contribution Backdating Abuse:**
   - **Risk:** Users could backdate contributions to "game" the streak or rate calculation.
   - **Mitigation:** This is self-inflicted fraud; no real harm. Maybe add a "This backdated contribution won't affect your current streak" note if backdated > 1 week ago.
   - **Question:** Should we cap backdating to 30 days? Probably too restrictive.

8. **Multi-Wallet Goal Sync (Later):**
   - **Question:** If a user has multiple wallets, should goals be per-wallet or shareable across wallets? We chose per-wallet for simplicity, but a "shared goal" (e.g., "Family emergency fund" across two wallets) could be useful.
   - **Decision:** Defer to later. Per-wallet is the safe, clear choice for MVP.

9. **Deposits "Fund This Goal" Depth:**
   - **Question:** Should the deposit form pre-populate the goal target amount or just link via a query param? Our MVP uses a simple link (no pre-population), but pre-populating the deposit amount with the goal's remaining amount could be a nice UX touch.
   - **Decision:** Simple link is MVP; pre-population is later enhancement.

10. **Progress Ring Animation Performance:**
    - **Risk:** With many goals, animating all progress rings on page load could jank.
    - **Mitigation:** Use CSS animations with `will-change`, stagger animations, or only animate on first mount (not re-renders).
    - **Question:** Should we use the existing Deposits progress ring component? Yes, reuse is good — we just need to ensure it handles per-goal state cleanly.

---

**Next Steps for Orchestrator:**

1. Review this spec alongside Codex, Gemini, and the Opus 4.8 subagent specs.
2. Synthesize the best ideas into `spec-merged.md`, noting provenance for each decision.
3. Resolving forks: e.g., if another agent chose balance-linked tracking, weigh the trade-offs and document the final choice with rationale.
4. Once design phase completes, hand off to implementation with this spec as the reference truth.