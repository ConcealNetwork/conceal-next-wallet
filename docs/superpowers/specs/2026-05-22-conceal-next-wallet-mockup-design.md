# Conceal Next Wallet — Mockup Recreation (Design & Build Plan)

Date: 2026-05-22
Status: Approved — ready for implementation

## Goal

Recreate the dummy UX mockup at `https://conceal-next-wallet.vercel.app` as a clean,
handoff-ready **Next.js App Router** project. Another developer must be able to wire a
real Conceal (CCX) backend into it by implementing a set of **typed service interfaces** —
without touching UI code.

This is a **UI mockup with mock data only**.

### Non-goals / safety (IMPORTANT)
- **No real cryptography, key generation, seed/mnemonic handling, key storage, or RPC.**
- Create / import / export screens operate on **placeholder strings only**. They neither
  generate, derive, validate, nor persist real keys.
- A real implementation MUST add genuine key security separately. State this prominently
  in the README. Do not add libraries that perform real wallet crypto.

## Stack
- Next.js 14 (App Router) + TypeScript (strict)
- Tailwind CSS + shadcn/ui (Radix primitives)
- TanStack Query v5 (data fetching hooks)
- recharts (price chart)
- react-hook-form + zod (forms)
- Geist font (next/font)
- Vitest + Testing Library (unit/component), Playwright (E2E)

## Repository
- Location: `~/Projects/conceal-next-wallet` (git initialized, no remote yet)
- Scaffold with `create-next-app` (TS, App Router, Tailwind, ESLint, src dir = no, app dir = yes)

---

## Architecture

### Backend seam — the single wiring point
```
lib/
  types/            domain models (see below)
  services/
    wallet.service.ts          interface WalletService
    transaction.service.ts     interface TransactionService
    market.service.ts          interface MarketService
    message.service.ts         interface MessageService
    deposit.service.ts         interface DepositService
    address-book.service.ts    interface AddressBookService
    network.service.ts         interface NetworkService
    settings.service.ts        interface SettingsService
    mock/                      mock implementations of each interface
    index.ts                   factory: returns active impl (env NEXT_PUBLIC_USE_MOCK, default mock)
  hooks/            TanStack Query hooks calling the active service
  mock-data/        seed fixtures (deterministic)
  utils/            formatCcx, formatUsd, truncateAddress, timeAgo, cn
```
- Every mock method: simulate ~300ms latency, return seeded data, and carry a
  `// TODO(backend): replace with real Conceal RPC/walletd call` comment.
- `lib/services/index.ts` is the ONLY place to swap mock → real.

### Domain types (`lib/types`)
- `CcxAmount` (store atomic units as number + helper format), `UsdAmount`
- `WalletInfo { address, balanceTotal, available, pending, lockedDeposits, staking, withdrawable, creationHeight, currentHeight }`
- `Transaction { id, type: 'receive'|'send'|'deposit'|'withdrawal', amount, address, timestamp, confirmations, paymentId?, message? }`
- `Deposit { id, amount, durationMonths, apr, interest, unlocksInDays, progressPct, address }`
- `Message { id, direction: 'received'|'sent', counterpartyName, counterpartyAddress, body, timestamp, unread }`
- `MarketData { price, change24hPct, volume24h, history: {date, price}[], portfolioValueUsd }`
- `AddressEntry { id, label, address, paymentId? }`
- `NodeStatus { url, height, peers, isCustom, version }`
- `WalletSettings { language, useCustomNode, nodeUrl, readMinorTx, autoLock, biometric }`

### Wallet session / lifecycle gating
- `WalletSessionProvider` (React context) with `{ status: 'locked' | 'open', walletInfo }`,
  persisted to `localStorage` (mock only).
- `app/(onboarding)/` — minimal layout, NO sidebar. Opening/creating/importing any (mock)
  wallet sets `status='open'` and routes to `/wallet/account`. If already open → redirect to wallet.
- `app/(wallet)/` — `WalletShell` layout (sidebar + footer). If `status!=='open'` → redirect to `/`.

### Routing map
```
app/
  (onboarding)/
    page.tsx                  Open Wallet landing ("Conceal Web Wallet v2")
    create/page.tsx
    import/page.tsx           hub: choose method
    import/mnemonic/page.tsx
    import/keys/page.tsx
    import/file/page.tsx
    import/qr/page.tsx
  (wallet)/
    layout.tsx                WalletShell (sidebar + footer)
    wallet/account/page.tsx
    wallet/market/page.tsx
    wallet/transactions/page.tsx
    wallet/send/page.tsx
    wallet/receive/page.tsx
    wallet/messages/page.tsx
    wallet/deposits/page.tsx
    wallet/address-book/page.tsx
    wallet/settings/page.tsx
    wallet/export/page.tsx
    wallet/change-password/page.tsx
    wallet/network/page.tsx
    wallet/donate/page.tsx
  (legal)/
    terms/page.tsx
    privacy/page.tsx
    support/page.tsx
```

---

## Design tokens (match live site)
- Background `zinc-950` (#0a0a0a); cards `zinc-900`/`#18181b`; borders `zinc-800`.
- Primary accent **amber `#F5A623`** (active nav = solid amber bg, black text; buttons amber).
- Semantic: incoming/positive = emerald-500; outgoing/negative = red-500; deposits = blue-400.
- Text: primary white, secondary `zinc-400`, muted `zinc-500`.
- Font: Geist. Headings bold, large (page title ~30px). Generous spacing, rounded-xl cards.
- Layout: fixed left sidebar ~260px, content max-width ~1200px, responsive (sidebar collapses to drawer on mobile).

## Shared components (`components/`)
`WalletShell`, `Sidebar` (nav items + bottom Settings/Donate/Disconnect), `Footer`
(© 2018-2025 Conceal.Network + Terms/Privacy/Support/Donate/Network Stats/GitHub),
`PageHeader` (title + subtitle + optional action), `StatCard`, `SectionCard`,
`AmountText` (colors by sign/type), `TransactionRow`, `FilterTabs`, `QrCode`
(use a QR lib, e.g. `qrcode.react`, rendering placeholder address), `CopyButton`,
`PriceChart` (recharts area), `EmptyState`, `Toggle`, form field primitives.

---

## Screen specifications (from live mockup)

### Sidebar (all wallet screens)
Title "Conceal Wallet". Nav (top): Account, Market, Transactions, Send, Receive, Messages,
Deposits, Address Book. Divider. Bottom: Settings, Donate, Disconnect. Active item = solid
amber pill, black text. Disconnect clears session → `/`.

### Account (`/wallet/account`) — "Account Overview"
Subtitle "Manage your CCX holdings and view transaction summary". Top-right "Refresh" button.
- 6 stat cards (3×2 grid): **Total Balance** (1250.50 CCX + "$56.2725 USD"), **Available**
  (634.75 CCX "Ready to spend"), **Pending** (15.75 CCX "Awaiting confirmation", clock icon),
  **Locked Deposits** (500.00 CCX "In time-locked deposits", lock icon), **Staking**
  (100.00 CCX "Earning rewards"), **Withdrawable** (734.75 CCX "Available for withdrawal").
- **Transaction Summary** card: "Recent Transactions: 5" / "Last Activity: 1h ago";
  row of Total Received +175.00 / Total Sent +75.00 / Total Deposits +200.00.
  **Recent Activity** list (Receive +100 green, Send 50 red, Deposit +200 green) +
  "View All Transactions →" button.
- **Market Summary** card: Current Price $0.045 / 24h Change +2.34% (green) /
  Portfolio Value $56.2725 / "View Full Market →".

### Market (`/wallet/market`) — "Market Data"
Subtitle "Conceal Network (CCX) market information". Refresh button.
- **Price Chart** card: "30-day CCX price trend", recharts area chart (blue line, light fill),
  y-axis $0.000–$0.060, x-axis dated ticks (Apr 22 … May 22).
- 3 cards: Current Price $0.0450, 24h Change +2.34% (green), 24h Volume $125,000.

### Transactions (`/wallet/transactions`) — "Transaction History"
Subtitle "Complete transaction history for your wallet".
- **Summary** card: Total Received +325.00 (green), Total Sent +175.00 (red),
  Total Deposits +700.00 (blue).
- Search input "Search transactions..." + "Show: 10 per page" select.
- **History** card: "8 transactions found", filter tabs (All / Received / Sent / Deposits /
  Withdrawals). Each row: type icon + label, truncated address, amount (colored),
  time ago, confirmations badge ("12 conf").

### Send (`/wallet/send`) — "Send CCX"
Subtitle "Transfer Conceal Coins to another address". Two columns.
- Left **Send Transaction** card: Destination Address (placeholder "ccx7 ...", helper
  "Enter the recipients CCX address (98 characters starting with ccx)"), Amount to Send
  (0.00, "Amount in CCX"), Payment ID (Optional, "64 character hex string"), Message
  (Optional textarea, "max 255 characters"), Send button. Validate with zod (mock submit → toast).
- Right column: **Deposit** card (your address, Copy Address + Open Receive buttons, QR);
  **Recently Sent** card ("Last 5 outgoing transactions", rows: truncated addr, date, -amount red).

### Receive (`/wallet/receive`) — "Receive CCX"
Subtitle "Share your address or QR code to receive funds". Two columns.
- Left **Your Wallet Address** card: address box + copy icon, large QR, caption.
  **Advanced QR Generator** collapsible ("Show") — optional amount/payment-id/message → regen QR.
- Right: **Recently Received** ("Last 5 incoming", green +amounts, "View all transactions" amber link);
  **Deposit History** ("Last 5 deposits", blue +amounts).

### Messages (`/wallet/messages`) — "Messages"
Subtitle "Your message history". Top-right "+ New Message". Master-detail.
- Search "Search messages..." + "Show: 10 per page". Filter tabs: All / Received (badge "2") / Sent.
- Left list: avatar (initial), name, truncated ccx address, snippet, time ago, "New" badge +
  amber left-border + dot for unread.
- Right detail pane: empty state (mail icon, "No message selected", "Select a message…");
  selecting shows full message. New Message opens compose modal (recipient/message, mock send).

### Deposits (`/wallet/deposits`) — "Deposits"
Subtitle "Create time-locked deposits and track returns".
- 3 cards: Total Locked 7.500000 CCX, Active Deposits 2, Est. Interest 0.178000 CCX.
- "+ Create New Deposit" button (opens modal: amount + duration → mock create).
- **Active Deposits** list: each row "Unlocks in N days" + lock icon, APR (amber, right),
  Wallet (truncated) / Amount / Duration / Est. Interest columns, Progress bar (amber) + %.

### Address Book (`/wallet/address-book`) — "Address Book"
Subtitle "Save and manage frequently used addresses". "+ Create New" button.
- Empty state: "No addresses saved yet" / "Add your first CCX address to get started".
- Create New → modal (label + address + optional payment id). When entries exist: list of
  cards with label, address, copy, edit, delete.

### Settings (`/wallet/settings`) — "Settings"
Subtitle "Change your parameters here". Two columns of cards.
- **Language** (select, English). **Optimization** ("Optimize Now" amber button).
  **Node Settings** (toggle "Use custom node", Node URL input placeholder
  "https://node.conceal.network:16000/", Update). 
- **Wallet-Related Settings** (toggle "Read minor transactions (only for solo mining)",
  Creation height 1971774 / Current height 1971337 inputs, buttons Update / Change password /
  Reset & rescan / **Delete wallet** (red)). **Security** (Auto-lock wallet toggle,
  Biometric authentication toggle, Change Password button).
- "Change password" / "Change Password" buttons route to `/wallet/change-password`.
  "Delete wallet" → confirm dialog → clears session → `/`.

### Export (`/wallet/export`)
Backup screen: show (placeholder) mnemonic seed words + spend/view keys with reveal/copy,
"Download backup" (mock). Prominent warning banner that this is mock data.

### Change Password (`/wallet/change-password`)
Form: current / new / confirm, zod validation, mock submit → toast → back to settings.

### Network (`/wallet/network`) — node/network stats
Cards: node URL, block height, peers, version, sync status. Mock data via NetworkService.

### Donate (`/wallet/donate`)
Conceal donation address + QR + suggested amounts (mock).

### Onboarding
- **Open Wallet landing (`/`)**: "Conceal Web Wallet v2 — The next generation wallet is here",
  primary actions: Open Wallet, Create Wallet, Import Wallet; Discord link; footer.
- **Create (`/create`)**: name + password fields, "generate" shows placeholder mnemonic to
  confirm → opens session.
- **Import hub (`/import`)**: 4 cards → Mnemonic / Keys / File / QR.
  - Mnemonic: 25-word textarea (placeholder). Keys: spend+view key inputs. File: file picker
    (accept .wallet, mock parse). QR: "scan" placeholder. All → mock open session.

### Legal (`/terms`, `/privacy`, `/support`)
Simple static content pages with the footer; reachable from the footer links.

---

## Testing
- Vitest: `utils` (formatCcx, truncateAddress, timeAgo), each mock service returns valid typed data.
- Component tests: StatCard, AmountText (sign→color), TransactionRow, FilterTabs, Sidebar active state.
- Playwright E2E golden path: open wallet → account renders balances → navigate Send → fill form →
  submit (toast) → Receive shows address/QR → Disconnect → back at landing.
- Target ~80% on `lib/` logic; presentational components lighter.

## Build sequence (phases for Codex)
1. Scaffold create-next-app + Tailwind + shadcn init + Geist + base config; commit.
2. Design tokens (tailwind theme, globals.css), `lib/utils`, domain `types`.
3. Service interfaces + mock implementations + mock-data + factory + TanStack Query provider/hooks.
4. WalletSessionProvider + route groups + redirects + WalletShell (Sidebar + Footer).
5. Authenticated screens in order: account, market, transactions, send, receive, messages,
   deposits, address-book, settings, export, change-password, network, donate.
6. Onboarding screens (landing, create, import + 4 methods) + legal pages.
7. Tests (unit/component/E2E). README with backend-wiring guide + mock-only safety warning.
8. `npm run build` + lint + tests all green.

## Definition of done
- `npm run build`, `npm run lint`, `npm test`, Playwright E2E all pass.
- Every screen above present and visually faithful to the live mockup (dark + amber).
- Swapping one factory in `lib/services/index.ts` is the only step to point at a real backend.
- README documents the service seam and the mock-only / no-real-crypto warning.
