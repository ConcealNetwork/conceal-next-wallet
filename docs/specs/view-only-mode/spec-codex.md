# View-Only Mode Implementation Spec

## Goal

Make imported watch-only wallets a first-class state across the typed service layer and UI. A wallet with no private spend key should be visibly marked as view-only, should continue to support read-only wallet features, and should block all operations that require signing with a private spend key before they reach the legacy transaction builder.

The implementation must not modify `lib/wallet-core`. The legacy core already represents view-only wallets with an empty private spend key in `Wallet.isViewOnly()` (`lib/wallet-core/Wallet.ts:298-300`), and current import flows already create that shape for key imports and QR imports (`lib/wallet-core/wallet-operations.ts:141-148`, `lib/wallet-core/wallet-operations.ts:206-212`). Treat those files as read-only dependencies.

## 1. Data Model Change

Add a required boolean to the public wallet model:

```ts
export type WalletInfo = {
  address: string;
  isViewOnly: boolean;
  balanceTotal: CcxAmount;
  available: CcxAmount;
  dust: CcxAmount;
  pending: CcxAmount;
  lockedDeposits: CcxAmount;
  withdrawable: CcxAmount;
  ...
};
```

Place it in `lib/types/index.ts` next to `address` (`lib/types/index.ts:9-28`). Make it required, not optional, so every mock, real, and test fixture is forced to account for the mode. The type change should be the only shared model change needed; `ImportWalletInput` already has `viewOnly: boolean` for key imports (`lib/services/wallet.service.ts:17-35`).

Do not add a second mode enum yet. This feature has exactly two states from the current engine perspective: spend-capable and view-only. A boolean maps directly to `Wallet.isViewOnly()` and keeps downstream checks simple.

## 2. Service Layer: Real and Mock

### Real Service

Keep all real-mode changes in `lib/services/real/*`, even though the mode is derived from the legacy runtime wallet. `lib/services/real/wallet.service.ts` is currently a thin wrapper around wallet operations (`lib/services/real/wallet.service.ts:16-67`). Add a local post-processing helper there:

```ts
async function withViewOnly(info: Promise<WalletInfo>): Promise<WalletInfo> {
  const walletInfo = await info;
  const { getRuntimeWallet } = await import("@/lib/wallet-core/wallet-runtime");
  const wallet = getRuntimeWallet();
  return { ...walletInfo, isViewOnly: wallet?.isViewOnly() ?? false };
}
```

Then wrap every real wallet-service method that returns `WalletInfo`:

- `getWalletInfo()`: `return withViewOnly((await walletOps()).getWalletInfoOperation())` (`lib/services/real/wallet.service.ts:17-19`).
- `refreshWallet()`: wrap `refreshWalletOperation()` (`lib/services/real/wallet.service.ts:20-22`).
- `openWallet()`: wrap `unlockStoredWallet(...)` after the password check (`lib/services/real/wallet.service.ts:27-32`).
- `finalizeCreateWallet()`: wrap `finalizeWalletCreationOperation(...)` (`lib/services/real/wallet.service.ts:36-38`).
- `importWallet()`: wrap `importWalletOperation(input)` (`lib/services/real/wallet.service.ts:45-47`).

This avoids editing `lib/wallet-core/mappers.ts`, while still deriving from the authoritative engine state. It is also reload-safe: stored view-only wallets deserialize with the empty private spend key, the runtime wallet reports `isViewOnly()`, and the service returns a fresh `WalletInfo` copy. No separate persisted UI flag is required.

### Mock Service

Add `isViewOnly: false` to `mockWalletInfo` in `lib/mock-data/wallet.ts` (`lib/mock-data/wallet.ts:22-43`).

Then make the mock wallet service keep the current mock wallet mode in module state while still returning cloned objects. Today `importWallet` ignores its input and always returns `mockWalletInfo` (`lib/services/mock/wallet.service.ts:39-43`). Change it to honor key imports:

```ts
let currentWalletInfo = clone(mockWalletInfo);

function setCurrentWalletInfo(next: WalletInfo) {
  currentWalletInfo = clone(next);
}

function currentWallet(): WalletInfo {
  return clone(currentWalletInfo);
}
```

Use `currentWallet()` in `getWalletInfo`, `refreshWallet`, `openWallet`, `finalizeCreateWallet`, and `importWallet` (`lib/services/mock/wallet.service.ts:6-44`). On `importWallet({ method: "keys", viewOnly: true, address })`, return a new wallet object with:

- `isViewOnly: true`
- `address: input.address || mockWalletInfo.address`
- all balance/deposit fields copied from the mock fixture

On non-view-only imports, open, create, or finalize, reset to a copied `{ ...mockWalletInfo, isViewOnly: false }`. Do not mutate `mockWalletInfo`; the brief requires immutability, and tests should be able to compare fixtures without state leakage.

### Last-Resort Operation Guards

The visible UI should block view-only actions, but the service layer should also prevent accidental programmatic calls from reaching `createTx`.

Add a small shared helper outside `wallet-core`, for example `lib/services/view-only.ts`:

```ts
import type { WalletInfo } from "@/lib/types";

export class ViewOnlyWalletError extends Error {
  constructor(message = "This is a view-only wallet. Import the spend key to send CCX.") {
    super(message);
    this.name = "ViewOnlyWalletError";
  }
}

export function assertCanSpend(wallet: Pick<WalletInfo, "isViewOnly">, message?: string) {
  if (wallet.isViewOnly) throw new ViewOnlyWalletError(message);
}
```

Use it in mock transaction/deposit/message services before returning successful writes, because those mock services currently always allow sending, deposit creation, withdrawal, and message sending (`lib/services/mock/transaction.service.ts:12-28`, `lib/services/mock/deposit.service.ts:33-61`, `lib/services/mock/message.service.ts:11-29`). In mock mode, have these services call `mockWalletService.getWalletInfo()` or a tiny exported `getMockWalletInfoSnapshot()` from `lib/services/mock/wallet.service.ts`.

For real mode, guard in typed real services before delegating into wallet operations:

- `lib/services/real/transaction.service.ts`: call the guard at the start of `sendTransaction()` before `sendTransactionOperation(input)` (`lib/services/real/transaction.service.ts:10-16`).
- `lib/services/real/deposit.service.ts`: call the guard at the start of `createDeposit()` and `withdrawDeposit()` before their wallet-operation delegates (`lib/services/real/deposit.service.ts:26-31`).
- `lib/services/real/message.service.ts`: call the guard at the start of `sendMessage()` before `sendMessageOperation(input)` (`lib/services/real/message.service.ts:10-16`).

The real guard can use the same runtime derivation as `withViewOnly`, but should live outside `lib/wallet-core`, for example in `lib/services/real/view-only-runtime.ts`:

```ts
import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import { assertCanSpend } from "@/lib/services/view-only";

export async function assertRealWalletCanSpend(message: string) {
  await ensureAllWalletLegacyLibs();
  const { getRuntimeWallet } = await import("@/lib/wallet-core/wallet-runtime");
  const wallet = getRuntimeWallet();
  assertCanSpend({ isViewOnly: wallet?.isViewOnly() ?? false }, message);
}
```

These guards block before the known spend-key paths: regular send creates a transaction (`lib/wallet-core/wallet-operations.ts:409-425`), message send creates a transaction (`lib/wallet-core/wallet-operations.ts:492-513`), deposit create creates a transaction (`lib/wallet-core/wallet-operations.ts:651-671`), and deposit withdraw creates a withdrawal transaction (`lib/wallet-core/wallet-operations.ts:721-740`).

## 3. UI/UX Placement and Disable Behavior

### Global Badge

Show the badge in the persistent wallet chrome, not only on protected pages. The best placement is in `components/layout/sidebar.tsx` beside the "Conceal Wallet" label (`components/layout/sidebar.tsx:190-209`) and mirrored in the mobile header beside "Conceal Wallet" (`components/layout/sidebar.tsx:265-277`). Use the existing `Badge` component from `components/ui/badge.tsx` and `useWalletInfo()` from `lib/hooks/index.ts` (`lib/hooks/index.ts:28-36`).

Badge text: `View-only`

Tooltip or accessible label: `View-only wallet: receiving, syncing, history, deposits viewing, and messages reading are available; sending and withdrawals are disabled.`

This placement makes the state visible while browsing receive, transactions, deposits, messages, settings, and export pages. It also avoids adding badges independently to every page header.

### Shared Copy

Add all new user-facing strings to `lib/ui/wallet-copy.ts` (`lib/ui/wallet-copy.ts:3-69`):

- `viewOnlyBadge: "View-only"`
- `viewOnlyDescription: "This wallet has no spend key. You can receive, sync, and inspect history, but sending, deposits, withdrawals, and message sending are disabled."`
- `viewOnlySendDisabled: "This is a view-only wallet. Import the spend key to send CCX."`
- `viewOnlyDepositDisabled: "This is a view-only wallet. Creating or withdrawing deposits requires the spend key."`
- `viewOnlyMessageDisabled: "This is a view-only wallet. Import the spend key to send messages."`

Use the exact same strings in UI disabled explanations and service guard errors, so unit and e2e tests can assert stable copy.

### Send Page

`app/(wallet)/wallet/send/page.tsx` already reads `wallet.data` (`app/(wallet)/wallet/send/page.tsx:74-91`) and disables the submit button for pending, self-send, and syncing (`app/(wallet)/wallet/send/page.tsx:286-292`). Add:

```ts
const isViewOnly = wallet.data?.isViewOnly === true;
```

Behavior:

- Keep the page route accessible. Do not redirect; a user may land from a payment link and should see why they cannot spend.
- Disable destination, amount, payment ID, message, QR scan, address-book picker, Max, `Review Send`, and confirm buttons when `isViewOnly` is true.
- Clear or suppress any auto-open review caused by payment links when `isViewOnly` is true. The current payment-link effect can call `setReview(values)` (`app/(wallet)/wallet/send/page.tsx:110-136`); gate that branch and toast `walletCopy.viewOnlySendDisabled` instead.
- Show a non-dismissed inline notice directly below the `PageHeader` and above `WalletSyncingBanner` (`app/(wallet)/wallet/send/page.tsx:170-174`).
- `confirmSend()` should return early with `toast.error(walletCopy.viewOnlySendDisabled)` if `isViewOnly` is true (`app/(wallet)/wallet/send/page.tsx:158-168`).

### Deposits Page

`DepositsPageClient` reads deposit constraints but not wallet info today (`app/(wallet)/wallet/deposits/deposits-page-client.tsx:88-109`). Add `useWalletInfo()` and compute `isViewOnly`.

Behavior:

- Keep the page accessible because viewing active, unlocked, withdrawn, projected, and historical deposits is read-only.
- Disable "Create New Deposit" in the page header and empty state when `isViewOnly` is true (`app/(wallet)/wallet/deposits/deposits-page-client.tsx:124-140`, `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1187-1211`).
- Do not open `CreateDepositDialog` when `isViewOnly` is true; if the button path is triggered anyway, toast `walletCopy.viewOnlyDepositDisabled`.
- Pass `isViewOnly` into `DepositWithdrawButton` from card/table/timeline render sites (`app/(wallet)/wallet/deposits/deposits-page-client.tsx:833`, `app/(wallet)/wallet/deposits/deposits-page-client.tsx:934`, `app/(wallet)/wallet/deposits/deposits-page-client.tsx:1008`).
- In `DepositWithdrawButton`, render the existing button disabled for view-only even when `canWithdrawDeposit(deposit)` is true (`app/(wallet)/wallet/deposits/deposits-page-client.tsx:1043-1093`).
- Keep deposit details, progress charts, calculator, list view switcher, and status pills enabled.

Prefer a single inline notice near the top of the page:

`This view-only wallet can track deposits, but creating deposits and withdrawing matured deposits require the spend key.`

### Messages Page

`MessagesPage` already reads wallet info and sync status (`app/(wallet)/wallet/messages/page.tsx:59-65`). Add `isViewOnly`.

Behavior:

- Keep the route accessible and keep the inbox/search/thread reading flow enabled (`app/(wallet)/wallet/messages/page.tsx:248-358`).
- Disable `New Message` when `isViewOnly` is true (`app/(wallet)/wallet/messages/page.tsx:250-263`).
- Disable reply textarea and reply send button when `isViewOnly` is true (`app/(wallet)/wallet/messages/page.tsx:322-345`).
- If `sendReply()` or `sendCompose()` are called anyway, return early and toast `walletCopy.viewOnlyMessageDisabled` (`app/(wallet)/wallet/messages/page.tsx:176-246`).
- Keep `markRead` working because it does not require a spend key and only updates local read state (`app/(wallet)/wallet/messages/page.tsx:162-170`; service contract in `lib/services/message.service.ts:13-17`).
- If the compose dialog is already open and the wallet state flips to view-only after refresh/switch, close it and reset compose state.

The reply placeholder should become `View-only wallet: replies require the spend key.` when `isViewOnly` is true, instead of the current address-book-only explanation (`app/(wallet)/wallet/messages/page.tsx:323-335`).

### Navigation

Do not remove or hide Send, Deposits, or Messages from the sidebar. The sidebar currently lists those routes as normal navigation items (`components/layout/sidebar.tsx:49-58`). Keeping them visible teaches users what is unavailable and allows read-only parts of deposits/messages to remain accessible.

## 4. Edge Cases

- **Reload after importing view-only:** must still show the badge. Real mode derives from the runtime wallet in the real service wrapper; mock mode must keep enough current mock state for `getWalletInfo()` after `openSession()` and route navigation.
- **Switching wallets/importing full wallet after view-only:** mock `importWallet`, `openWallet`, and `finalizeCreateWallet` must reset `isViewOnly` to false for non-view-only flows. Real mode derives per runtime wallet, so no UI cache should override service data.
- **Query placeholder data:** `useWalletInfo()` uses session `walletInfo` as placeholder data (`lib/hooks/index.ts:28-35`). Ensure `openSession(wallet, "/wallet/account")` receives the new flag from import flows (`app/(onboarding)/onboarding-actions.tsx:391-407`), or the first render after import may briefly omit the badge.
- **Payment links:** send page currently auto-loads payment links and may open review (`app/(wallet)/wallet/send/page.tsx:110-136`). View-only must block review and show copy, not leave a confirm dialog open.
- **Deposits read vs write:** listing deposits, projections, APR displays, maturity state, and calculator stay enabled. Create and withdraw are disabled because both produce signed transactions (`lib/wallet-core/wallet-operations.ts:619-671`, `lib/wallet-core/wallet-operations.ts:694-740`).
- **Messages read vs write:** listing, searching, opening, copying addresses, markdown preview, and mark-read stay enabled. Compose, reply, TTL message send, and pending outgoing bubble creation are disabled because message send builds a transaction (`lib/wallet-core/wallet-operations.ts:456-557`).
- **Stale dialogs:** if a user opens a send/deposit/message confirm dialog and the wallet state changes to view-only before confirmation, the confirm handler must re-check `isViewOnly`.
- **Any remaining `createTx` path:** search for `TransactionsExplorer.createTx` and `createWithdrawTx` during implementation. Based on the current cited paths, send, message send, deposit create, and deposit withdraw are the known spend-key paths (`lib/wallet-core/wallet-operations.ts:409-425`, `lib/wallet-core/wallet-operations.ts:492-513`, `lib/wallet-core/wallet-operations.ts:651-671`, `lib/wallet-core/wallet-operations.ts:721-740`).
- **Export page:** view-only wallets can export an empty spend key today through `exportWalletOperation` (`lib/wallet-core/wallet-operations.ts:315-327`). Keep export available, but consider showing the global badge and maybe a later warning that the exported backup cannot spend.

## 5. Test Plan

### Unit Tests

1. Add type and service-shape coverage.
   - Update existing wallet fixtures so every `WalletInfo` object has `isViewOnly`.
   - Add a small unit test for `assertCanSpend` / `ViewOnlyWalletError` in the new `lib/services/view-only.ts` helper.

2. Update `tests/mock-services.test.ts`.
   - Existing service smoke coverage imports a mnemonic (`tests/mock-services.test.ts:33-43`). Add a separate test for:
     - `services.wallet.importWallet({ method: "keys", viewOnly: true, address: MOCK_ADDRESS, privateViewKey: "a".repeat(64), privateSpendKey: "", password: "password123" })`
     - returned wallet has `isViewOnly: true`
     - `services.wallet.getWalletInfo()` returns `isViewOnly: true`
     - importing a non-view-only mnemonic or keys wallet returns `isViewOnly: false`

3. Add mock write guard tests.
   - After putting mock wallet into view-only mode, assert:
     - `services.transactions.sendTransaction(...)` rejects with `walletCopy.viewOnlySendDisabled`
     - `services.deposits.createDeposit(...)` rejects with `walletCopy.viewOnlyDepositDisabled`
     - `services.deposits.withdrawDeposit(...)` rejects with `walletCopy.viewOnlyDepositDisabled`
     - `services.messages.sendMessage(...)` rejects with `walletCopy.viewOnlyMessageDisabled`
   - Assert read operations still pass: `listTransactions`, `listDeposits`, `listMessages`, `markRead`.

4. Add focused UI component/page tests where current test harness supports it.
   - Send page: with `WalletInfo.isViewOnly = true`, `Review Send` is disabled and the inline explanation is visible.
   - Messages page: `New Message` and reply send are disabled, message list remains visible.
   - Deposits page: `Create New Deposit` and matured withdraw actions are disabled, deposit cards remain visible.

### E2E Tests

Add a Playwright spec beside `e2e/golden-path.spec.ts` (`e2e/golden-path.spec.ts:1-22`) for mock view-only import:

1. Start at `/`.
2. Navigate to import keys through the onboarding UI.
3. Select `View-only` in the existing wizard (`app/(onboarding)/onboarding-actions.tsx:449-468`).
4. Fill address and view key fields (`app/(onboarding)/onboarding-actions.tsx:477-533`).
5. Continue through history and password steps (`app/(onboarding)/onboarding-actions.tsx:566-695`).
6. Assert account opens and the persistent `View-only` badge is visible.
7. Go to `/wallet/send`; assert the page explanation is visible, `Review Send` is disabled, and no confirm dialog opens.
8. Go to `/wallet/deposits`; assert deposit list/summary is visible, create is disabled, and any withdraw button is disabled if present.
9. Go to `/wallet/messages`; assert the message list is visible, `New Message` is disabled, and reply send is disabled.
10. Go to `/wallet/receive`; assert the address is still visible, proving receive/read-only flows still work.

Because mock mode currently relaxes import requirements (`lib/ui/wallet-copy.ts:71-72`) but the key form still validates address and key shapes (`app/(onboarding)/onboarding-actions.tsx:342-358`), use `MOCK_ADDRESS` and a 64-character hex view key.

## 6. Risks and Open Questions

- **Runtime import boundary:** real services will dynamically import `@/lib/wallet-core/wallet-runtime` to derive mode, while still leaving `lib/wallet-core` source untouched. This matches the existing lazy-real-service pattern (`lib/services/index.ts:5-15`) but should be reviewed for circular imports.
- **Mock module state can leak between tests:** if mock wallet mode becomes module state, tests need a reset path. Prefer resetting on `openWallet`, `finalizeCreateWallet`, non-view-only `importWallet`, and possibly `deleteStoredWallet`.
- **Disabled controls need explanations:** native disabled buttons do not fire click handlers. Every disabled primary action should have visible nearby copy, not only a toast.
- **Accessibility:** disabled controls should remain discoverable. For actions where a tooltip is needed, wrap disabled buttons correctly because disabled buttons do not trigger pointer events.
- **Export semantics:** exporting a view-only wallet with an empty spend key is probably correct, but the current export copy warns about mnemonic/private keys generally (`lib/ui/wallet-copy.ts:22-37`). A future improvement may need view-only-specific export copy.
- **Deposit constraints shape:** adding view-only into `DepositConstraints` is tempting but unnecessary for the feature. Keep `WalletInfo.isViewOnly` as the source for mode and leave `isDepositDisabled` to sync/pending/balance constraints (`lib/services/deposit.service.ts:47-52`).
- **Server/static export:** avoid route-level server guards or middleware. The app is static export and client-service driven; UI checks should live in client pages and service checks in typed services.
