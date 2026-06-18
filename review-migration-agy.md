# SDK Engine Migration Review Findings

## CRITICAL

**1. `creationHeight` fallback logic causes 0-balance for legacy wallets**
*Location: `lib/services/real-sdk/runtime.ts` (`buildState`)*
When an existing legacy wallet is opened, it lacks the `sdkWalletState` field. The code falls back to `creationHeight = Math.max(0, Number(raw.creationHeight ?? raw.lastHeight ?? 0) || 0)`. Many older wallets lack a `creationHeight` entirely. For these wallets, this fallback uses `raw.lastHeight` (the fully synced tip) as the creation height. Since `buildState` initializes an empty `WalletState` and sets `scannedHeight` to `raw.lastHeight`, the sync loop will completely skip all historical blocks. The wallet will open with a 0 balance and empty history.
*Fix: Fallback `creationHeight` to 0, not `raw.lastHeight`.*

## HIGH

**2. Missing `REMOTE_NODE_FEE_ATOMIC` in spendable balance check**
*Location: `lib/services/real-sdk/transaction.service.ts` (`sendTransaction`)*
The pre-flight balance check `if (amountAtomic + FEE_ATOMIC > balance.spendable)` fails to account for the node fee. If `feeAddress !== rt.account.address`, the transaction builder pushes an extra destination for `REMOTE_NODE_FEE_ATOMIC` (10000 atomic). If the user sends their max balance, the check passes, but the underlying `buildTransaction` will fail due to insufficient inputs to cover the extra node fee.

**3. Missing `withdrawFee` in deposit withdrawal**
*Location: `lib/services/real-sdk/deposit.service.ts` (`withdrawDeposit`)*
The `txns.buildWithdrawTransaction` call entirely omits the `withdrawFee` argument. The SDK port spec explicitly requires this (`withdrawFee: number; // 10`). Depending on the SDK implementation, this will either cause a TypeScript compilation error/runtime missing-property crash, or it will default to 0 and create a 0-fee withdrawal transaction that the network will reject.
*Fix: Pass `withdrawFee: 10`.*

**4. Changing `scanHeight` via settings duplicates wallet history**
*Location: `lib/services/real-sdk/settings.service.ts` (`updateSettings`)*
When `input.scanHeight` or `input.creationHeight` is modified, the code updates `rt.state.scannedHeight = clamped` and triggers `rescan = true`. However, it does not wipe `outputs`, `transactions`, or `deposits` from `rt.state`. Moving `scannedHeight` backwards will cause `sync()` to rescan past blocks, blindly appending duplicate outputs, deposits, and transactions to the state and artificially inflating the user's balance.
*Fix: Wipe the state arrays identical to `resetAndRescan` when moving the height backwards.*

## MEDIUM

**5. `sendMessage` mutates persisted state before broadcast**
*Location: `lib/services/real-sdk/message.service.ts` (`sendMessage`)*
The optimistic message record is appended to `rt.raw` before calling `await broadcast(rt, built)`. If `broadcast` throws (e.g. daemon rejection), the fake message record remains in `rt.raw`. The next time `persist()` is called, this message will be permanently saved to the wallet blob despite never hitting the network.
*Fix: Only mutate `rt.raw` after a successful `broadcast`.*

**6. Inbound message reconstruction misses `100` atomic amount check**
*Location: `lib/services/real-sdk/messages-store.ts` (`reconstructReceivedMessage`)*
The legacy `mappers.ts` explicitly checks that a transaction's self-amount is exactly `MESSAGE_TX_AMOUNT_ATOMIC` (100) before classifying it as an inbound message. `reconstructReceivedMessage` checks `result.owned.length === 0` but fails to verify the output amount. A normal payment that maliciously or accidentally includes a `0x04` tag could be parsed and surfaced in the messages list.
