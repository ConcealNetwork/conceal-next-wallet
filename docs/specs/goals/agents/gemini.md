# Goals Module Specification (Gemini)

## Product Summary
The Goals module is a local-first savings tracker living in the "Earn" section of the Conceal Next Wallet. It allows users to set target amounts for specific purposes (e.g., "New Laptop", "Emergency Fund") and track their progress over time. 

**Chosen Savings Model (MVP): Virtual Bookkeeping (Manual Contributions)**
For the MVP, we are using a **Virtual Bookkeeping** model. Goals act as "virtual envelopes." Users manually record contributions to a goal, which updates a device-local ledger in IndexedDB. 
*Rationale:* A non-custodial wallet cannot auto-move funds or restrict spending without creating on-chain transactions (like time-locked Deposits). Tying goals directly to the fluctuating available balance (Balance-linked) creates chaotic UX when regular spending causes goals to randomly regress. By making contributions a manual accounting exercise, we empower the user to consciously allocate their funds, mimicking the "envelope budgeting" method. To maintain reality, the wallet will flag an error state if the sum of all "saved" goal amounts exceeds the actual wallet balance (Available + Locked). In the future (Later), we will integrate with Deposits, allowing users to back a goal with a specific yield-generating time-lock.

## Prioritized User Stories
1. **As a user**, I want to create a new savings goal with a name, target amount, and optional deadline, so that I have a clear financial objective.
2. **As a user**, I want to manually record CCX contributions to my goal, so that I can see my progress increase over time without locking my funds on-chain.
3. **As a user**, I want to see a visual progress ring and completion percentage on a goal card, so that I feel motivated by my advancement.
4. **As a user**, I want to know if I am "on track" to hit my deadline, so that I can adjust my saving habits if I am falling behind.
5. **As a user**, I want the wallet to warn me if my total allocated goal funds exceed my actual wallet balance, so that my virtual accounting stays grounded in reality.
6. **As a user**, I want to set a Reminder to contribute to my goal regularly, so that I don't forget to save.

## Data Model & Storage
Goals are purely device-local metadata. They will be stored in a new IndexedDB store alongside Reminders and Check-ins. They do not round-trip to the service spine, ensuring full parity between mock and real engines.

**Storage Location:** `lib/storage/goals` (IndexedDB)
**Keying:** By `walletId` (to support multi-wallet architecture seamlessly).

**Goal Type Definition:**
```typescript
type GoalStatus = 'active' | 'achieved' | 'archived';

interface GoalContribution {
  id: string;          // uuid
  amount: string;      // CCX amount (string to preserve precision)
  timestamp: number;   // UNIX epoch
  note?: string;       // Optional memo ("Payday")
}

interface Goal {
  id: string;          // uuid
  walletId: string;    // Foreign key to the wallet
  name: string;        // e.g., "Emergency Fund"
  targetAmount: string; // Target CCX (string for precision)
  icon: string;        // Lucide icon name (e.g., 'Laptop', 'Car')
  color: string;       // Hex code or base-nova theme token
  deadline?: number;   // Optional UNIX epoch deadline
  contributions: GoalContribution[]; // History of manual additions
  status: GoalStatus;
  createdAt: number;
  updatedAt: number;
}
```

## UX / Screens & States

### 1. Goals Landing Page (`/earn/goals`)
*   **Empty State:** A warm, encouraging illustration with a primary CTA "Create your first goal".
*   **List State:** A responsive grid of **Goal Cards**.
*   **Total Allocation Banner:** A subtle header showing `Total Saved: X CCX / Total Wallet Balance: Y CCX`. If `X > Y`, it turns amber to indicate an over-allocation mismatch.

### 2. Goal Card Anatomy
*   **Header:** Icon + Color dot, Goal Name.
*   **Visualizer:** A circular progress ring (reusing the animated SVG from Deposits). Inside the ring: the percentage complete.
*   **Metrics:** `<Amount Saved> / <Target> CCX`.
*   **Status Indicator (if deadline exists):** A small pill: `On Track` (Green) or `Behind` (Amber) or `X days left` (Neutral).
*   **Actions:** Quick "Contribute" button (+ icon), and a "..." dropdown for Edit/Delete/Archive.

### 3. Add/Edit Goal Form (Modal/Sheet)
*   **Name:** Text input (max 30 chars).
*   **Target Amount:** CCX numeric input.
*   **Deadline:** Optional date picker.
*   **Customization:** Icon picker (Lucide subset) and Color picker (shadcn/ui theme swatches).

### 4. Contribute Flow (Modal)
*   Triggered from the card.
*   Input field for CCX amount.
*   Displays: "Current Progress: X → New Progress: Y".
*   "Add to Goal" primary button. (Purely updates local IDB, no network transaction).

### 5. Right Rail Context (`usePageRightRail`)
*   **Goals Rail:** Displays a consolidated list of active goals with mini linear progress bars (instead of rings to save space).
*   **Next Milestone:** Highlights the goal closest to completion to gamify/nudge the user to finish it.

## Progress & Projection Logic

**1. Progress Calculation**
```typescript
const savedAmount = goal.contributions.reduce((sum, c) => sum + Number(c.amount), 0);
const progressPercent = Math.min((savedAmount / Number(goal.targetAmount)) * 100, 100);
```

**2. "On Track" Projection**
If a goal has a deadline, we calculate the required daily run rate to hit the target.
*   `Remaining Amount = Target - Saved`
*   `Days Remaining = max(1, (Deadline - Today) / 86400000)`
*   `Required Daily Rate = Remaining Amount / Days Remaining`
*   `Actual Daily Rate = Saved Amount / max(1, (Today - CreatedAt) / 86400000)`

*Definition of "On Track":*
If `Actual Daily Rate >= Required Daily Rate`, the user is **On Track**.
If `Actual Daily Rate < Required Daily Rate`, the user is **Behind**.
*Nudge:* The UI translates `Required Daily Rate` into a readable format: "Save X CCX per week to stay on track."

## Edge Cases & Resolutions
*   **Target Exceeded:** If contributions push the saved amount over the target, cap the progress ring at 100%, change status to `achieved`, trigger a local confetti animation, and prompt the user to archive it. The card displays the exact over-saved amount.
*   **Deadline Passed Unmet:** Status pill turns red ("Missed"). The user is prompted via the right-rail to extend the deadline or adjust the target.
*   **Actual Wallet Balance Drops Below Saved Goals:** If the user sends CCX out of the wallet, making their actual balance lower than their virtual envelopes, the Goals page displays an Amber warning banner: "Your wallet balance is lower than your allocated goals. Adjust your goals to reflect your current balance."
*   **Goal Deleted:** Hard delete from IDB. Contributions are purged. Since funds were never actually locked, the wallet balance is completely unaffected.
*   **Multi-Wallet / View-Only:** Goals are keyed by `walletId`. Switching wallets loads a different set of goals. For view-only wallets, goals work identically (since it's just local metadata tracking, no signing is required to update a goal ledger).

## MVP vs. Later

**MVP Scope**
*   Device-local IndexedDB storage (`lib/storage/goals`).
*   Manual virtual bookkeeping (adding/removing from the ledger).
*   Goal Card UI with SVG progress rings.
*   Add/Edit/Delete forms.
*   Basic projection math (On Track / Behind) and suggested weekly contribution.
*   Over-allocation warning banner (comparing sum of goals to Total Balance).

**Later (Post-MVP)**
*   **Deposit-Backed Goals:** Allow linking a specific time-locked Deposit to a goal, automatically piping principal + interest into the goal's progress.
*   **Insights Integration:** Show a chart of goal progress over time in the Insights tab.
*   **Reminders Integration:** A toggle in the Add Goal form: "Remind me to save weekly", which automatically creates an entry in the Reminders store.
*   **Market Price Toggle:** Show equivalent fiat (USD) value beneath the CCX target using the existing market rate service.

## Open Questions / Risks
1.  **Mental Model Friction:** Will users understand the difference between a "Virtual Goal" (manual tracking) and a "Deposit" (actual locked funds)? The UI copy needs to heavily emphasize that goals are just personal trackers and funds remain liquid.
2.  **Over-allocation Resolution:** If the wallet balance drops below the total saved goals, should we force the user to reconcile (deduct from goals), or just leave the persistent amber warning? (Leaning towards just the warning to avoid forcing tedious data entry on the user).
3.  **Future Deposit Linking:** If a goal is later linked to a Deposit, what happens if the user withdraws the deposit early with a penalty? The goal progress logic will need to handle negative contribution events gracefully.
