# BRIEF — "Goals" feature (savings goals) for Conceal Next Wallet

You are one of several independent specs being written in parallel. Produce YOUR best,
opinionated spec for a new **Goals** module. The orchestrator will synthesize the best
ideas across all specs, so take clear positions and note your reasoning where you fork
from the obvious.

## The product
Conceal Next Wallet — a Next.js (App Router, React 19, static export) in-browser CCX
wallet. Non-custodial; the wallet **never moves funds automatically** — every send is a
user-confirmed, irreversible action. There's a typed service layer (8 services) for
wallet/chain data, but **purely-local UI metadata bypasses it** and lives in
device-local IndexedDB stores (this is how Reminders, Check-ins, and per-tx Notes work —
see "patterns" below).

## The feature (what the user asked for)
A **Goals** module in the left-sidebar **"Earn"** section (which today holds Deposits,
Market, Insights). The core idea: **the user sets a savings goal and tracks progress
toward it.** e.g. "New laptop — 5,000 CCX by Dec 2026", "Emergency fund — 20,000 CCX".
The wallet shows how close they are and (optionally) an ETA / what's needed to stay on
track. Think personal-finance "savings goal" / envelope budgeting, adapted to a
self-custody crypto wallet.

## Hard constraints (respect these)
- **No auto-movement of funds.** A goal is a *tracker*, not a vault — the wallet can't
  silently lock/move CCX. Any "contribute" must be either (a) pure bookkeeping the user
  records, or (b) an explicit user-confirmed action (e.g. opening a Deposit), never
  automatic. Be explicit about which model you choose and why.
- **Device-local.** Goals are personal metadata, not on-chain. They should persist in a
  local IndexedDB store (like Reminders/Check-ins), keyed per wallet id (the app is
  multi-wallet). They do NOT need to round-trip the chain. Decide whether Goals are a new
  local store (preferred, like check-ins) or a 9th service (only if you can justify
  mock/real parity needs).
- **Mock + real parity.** If you DO route anything through the service spine, it must work
  in both mock and real engines. Prefer local-store to avoid that cost.
- **i18n:** all neutral UI strings localize to 10 locales (en/es/fr/de/it/pt/ru/zh/ja/ko);
  security/consequence copy stays English. Don't invent a huge string surface.
- **Static export, no backend.** No server, no push from a server. Any "notification" must
  piggyback on the existing in-app/OS-notification mechanisms (Reminders/Check-ins already
  do due-date alerts locally).
- **Design system:** shadcn/ui (`base-nova`), warm palette, primary `#FFA500`, the
  contextual right-rail pattern, lucide icons. Don't invent new visual language.

## Existing patterns to build on (ground your spec in these)
- **Local-store modules** (`lib/storage/*` + a page): **Check-ins** (`lib/check-ins` →
  `listWatchers`/`saveWatcher`, a `check-ins/page.tsx`, device-local, per-wallet, due-date
  alerts via a hook) and **Reminders/Scheduled** (recurring payment reminders;
  device-local; "your keys never auto-send — you'll be prompted to review"). Goals should
  feel like a sibling of these.
- **Deposits** (`deposits/`): time-locked CCX earning interest (tiers, APR, maturity,
  withdraw). A goal could *optionally* relate to deposits (e.g. "fund this goal by opening
  a deposit", or "this locked deposit counts toward the goal").
- **Insights** (`insights/`): device-computed analytics (in/out, net flow, monthly).
  Goal progress could draw on the same flow data.
- **The right rail** (`usePageRightRail`): every page can register a contextual rail; e.g.
  a Goals rail could show overall progress / next milestone.
- **Right-rail stat parts**, progress rings (deposits has an animated SVG ring), the
  account balance breakdown (Available/Locked/Pending/Withdrawable).

## Questions YOUR spec must take a position on
1. **What counts as "saved toward a goal"?** Options to weigh: (a) **manual contributions**
   the user logs (bookkeeping, like a piggy-bank ledger); (b) **balance-linked** — a goal
   tracks a slice of the wallet's Available/Locked balance (auto-progress as balance
   grows, no manual entry); (c) **deposit-backed** — a goal is fulfilled by one or more
   time-locked Deposits (progress = deposit principal + accrued interest); (d) a hybrid.
   Pick one as the MVP and justify; note which others are "later".
2. **Progress + projection:** progress %, amount remaining, and — if a deadline is set —
   on-track/behind status and a suggested contribution rate (per week/month). How do you
   compute "on track" without auto-movement?
3. **Data model:** the Goal shape (id, name, target CCX, optional deadline, optional
   icon/emoji/color, contributions or links, createdAt, status active/achieved/archived).
   Where it's stored and how it's keyed per wallet.
4. **UX / screens:** the Goals page (list of goal cards w/ progress ring), the add/edit
   goal form, the contribute/update flow, the achieved state (celebration?), and the
   right-rail content. Sketch the card + form fields.
5. **Motivation/feel:** how does it stay tasteful (not gamified slop)? Milestones?
   Streaks? A single "next step" nudge? Keep it classy and on-brand.
6. **Integrations:** relationship to Deposits (the obvious earn vehicle), Insights (flow),
   Reminders (a recurring "add to goal" nudge?), and the account balance.
7. **Edge cases:** target reached/exceeded, deadline passed unmet, goal deleted,
   multi-wallet (goals per wallet vs shared), view-only wallets, currency display (CCX 6dp;
   optional USD via market price), what happens if the user spends the balance a
   balance-linked goal was tracking.
8. **MVP vs later:** draw a crisp line. What ships first (small, shippable, useful) vs
   what's a follow-up. Bias the MVP toward the simplest model that's genuinely useful.

## Output
Write a single markdown spec to `docs/specs/goals/agents/<yourname>.md` containing:
- **One-paragraph product summary** + the savings model you chose (and why).
- **User stories** (As a … I want … so that …), prioritized.
- **Data model** (the Goal type + storage location/keying).
- **UX**: screens/states, the goal-card anatomy, the add/edit form fields, the rail.
- **Progress + projection logic** (formulas, "on track" definition).
- **Edge cases** + how each resolves.
- **MVP scope** (a short bullet list) vs **Later** (a short bullet list).
- **Open questions / risks** for the orchestrator.
Be concrete and opinionated. ~400–700 lines of thoughtful spec, not filler.
