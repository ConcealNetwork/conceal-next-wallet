# Goals Spec - Codex

## Product Summary + Chosen Savings Model

Goals adds a device-local savings tracker to Conceal Next Wallet's Earn section.
The MVP should use a manual contribution ledger: the user creates a named CCX
target, then explicitly logs amounts they want to count toward it. A goal is not
a vault, not a deposit, not a sub-account, and not an automatic transfer rule.
It never moves, reserves, locks, deposits, or sends CCX.

I am choosing manual contributions over balance-linked tracking because it is
the only model that does not imply custody semantics the wallet cannot enforce.
If the app cannot reserve funds, it should not display progress as if funds are
reserved. Balance context can still be shown beside the ledger so the user can
see when their bookkeeping no longer matches spendable CCX.

I am not choosing deposit-backed goals for MVP. Deposits are a strong later
integration, but starting there turns Goals into a deposit product instead of a
general savings tracker. The first version should work for any wallet, including
view-only wallets and users who never open a Deposit.

Implementation stance:

- Store goals in a new local IndexedDB store, scoped by wallet id.
- Do not add a ninth service to the wallet service spine.
- Do not infer goal progress from receives, sends, balances, or deposits.
- Use "logged toward goals" for aggregate labels.
- Use English consequence copy for no movement/no locking/no sending.
- Keep the UI calm: progress, pace, and one next step.

## Prioritized User Stories

### P0

1. As a wallet user, I want to create a named CCX target so that I can track a
   specific savings intention. The goal requires name and target, accepts an
   optional deadline/icon/color, starts active, and is stored for the active
   wallet id only.
2. As a wallet user, I want to log a contribution so that progress reflects my
   intent without any wallet action. The entry has positive CCX, date, optional
   note, edit/delete controls, and English copy that no CCX moves, locks,
   deposits, or sends.
3. As a wallet user, I want cards to show logged, target, remaining, and percent
   progress so that I can scan my goals quickly. Progress clamps visually at 100
   percent, overage is shown in text, and USD appears only as market context.
4. As a wallet user, I want deadline goals to show whether I am on track and
   what rate would reach the target so that I can decide my next action. The
   rate is advisory only and must not create a schedule or send flow.
5. As a wallet user, I want reached goals marked achieved and old goals
   archivable so that the active list stays focused. Achievement is automatic;
   archive and delete are explicit local metadata actions.

### P1

1. As a wallet user, I want goal totals beside Available, Withdrawable, Locked,
   and Total balances so that I can spot drift between the ledger and spendable
   CCX. Drift warnings never mutate progress.
2. As a wallet user, I want a goal to point me toward Deposits when useful so
   that I can explicitly choose an Earn action. Deposit confirmation remains
   separate, and view-only wallets do not get spend/deposit CTAs.
3. As a wallet user, I want an optional local reminder to review a goal so that
   I can maintain the habit without auto-send behavior.

### P2

1. As a wallet user, I want to link Deposits to a goal so that locked principal
   and interest can count toward long-term targets. Links are explicit and
   withdrawn/spent deposits stop counting.
2. As a wallet user, I want recent Insights flow data to inform suggestions so
   that pace guidance feels grounded. These suggestions remain estimates and
   never log progress automatically.

## Data Model + Storage/Keying

### Storage Choice

Create:

```text
lib/storage/goals-store.ts
```

Use IndexedDB. Goals are pure local UI metadata and should bypass the service
spine, like the BRIEF describes for Reminders, Check-ins, and Notes. The store
must be free of `wallet-core` imports and safe during static export.

Recommended layout:

```text
database: ccx-wallet-local-metadata
store: goals
keyPath: storageKey
indexes: walletId, walletId_status, walletId_updatedAt
```

If implementation finds an existing app-wide local metadata IndexedDB, add a
`goals` store there instead. The requirement is the wallet-scoped local store,
not the database name.

### Keying

Use:

```text
storageKey = `${walletId}:${goal.id}`
```

Use wallet id, not address:

- It matches the multi-wallet model.
- Non-active real wallets may be locked.
- The default wallet can use `"default"`.
- It prevents accidental sharing across wallets.

If wallet id cannot be resolved, block writes and show an error state.

### Types

Store CCX amounts as decimal strings normalized to 6 decimals; parse to atomic
units for calculations.

```ts
export type GoalStatus = "active" | "achieved" | "archived";

export type GoalContribution = {
  id: string;
  amountCcx: string;
  note?: string;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type GoalVisual = {
  color: "amber" | "green" | "blue" | "violet" | "rose" | "slate";
  icon: "target" | "piggy-bank" | "laptop" | "shield" | "home" | "sparkles";
};

export type Goal = {
  storageKey: string;
  id: string;
  walletId: string;
  name: string;
  targetCcx: string;
  deadline?: string;
  visual: GoalVisual;
  status: GoalStatus;
  contributions: GoalContribution[];
  createdAt: string;
  updatedAt: string;
  achievedAt?: string;
  archivedAt?: string;
};
```

Inline contributions are enough for MVP. A separate contribution store can come
later if real usage creates large ledgers.

### Validation

Goal name:

- required after trim
- max 60 characters

Target:

- required
- greater than 0
- max 6 decimals
- normalized CCX string

Deadline:

- optional
- UTC date boundary
- today or future on create
- removable on edit

Contribution:

- positive CCX
- max 6 decimals
- optional note max 120 characters
- date defaults to now

Status:

- active on create
- achieved when logged total >= target
- archived only by explicit action

### Store API

Expose async CRUD helpers for listing/getting/saving goals, archiving/restoring,
deleting, and adding/updating/removing contribution entries. Every read takes
`walletId`; every write preserves `walletId` and returns the next list, matching
the simple local-store ergonomics used by Reminders and Check-ins.

### Storage and Privacy Rules

- Never touch IndexedDB at module initialization.
- IndexedDB unavailable means show storage-unavailable UI and disable writes.
- Corrupt records are skipped, not fatal.
- Invalid amount records are ignored per goal, not globally.
- Do not sync, analyze, or write goal names to chain metadata.
- Do not include goals in backups unless the user explicitly exports local
  metadata.

## UX Screens/Card/Form/Rail

### Navigation and Route

Add Goals under Earn:

```text
Earn
  Deposits
  Goals
  Market
  Insights
```

Use lucide `Goal` or `Target`. Avoid `Lock` and `Vault`.

Route:

```text
app/(wallet)/wallet/goals/page.tsx
```

Page metadata:

```text
Goals | Conceal Wallet
```

Sidebar item should be creatable and open `/wallet/goals?new=1`.

### Page Layout

Use existing wallet UI patterns:

- `PageHeader`
- `SectionCard`
- shadcn/ui form controls
- lucide icons
- warm primary accent
- container-query grids
- `usePageRightRail(<GoalsRail />)`
- embedded rail fallback below 1200px

Header:

```text
Goals
Track local savings targets without moving or locking CCX.
```

### Summary and Empty State

Summary stats:

- Active goals
- Logged toward goals
- Remaining to targets
- On track

Use "Logged" in aggregate labels.

Empty state:

```text
No goals yet
Create a local target for something you are saving toward. Goals do not move,
lock, or send CCX.
```

Actions:

- New goal
- View deposits

Deposits is secondary.

### Goal Card

Each card shows:

- icon/color accent
- name
- target CCX
- progress ring or bar
- logged CCX
- remaining CCX
- optional USD equivalent
- deadline chip
- status chip
- one next-step line
- Log contribution
- Details/menu

Example:

```text
[target] New laptop                         [...]
5,000.000000 CCX target
[42% ring] 2,100.000000 logged
           2,900.000000 remaining
Dec 31, 2026        On track
Next: 68.25 CCX / week
[Log contribution] [Details]
```

Use a progress ring only if it fits the Deposits visual grammar; otherwise use a
bar. Clamp visual progress at 100 percent and show overage in text.

Status tones:

- on track: green/incoming
- behind or due soon: amber
- deadline passed: outgoing/red
- achieved: restrained success
- archived: muted

### Card Status and Next Step

Computed statuses:

```ts
type GoalComputedStatus =
  | "not-started"
  | "on-track"
  | "behind"
  | "due-soon"
  | "deadline-passed"
  | "achieved"
  | "archived";
```

Precedence:

1. archived
2. achieved
3. deadline passed
4. behind
5. due soon
6. on track
7. not started

Next-step line:

- "Log a first contribution"
- "Remaining: X CCX"
- "Keep roughly X CCX/week"
- "Needs X CCX/week"
- "Target reached"
- "Edit deadline or archive"

Show one nudge only. No streaks, confetti, points, or social sharing.

### Add/Edit Goal Form

Fields:

- Name
- Target amount (CCX)
- Deadline (optional)
- Icon
- Color

Defaults:

- icon: Target
- color: amber
- deadline: empty

Consequence copy:

```text
Goals are local trackers. They do not move, lock, deposit, or send CCX.
```

Edit rules:

- reducing target below logged total is allowed
- removing deadline removes pace status
- editing goal fields does not alter contribution history
- archive/restore are explicit

### Log Contribution Flow

Fields:

- Amount (CCX)
- Date
- Note (optional)

Primary button:

```text
Log contribution
```

Do not use a bare "Contribute" label.

Required English copy:

```text
This only records progress for this goal. It does not move, lock, deposit, or
send CCX. You can still spend these funds unless you take a separate confirmed
wallet action.
```

After success:

- toast "Contribution logged."
- update card immediately
- mark achieved if target is reached

### Detail, Achieved, and Archived States

Use an in-page dialog or sheet for MVP rather than a route.

Detail shows:

- progress header
- contribution history
- edit goal
- archive/restore
- delete local goal
- local tracker reminder

When achieved:

- set `status = "achieved"`
- set `achievedAt`
- keep visible in Active tab
- show a check icon and restrained success styling
- offer Archive and Keep tracking

Archived view:

- Active | Archived segmented control
- final logged amount
- target
- archived date
- restore
- delete

Delete copy:

```text
Delete this local goal? This removes its local contribution history only. No CCX
will move.
```

### Right Rail

Add:

```text
components/layout/rails/goals-rail.tsx
```

Sections:

- Goals summary
- Balance context
- Focus goal
- Earn action
- Market

Goals summary rows:

- Active goals
- Logged total
- Remaining total
- Achieved

Balance rows:

- Available
- Withdrawable
- Locked deposits
- Total balance

Warning:

```text
Logged goals exceed currently available and withdrawable CCX.
```

Focus goal priority:

1. deadline passed unmet
2. behind
3. due soon
4. nearest deadline
5. largest remaining

Earn action:

- "Explore deposits"
- only when wallet is not view-only
- routes to Deposits
- copy: "Deposits are separate confirmed actions. Goals do not lock funds."

Reuse `RailMarketSection(first={false})`.

### i18n Surface

Add a compact `goals.*` neutral string set to all 10 dictionaries: nav label,
title/subtitle, empty state, form labels, status labels, archive/restore/delete,
logged/target/remaining, and needed-per-week/month. Consequence copy can remain
English.

## Progress + Projection Logic

### Amounts and Saved Total

Use integer atomic units:

```text
1 CCX = 1,000,000 atomic units
savedAtomic = sum(parseCcxToAtomic(entry.amountCcx))
```

Wallet balance does not affect `savedAtomic`.

### Progress

```text
rawProgress = savedAtomic / targetAtomic
progressPct = rawProgress * 100
visualProgressPct = clamp(progressPct, 0, 100)
remainingAtomic = max(targetAtomic - savedAtomic, 0)
overageAtomic = max(savedAtomic - targetAtomic, 0)
```

Display the clamped visual, the true remaining amount, and overage when present.

### Deadline and Pace

Use UTC date boundaries:

```text
today = startOfUtcDay(now)
deadline = startOfUtcDay(goal.deadline)
daysLeft = floor((deadline - today) / 86_400_000)
daysForPace = max(daysLeft, 1)
requiredPerDayAtomic = ceil(remainingAtomic / daysForPace)
requiredPerWeekAtomic = requiredPerDayAtomic * 7
requiredPerMonthAtomic = ceil(requiredPerDayAtomic * 30.4375)
```

Show weekly pace when `daysLeft <= 60`; otherwise show monthly pace. No deadline
means no on-track/behind status.

### On-Track Definition

Use a linear plan from created date to deadline:

```text
totalPlanDays = max(daysBetween(createdAt, deadline), 1)
elapsedDays = clamp(daysBetween(createdAt, today), 0, totalPlanDays)
expectedRatio = elapsedDays / totalPlanDays
expectedSavedAtomic = floor(targetAtomic * expectedRatio)
paceBufferAtomic = max(floor(targetAtomic * 0.02), parseCcxToAtomic("1"))
onTrack = savedAtomic + paceBufferAtomic >= expectedSavedAtomic
behind = savedAtomic + paceBufferAtomic < expectedSavedAtomic
```

Reasoning:

- Linear is explainable and testable.
- A 2 percent or 1 CCX buffer avoids noisy warnings.
- MVP should not infer expected income from Insights.

### Status Rules

```text
achieved = savedAtomic >= targetAtomic
dueSoon = daysLeft >= 0 && daysLeft <= 14 && !achieved
deadlinePassed = daysLeft < 0 && !achieved
```

When achieved:

- persist `status = "achieved"`
- set `achievedAt` if missing

If edits drop progress below target:

- reopen as active
- toast that the goal reopened because logged progress is below target

### Aggregates and Drift

For non-archived goals:

```text
totalTargetAtomic = sum(goal.targetAtomic)
totalSavedAtomic = sum(goal.savedAtomic)
totalRemainingAtomic = sum(max(goal.targetAtomic - goal.savedAtomic, 0))
aggregateProgressPct =
  totalTargetAtomic > 0 ? min(totalSavedAtomic / totalTargetAtomic * 100, 100) : 0
```

Do not let one goal's overage reduce another goal's remaining amount.

Balance warning:

```text
loggedTotalAtomic = sum(savedAtomic for nonArchivedGoals)
spendableContextAtomic = wallet.available.atomic + wallet.withdrawable.atomic
warn = loggedTotalAtomic > spendableContextAtomic
```

Do not auto-correct progress.

### USD Context

```text
usd = ccx * market.price.value
```

Rules:

- secondary display only
- hide when price unavailable
- never store USD target in MVP
- price movement never changes CCX progress

## Edge Cases

- Target reached exactly: mark achieved, show 100 percent, remaining 0.
- Target exceeded: keep achieved, visual 100 percent, show overage.
- Contribution deleted after achievement: recompute and reopen if below target.
- Deadline passed unmet: keep active; offer edit deadline, log, or archive.
- Deadline today: if remaining > 0, show behind/due-soon and remaining today.
- No deadline: show progress and remaining only; no urgency label.
- Invalid target: block create/edit and do not persist.
- Tiny amounts: allow down to 0.000001 CCX; reject smaller precision.
- Negative contribution: reject in MVP; users edit/delete entries instead.
- Reduce progress: edit/delete entries; do not say "withdraw from goal".
- Goal deleted: remove local goal and ledger only; no wallet action.
- Wallet switch: show only active wallet id's goals.
- Wallet id missing: block writes and show session/storage error.
- View-only wallet: allow goals/logging; hide spend/deposit CTAs.
- User spends CCX after logging: progress stays; drift warning may show.
- Incoming receive equals goal amount: no auto-match in MVP.
- Deposit opened or withdrawn: no automatic goal change in MVP.
- IndexedDB unavailable: show storage unavailable and disable writes.
- Corrupt record: skip it; load the rest.
- Locale changes: user text stays as typed; UI/date/number formatting updates.
- Market unavailable: hide USD equivalents.
- Archived goal over target: archived status wins until restored.
- Multiple tabs: last write wins for MVP.
- Clock skew: projections use local device time.
- Panic wipe: goals should be cleared with local metadata.
- Wallet deletion: remove goals for that wallet id if cleanup hooks exist.

## MVP Scope

- Goals nav item under Earn.
- `/wallet/goals` page.
- `lib/storage/goals-store.ts` IndexedDB local store.
- Wallet-id scoped create/edit/archive/restore/delete.
- Manual contribution add/edit/delete.
- Goal cards with progress, remaining, deadline status, and one next step.
- Achieved state and Active/Archived view.
- Goals right rail and embedded fallback.
- Balance context and drift warning.
- Optional USD equivalents from market data.
- Neutral i18n strings across 10 locales.
- English no-movement/no-locking consequence copy.
- Unit tests for parser, progress, projection, status precedence, and storage
  validation.
- E2E smoke for create, log, archive, wallet switch scoping, and view-only.

## Later

- Explicit deposit-linked goals.
- Transaction action: "Log this receive toward a goal".
- Insights-based pace suggestions.
- Local recurring goal review reminders.
- Dedicated goal detail route.
- Projection chart.
- Local metadata export/import.
- Negative adjustment entries with accounting labels.
- Encrypted cross-device metadata sync if the app ever adds it.

## Open Questions / Risks

- Active wallet id source: confirm the right hook/helper before writing data.
- IndexedDB home: create a new metadata database or extend an existing one.
- Wallet cleanup: wallet delete and panic wipe need audit for goal cleanup.
- CCX parser ownership: add a wallet-core-free decimal-to-atomic parser if needed.
- Achieved history: decide whether reopening clears `achievedAt`.
