# View-Only Mode Implementation Spec

## 1. Data Model
To surface the view-only state globally, we will extend the central `WalletInfo` type.
- **File:** `lib/types/index.ts`
  Add `isViewOnly: boolean;` to the `WalletInfo` type.
- **File:** `lib/ui/wallet-copy.ts`
  Add user-facing strings for the badge and warning banners:
  ```typescript
  viewOnlyBadge: "View-Only",
  viewOnlyWarningSend: "This is a view-only wallet. You cannot send CCX.",
  viewOnlyWarningDeposits: "This is a view-only wallet. You can view deposits but cannot create or withdraw them.",
  viewOnlyWarningMessages: "This is a view-only wallet. You can read messages but cannot send replies.",
  ```

## 2. Service Layer
The typed service layer acts as the spine, mapping engine state to the UI safely and simulating it in mock mode.

- **Real Implementation (`lib/wallet-core/mappers.ts` & `lib/wallet-core/wallet-operations.ts`)**
  - **Mapping:** Update `mapWalletToInfo` in `lib/wallet-core/mappers.ts` to include `isViewOnly: wallet.isViewOnly()`. This effortlessly passes the flag up through `getWalletInfoOperation()`.
  - **Guards:** In `lib/wallet-core/wallet-operations.ts`, add a check at the top of `sendTransactionOperation`, `sendMessageOperation`, `createDepositOperation`, and `withdrawDepositOperation`:
    ```typescript
    if (wallet.isViewOnly()) throw new Error("Cannot perform this operation in a view-only wallet.");
    ```
    This prevents cryptic `createTx` engine failures.

- **Mock Implementation (`lib/services/mock/wallet.service.ts`)**
  - **Statefulness:** Currently, `mockWalletService` returns `clone(mockWalletInfo)`. To simulate view-only mode across an e2e session without mutating the original `mockWalletInfo`, we must introduce a module-level variable:
    ```typescript
    let currentMockWalletInfo = clone(mockWalletInfo);
    ```
  - **Import logic:** In `importWallet(input)`, update this variable based on the input:
    ```typescript
    const isViewOnly = input.method === "keys" && input.viewOnly;
    currentMockWalletInfo = { ...clone(mockWalletInfo), isViewOnly };
    return clone(currentMockWalletInfo);
    ```
  - **Read logic:** Ensure `getWalletInfo()`, `refreshWallet()`, and `openWallet()` return `clone(currentMockWalletInfo)`.

## 3. UI/UX
We will block operations at the **control level** rather than the route level. This allows users to read their past messages and view deposits, while gracefully disabling write actions.

- **Global Badge:** In `components/wallet/common.tsx` (specifically `PageHeader` or where the wallet address is displayed), display a subtle "View-Only" badge if `wallet.data?.isViewOnly` is true.
- **Send Page (`app/(wallet)/wallet/send/page.tsx`)**
  - Render an alert banner above the form if `wallet.data?.isViewOnly`.
  - Disable the `Review Send` button: `disabled={... || wallet.data?.isViewOnly}`.
- **Deposits Page (`app/(wallet)/wallet/deposits/page.tsx` & `deposits-page-client.tsx`)**
  - Render an alert banner.
  - Disable "Create Deposit" and "Withdraw" action buttons in the UI.
- **Messages Page (`app/(wallet)/wallet/messages/page.tsx`)**
  - Render an alert banner below the `PageHeader`.
  - Disable the "New Message" button in the header.
  - Disable the reply `Textarea` and "Send" button in the thread view.

## 4. Edge Cases
- **Switching Wallets:** When importing or switching to a view-only wallet, React Query's `useWalletInfo` cache must instantly update to reflect `isViewOnly = true`. The `importWallet` mutation naturally invalidates this query, so the UI will cleanly transition.
- **Refresh After Reload:** In real mode, `WalletRepository.getLocalWalletWithPassword` reinstantiates the engine `Wallet` from disk. Since the private spend key is missing, `wallet.isViewOnly()` will remain true seamlessly.
- **Mempool TTL & Messages:** Even reading messages requires decryption. View keys can decrypt incoming messages, but *outgoing* messages rely on the locally saved `sentMessages` array (since the view key alone cannot fully derive outgoing destinations on Cryptonote). The UI already handles `hasBody = false` for unsaved outgoing txs.
- **Fusion Transactions:** If there is any background optimization or fusion transaction logic, it must check `isViewOnly()` and abort silently to prevent errors.

## 5. Test Plan
- **Unit Tests:**
  - `mappers.test.ts`: Verify `mapWalletToInfo` sets `isViewOnly` correctly when passed a `Wallet` with an empty spend key.
  - `wallet-operations.test.ts`: Call `sendTransactionOperation` with a view-only wallet and assert it throws the expected user-friendly error before hitting the engine.
- **E2E Test (Mock Mode):**
  1. Boot app with `NEXT_PUBLIC_USE_MOCK=true`.
  2. Navigate to "Import Wallet" -> "Private Keys" method.
  3. Fill in a mock address and view key, and toggle "View-Only" to true.
  4. Submit import.
  5. Assert the "View-Only" badge is visible in the header.
  6. Navigate to `/wallet/send`. Assert the form submission button is disabled and the warning banner is present.
  7. Navigate to `/wallet/messages`. Assert the "New Message" button is disabled.

## 6. Risks & Open Questions
- **QR Code Imports:** If a user imports a wallet via QR code (`method: "qr"`), we currently derive view-only status if `decoded.spendKey` is missing. We must ensure `isViewOnly` propagates correctly in this flow.
- **Address Book:** Can a user in view-only mode add contacts? Yes, the address book is local and independent of the blockchain spend key. This should remain enabled.
- **Dust Optimization:** Ensure the `OptimizationStatus` logic (if present) does not aggressively prompt the user to optimize dust, since they cannot create the fusion transactions needed to do so.
