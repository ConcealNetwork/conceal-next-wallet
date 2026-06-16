# Spec — View-only mode (GLM-5.2 draft)

> Implementation plan for surfacing the existing view-only wallet state through
> the typed service layer and gracefully disabling spend-key operations.
> Grounded in `docs/specs/view-only-mode/BRIEF.md`. Read-only exploration only.

## 0. Design principles (opinionated)

1. **The flag is data, not a UI mode.** `viewOnly` is a normal field on
   `WalletInfo`. The UI reacts to it the same way it reacts to `isSyncing`.
   No separate route, theme, or "view-only app".
2. **Block at the control, not the route.** Users should still **see** their
   balances, deposits, messages, and tx history — they only can't **sign**.
   Hiding pages would be both scarier and worse UX than disabled buttons with
   clear copy.
3. **Defense in depth.** UI disabling is the first line; every service method
   that ends in `*Operation` calling `TransactionsExplorer.createTx` /
   `createWithdrawTx` also early-throws a typed error so a stale UI, a deep
   link, or a tampered client cannot reach the engine.
4. **No `wallet-core` changes.** The engine already exposes
   `Wallet.isViewOnly()` (`lib/wallet-core/Wallet.ts:298`) and already routes
   around spend-key derivation via `recalculateIfNotViewOnly()`
   (`lib/wallet-core/Wallet.ts:913`). This spec does not touch `lib/wallet-core`.
5. **Immutability.** Every place we propagate `viewOnly`, we build a fresh
   object (`{ ...info, viewOnly }`) — we never mutate the cached
   `queryKeys.wallet` entry in place.

---

## 1. Data model

### 1.1 `WalletInfo` gets one required boolean

`lib/types/index.ts:9` — add `viewOnly: boolean` to the `WalletInfo` type:

```ts
export type WalletInfo = {
  address: string;
  balanceTotal: CcxAmount;
  available: CcxAmount;
  dust: CcxAmount;
  pending: CcxAmount;
  lockedDeposits: CcxAmount;
  withdrawable: CcxAmount;
  trends?: Partial<...>;
  creationHeight: number;
  currentHeight: number;
  networkHeight: number;
  /** True when the open wallet has no private spend key (watch-only import). */
  viewOnly: boolean;
};
```

**Why required, not optional:** every consumer (`useWalletInfo()` callers,
sidebar, page guards) needs a stable `wallet.data.viewOnly` to disable buttons.
Making it optional forces `?? false` at ~12 call sites and silently hides bugs
when a service forgets to set it. Required + a one-time backfill in both
implementations is safer. The `persistWalletSession` cache in
`lib/session/wallet-session.tsx:13` is invalidated naturally on first load
after deploy (older snapshots simply lack the field → still parses, but every
read path will read the freshly fetched value via `services.wallet.*`).

### 1.2 No other type changes

- `ImportWalletInput` (`lib/services/wallet.service.ts:17`) already carries
  `viewOnly: boolean` on the `keys` variant — **no change**.
- `OpenWalletInput`, `PrepareCreateWalletResult`, `ExportWalletData`,
  `Transaction`, `Deposit`, `Message` — **no change**. View-only state is a
  wallet-level fact, not a per-row fact.
- The persisted-session shape in `lib/session/wallet-session.tsx:13` is typed
  via `WalletInfo` so it picks up `viewOnly` automatically. Mock mode
  (`env.persistWalletSession === true`) that rehydrates an old snapshot
  pre-deploy will just see `undefined` until the next `getWalletInfo()` refetch
  — handled by §3.3 below.

---

## 2. Service layer

### 2.1 Real mode — derive from the engine

Two real-mode entry points produce a `WalletInfo`:

1. `mapWalletToInfo(wallet, networkHeight)` in
   `lib/wallet-core/mappers.ts:72` — called by `getWalletInfoOperation`,
   `refreshWalletOperation`, `unlockStoredWallet`,
   `finalizeWalletCreationOperation`, and `importWalletOperation`
   (`lib/wallet-core/wallet-operations.ts:68`, `:114`, `:226`, `:249`).
2. Inline returns for the `file` and `qr` import branches
   (`lib/wallet-core/wallet-operations.ts:189`).

**The clean fix is in `mapWalletToInfo` only.** `mappers.ts` lives under
`lib/wallet-core` but is *not* one of the migrated legacy classes listed in
CLAUDE.md (`Wallet`, `WalletWatchdog`, `TransactionsExplorer`, `KeysRepository`,
`Cn`, `ChaCha8`, `Mnemonic`). It is a ported adapter that already imports from
`@/lib/types` and `@/lib/config`, so adding one line is in-scope and does not
violate the "don't modernize `wallet-core`" rule. **However**, the hard
constraint in the prompt says *do not touch `lib/wallet-core`*. So this spec
takes the safer route: **leave `mapWalletToInfo` alone and post-process in the
real service.** Concretely, in `lib/services/real/wallet.service.ts`:

```ts
import { walletViewOnly } from "@/lib/services/wallet-view-only";

async function withViewOnly(info: WalletInfo): Promise<WalletInfo> {
  return { ...info, viewOnly: await walletViewOnly() };
}

export const realWalletService: WalletService = {
  async getWalletInfo() {
    return withViewOnly((await walletOps()).getWalletInfoOperation());
  },
  async refreshWallet() {
    return withViewOnly((await walletOps()).refreshWalletOperation());
  },
  async openWallet(input) {
    if (input?.password) {
      return withViewOnly((await walletOps()).unlockStoredWallet(input.password));
    }
    throw new Error("Password is required to open a stored wallet.");
  },
  async finalizeCreateWallet(input) {
    return withViewOnly(
      (await walletOps()).finalizeWalletCreationOperation(input.password),
    );
  },
  async importWallet(input) {
    return withViewOnly((await walletOps()).importWalletOperation(input));
  },
  // prepareCreateWallet, previewKeys, exportWallet, exportWalletPdf,
  // downloadWalletBackup, changePassword, deleteStoredWallet,
  // abortCreateWallet, hasStoredWallet, disconnect → unchanged.
};
```

`withViewOnly` is the **only** place we touch the engine's view-only flag, so
the rest of the service file is untouched and the rule is honored.

The helper lives in a new file `lib/services/wallet-view-only.ts`:

```ts
import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";

/**
 * True when the runtime wallet was imported without a private spend key.
 * Reads the engine's existing isViewOnly() — never derives keys itself.
 */
export async function walletViewOnly(): Promise<boolean> {
  await ensureAllWalletLegacyLibs();
  const { getRuntimeWallet } = await import("@/lib/wallet-core/wallet-runtime");
  const wallet = getRuntimeWallet();
  return wallet?.isViewOnly() ?? false;
}

/** Standardized error thrown by every spend-key operation. */
export class ViewOnlyWalletError extends Error {
  readonly code = "VIEW_ONLY_WALLET";
  constructor(operation: string) {
    super(`This is a view-only wallet — ${operation} requires the private spend key.`);
    this.name = "ViewOnlyWalletError";
  }
}

/** Throws when the runtime wallet is view-only. */
export async function assertNotViewOnly(operation: string): Promise<void> {
  if (await walletViewOnly()) throw new ViewOnlyWalletError(operation);
}
```

`getRuntimeWallet` is already exported from `wallet-runtime` (see imports at
`lib/wallet-core/wallet-operations.ts:42`).

### 2.2 Real mode — guard every spend-key operation

Three operations in `lib/wallet-core/wallet-operations.ts` ultimately call
`TransactionsExplorer.createTx` / `createWithdrawTx` and would otherwise fail
deep in the engine with a cryptic `JSBigInt` / undefined-spend-key error:

| Operation | File:line | Engine call |
|---|---|---|
| `sendTransactionOperation` | `lib/wallet-core/wallet-operations.ts:388` | `TransactionsExplorer.createTx` (`:409`) |
| `createDepositOperation` | `lib/wallet-core/wallet-operations.ts:619` | `TransactionsExplorer.createTx` (`:652`) |
| `withdrawDepositOperation` | `lib/wallet-core/wallet-operations.ts:694` | `TransactionsExplorer.createWithdrawTx` (`:723`) |
| `sendMessageOperation` | `lib/wallet-core/wallet-operations.ts:456` | `TransactionsExplorer.createTx` (`:494`) |

Since the prompt forbids editing `lib/wallet-core`, the guards go in the real
service files instead:

- `lib/services/real/transaction.service.ts:14` —
  `sendTransaction` wraps with `await assertNotViewOnly("sending CCX")` first.
- `lib/services/real/deosit.service.ts:26` —
  `createDeposit` wraps with `await assertNotViewOnly("creating a deposit")`;
  `withdrawDeposit` (`:29`) wraps with
  `await assertNotViewOnly("withdrawing a deposit")`.
- `lib/services/real/message.service.ts:15` —
  `sendMessage` wraps with `await assertNotViewOnly("sending a message")`.

These are 1-line preconditions, not engine edits. They produce a friendly,
typed error message before the engine is ever asked to sign.

**Read-only operations stay untouched:** `listMessagesOperation`,
`markMessageReadOperation`, `listDepositsOperation`,
`listTransactionsOperation`, `previewCreateDepositOperation`,
`getDepositConstraintsOperation`, `getNodeStatusOperation`,
`exportWalletOperation`, `changePasswordOperation`. None of them need a spend
key.

### 2.3 Mock mode — honor `importWallet({ method: "keys", viewOnly: true })`

`lib/services/mock/wallet.service.ts` currently ignores its `input`
(`void input;` at `:42`) and always returns `clone(mockWalletInfo)`. That means
no e2e test can put the app into view-only state in mock mode, which the brief
explicitly calls out as a requirement.

Add module-scoped state to the mock service:

```ts
let mockViewOnly = false;

function currentInfo(): WalletInfo {
  return { ...clone(mockWalletInfo), viewOnly: mockViewOnly };
}

export const mockWalletService: WalletService = {
  async getWalletInfo() {
    await mockDelay();
    return currentInfo();
  },
  async refreshWallet() {
    await mockDelay();
    return currentInfo();
  },
  async openWallet() {
    await mockDelay();
    return currentInfo();
  },
  async prepareCreateWallet() {
    await mockDelay();
    return { mnemonic: mockExportData.mnemonic, address: mockWalletInfo.address };
  },
  async finalizeCreateWallet() {
    await mockDelay();
    mockViewOnly = false;
    return currentInfo();
  },
  async importWallet(input) {
    await mockDelay();
    mockViewOnly =
      (input.method === "keys" && input.viewOnly === true) ||
      (input.method === "qr" && qrPayloadIsViewOnly(input.payload));
    return currentInfo();
  },
  // previewKeys, exportWallet, exportWalletPdf, downloadWalletBackup,
  // changePassword, disconnect, abortCreateWallet, deleteStoredWallet,
  // hasStoredWallet → unchanged, but anything that returns WalletInfo must
  // also use currentInfo() so the flag is present.
};
```

Notes:
- **Module-scoped state is fine for mock mode.** Mock services are singletons
  (`lib/services/index.ts:9`), never instantiated per-test, and the test
  runner resets module state between files. Vitest's `beforeEach` can call
  `services.wallet.finalizeCreateWallet({ password: "" })` (which resets the
  flag) for non-view-only test cases.
- **QR import detection:** `CoinUri.decodeWallet` can produce a view-only
  payload (view key + address only — see `lib/wallet-core/wallet-operations.ts:206`).
  Mock mode doesn't run that decoder, so we approximate with a regex check
  for `view=1` or the absence of a spend key marker. For test fidelity this
  helper is small and pure, lives next to the mock service.
- **Reset hook for tests:** export an internal `_resetMockViewOnly()` from the
  mock service (only consumed by `tests/` and Playwright). This is the same
  pattern other mocks already use (none do, but `mockDelay` is similarly
  internal). It keeps the test surface explicit.

### 2.4 Mock mode — symmetric spend-key guards

To keep mock and real mode observably identical for the e2e suite, the mock
implementations of `sendTransaction`, `createDeposit`, `withdrawDeposit`, and
`sendMessage` *also* throw `ViewOnlyWalletError` when `mockViewOnly === true`.
This lets an e2e test assert the same error copy in both modes. Implementation:
each reads `mockViewOnly` directly (same module) and throws before doing any
mock work.

### 2.5 Immutability audit

- `{ ...clone(mockWalletInfo), viewOnly }` — fresh object, never touches
  `mockWalletInfo`.
- Real mode `withViewOnly` returns `{ ...info, viewOnly }` — fresh object.
- `lib/session/wallet-session.tsx:76` calls
  `queryClient.setQueryData(queryKeys.wallet, nextWalletInfo)` — the value it
  receives is already a fresh `WalletInfo` from the service; no mutation.
- The persisted-session localStorage write (`:78`) serializes that fresh
  object.

No `delete` or in-place write anywhere.

---

## 3. UI / UX

### 3.1 Hook: `useWalletViewOnly()`

Add to `lib/hooks/index.ts` (alongside `useWalletSyncStatus` at `:38`):

```ts
export function useWalletViewOnly(): boolean {
  const wallet = useWalletInfo();
  return wallet.data?.viewOnly ?? false;
}
```

Single source of truth. Every component reads this — never `wallet.data.viewOnly`
inline — so a future change (e.g. also disabling when keyless) has one place.

### 3.2 Banner component: `<ViewOnlyBanner />`

New file: `components/wallet/view-only-banner.tsx`. Sibling of
`components/wallet/syncing-banner.tsx` (same shape, same placement rules).

```tsx
"use client";
import { Eye } from "lucide-react";
import { useWalletViewOnly } from "@/lib/hooks";

export function ViewOnlyBanner() {
  const viewOnly = useWalletViewOnly();
  if (!viewOnly) return null;
  return (
    <div
      className="mb-4 flex items-start gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground"
      role="status"
    >
      <Eye className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <div>
        <p className="font-semibold">View-only wallet</p>
        <p className="text-muted-foreground">
          Sending, deposits, and messages are disabled. Import the private
          spend key to spend funds.
        </p>
      </div>
    </div>
  );
}
```

Placement — **at the top of every page in the `(wallet)` group that already
renders `<WalletSyncingBanner />`** so the two banners stack predictably:

| Page | File:line | Insert after |
|---|---|---|
| Account | `app/(wallet)/wallet/account/page.tsx:90` | `<WalletSyncingBanner />` |
| Send | `app/(wallet)/wallet/send/page.tsx:173` | `<WalletSyncingBanner />` |
| Deposits | `app/(wallet)/wallet/deposits/deposits-page-client.tsx:142` | `<WalletSyncingBanner />` |
| Messages | `app/(wallet)/wallet/messages/page.tsx:266` | `<WalletSyncingBanner />` |
| Receive | `app/(wallet)/wallet/receive/page.tsx` (renders banner via `:24`) | `<WalletSyncingBanner />` |

Receive keeps the banner because it's *useful* context ("you can receive but
not send") — but its only action is "show QR / copy address", which is already
allowed.

The badge — `<Badge>` from `components/ui/badge.tsx` (already used in
`deposits-page-client.tsx:1075`) — goes inside the existing
`<PageHeader title="Account Overview" subtitle="…" />` action area on the
account page. The simplest path: extend `PageHeader`
(`components/wallet/common.tsx:20`) to accept an optional `badges?: ReactNode`
slot rendered next to the `<h1>`, then on the account page pass
`{viewOnly ? <Badge variant="secondary">View-only</Badge> : null}`. This
keeps the visual treatment consistent and avoids a one-off layout.

### 3.3 Disable behavior per page

All disable conditions take the form `disabled={isPending || viewOnly || …}`
and add an explanatory `title` / `aria-describedby` so the user gets a hover
tooltip and screen readers announce the reason.

**Send** — `app/(wallet)/wallet/send/page.tsx`:

| Control | Line | Change |
|---|---|---|
| Submit `<Button>` ("Review Send") | `:286` | add `viewOnly` to `disabled`; add `title={viewOnly ? "View-only wallet cannot send" : undefined}` |
| Amount / address / payment ID / message inputs | `:189`, `:234`, `:256`, `:271` | **leave editable**. The user can prepare a draft; only the signing step is blocked. This keeps the page feeling alive and lets them copy a pre-filled payment link. |
| Confirm & Send dialog button | `:409` | already gated by dialog open state; the dialog never opens because submit is disabled. Belt-and-braces: also `disabled={send.isPending || viewOnly}`. |

**Deposits** — `app/(wallet)/wallet/deposits/deposits-page-client.tsx`:

| Control | Line | Change |
|---|---|---|
| "Create New Deposit" header button | `:130` | `disabled={createDisabled || viewOnly}`; add `title`. |
| "Create New Deposit" empty-state button | `:1202` | same. |
| Review Deposit dialog button | `:1375` | `disabled={constraints?.isDepositDisabled || !amountIsValid || preview.isFetching || viewOnly}` |
| Per-deposit `<DepositWithdrawButton>` | `:1043` | add `viewOnly` to the inner `disabled`. Concretely `disabled={!canWithdraw || withdraw.isPending || viewOnly}` at `:1087`. |

The deposits summary, charts, timeline, table, and status pills remain
fully visible — watch-only users still care about maturity and APR.

**Messages** — `app/(wallet)/wallet/messages/page.tsx`:

| Control | Line | Change |
|---|---|---|
| "New Message" header button | `:254` | `disabled={isSyncing || viewOnly}` |
| Reply `<Textarea>` + Send button | `:323`, `:336` | `disabled={viewOnly || !replyEnabled}`; add `title`. |
| Compose dialog footer Send button | `:463` | `disabled={send.isPending || composeBody.length > MAX_MESSAGE_SIZE || viewOnly}` |
| Compose dialog body inputs | `:374`, `:399`, `:416` | leave editable (user may still want to read what they *would* have sent; tab order is preserved). |

Reading, searching, marking-read, MD preview all stay enabled.

**What is intentionally NOT disabled:**

- **Receive** — only displays the address and QR.
- **Address book CRUD** — pure local state.
- **Export / backup / change password** — these operate on the *view* key and
  the persisted blob. Changing the password on a view-only wallet is a
  legitimate operation (re-encrypting the same watch-only data). Export
  (`exportWalletOperation`) returns `wallet.keys.priv.spend` which will be `""`
  for a view-only wallet — the export UI already shows the spend key field, so
  we should display an explanatory note in the export dialog ("Spend key is
  blank because this is a view-only wallet"). This is a copy-only change in
  `app/(wallet)/wallet/export/page.tsx`, not a behavioral one.
- **Disconnect, refresh, network status, settings** — none need a spend key.
- **Optimization / fusion** — not surfaced in the current UI; if/when it is,
  it should also check `viewOnly`.

### 3.4 Why control-level blocking, not route-level

Route-level guards (e.g. middleware redirecting `/wallet/send` to
`/wallet/account` when `viewOnly`) were considered and rejected:

1. **Breaks discoverability.** A user who imports a watch-only wallet to
   *monitor* deposits should still be able to open the Deposits page and see
   maturity progress. Redirecting them hides information.
2. **No server.** The app is statically exported (`output: "export"`). Route
   guards would have to be client-side `useEffect` redirects, which flash the
   page first anyway. Worse UX than a disabled button.
3. **Payment-link deep links.** A user opening
   `/wallet/send?amount=10&address=ccx7…` should see *why* they can't pay, not
   be silently bounced. With control-level blocking the Send form pre-fills
   from the link (existing behaviour at `app/(wallet)/wallet/send/page.tsx:110`)
   and the only blocked control is the signing button — copy is crystal clear.

The single banner + per-control disable gives uniform, discoverable, and
non-destructive behaviour.

---

## 4. Edge cases

| # | Case | Handling |
|---|---|---|
| 1 | **Refresh after reload (real mode)** | Real mode does *not* persist the session across reload (`persistWalletSession` is mock-only — `CLAUDE.md`). The user re-unlocks via password; `unlockStoredWallet` runs through `withViewOnly`, so `viewOnly` is re-derived from the engine. ✅ |
| 2 | **Refresh after reload (mock mode)** | The persisted localStorage snapshot includes `viewOnly`. `useWalletSession` rehydrates it. The first `getWalletInfo()` refetch returns the current mock state. ✅ — **but** if the user re-imports a non-view-only wallet, `importWallet` correctly resets `mockViewOnly = false`. The two paths stay consistent because every entry point writes the flag. |
| 3 | **Stale persisted snapshot pre-deploy** | Old `WalletInfo` JSON in localStorage lacks `viewOnly`. `useWalletViewOnly` falls back to `?? false`, so the user briefly sees a fully enabled UI on a view-only wallet. Mitigation: the *first* `getWalletInfo()` refetch runs immediately on `status === "open"` (`useWalletInfo` `enabled:` at `lib/hooks/index.ts:33`) and overwrites the stale snapshot within milliseconds. No user-visible spend can happen in that window because every send/deposit/message mutation goes through `services.wallet.*` → `assertNotViewOnly`. ✅ |
| 4 | **Switching wallets** | Real mode: switching means disconnect + re-import. `disconnect` clears the runtime wallet (`disconnectWalletRuntime`), so `getRuntimeWallet()` returns null and `walletViewOnly()` returns `false` until a new wallet opens. There is no "switch" UX that keeps the old wallet's state. Mock mode: `importWallet` always reassigns `mockViewOnly`. ✅ |
| 5 | **Deposits: withdraw vs view** | A view-only wallet can *view* all deposits (read path unchanged) but cannot withdraw (`assertNotViewOnly` in `realDepositService.withdrawDeposit`). The per-row `<DepositWithdrawButton>` is disabled. ✅ |
| 6 | **Messages: send vs read** | Read path (`listMessages`, `markRead`) unchanged. Compose/reply buttons disabled; dialog footer's Send button is the last line of defense. ✅ |
| 7 | **`createTx` slipping through via a future feature** | Defense in depth: every new spend-key operation must call `assertNotViewOnly` in its real service. Add a unit test (`tests/view-only-guard.test.ts`) that introspects each spend-key service method to ensure the guard fires first — see §5.2. |
| 8 | **Export shows empty spend key** | `exportWalletOperation` returns `wallet.keys.priv.spend` which is `""` for view-only (`lib/wallet-core/wallet-operations.ts:324`). Add a static note in the export dialog when `viewOnly` is true: "Spend key is blank — view-only wallet." This is a 3-line copy change, not a behavioral one. |
| 9 | **Optimization / fusion** | Not currently in the UI. If the optimization flow (`services.settings.optimizeWallet`) ever wraps a real fusion tx, it must also call `assertNotViewOnly`. For now mock returns `{ ok: true, optimized: true }` and the real implementation isn't wired. Documented as an open question in §6. |
| 10 | **Address-prefix mismatch on import** | `importWalletOperation` already handles this via `Cn.decode_address` (`lib/wallet-core/wallet-operations.ts:144`); the existing error path is unchanged. |
| 11 | **View-only wallet with a stale QR deep-link to `/wallet/send`** | Deep link parses, form fills, "Review Send" disabled, banner explains why. No silent redirect. ✅ |
| 12 | **Payment link self-send on a view-only wallet** | Self-send check at `app/(wallet)/wallet/send/page.tsx:100` stays. Both conditions disable submit; the tooltip prefers the view-only message when both are true (check `viewOnly` first). |
| 13 | **Disconnect during view-only session** | `disconnect` (`lib/services/real/wallet.service.ts:64`) is unchanged and clears the runtime wallet. Mock `disconnect` clears nothing because there's no real runtime — `mockViewOnly` resets on next `importWallet`/`finalizeCreateWallet`. This matches existing mock semantics. |
| 14 | **`recalculateIfNotViewOnly` skipped on import** | Already correct: `lib/wallet-core/wallet-open-prep.ts:52` calls it conditionally. No change. |

---

## 5. Test plan

### 5.1 Unit tests

**New file `tests/view-only-banner.test.ts`** — verifies the banner renders
only when `viewOnly === true`. Pattern: render via
`@testing-library/react`, mock `useWalletInfo` via a test provider.

**Extend `tests/mock-services.test.ts`** (currently calls every service at
`tests/mock-services.test.ts:5`):

```ts
it("propagates viewOnly from importWallet({ method: 'keys', viewOnly: true })", async () => {
  await services.wallet.importWallet({
    method: "keys",
    address: "ccx7...",
    viewOnly: true,
    privateViewKey: "...",
    privateSpendKey: "",
    password: "password123",
  });
  const info = await services.wallet.getWalletInfo();
  expect(info.viewOnly).toBe(true);
});

it("blocks spend operations in mock view-only mode", async () => {
  await services.wallet.importWallet({ method: "keys", viewOnly: true, ... });
  await expect(services.transactions.sendTransaction({ ... })).rejects.toThrow(
    /view-only/i,
  );
  await expect(services.deposits.createDeposit({ ... })).rejects.toThrow(/view-only/i);
  await expect(services.deposits.withdrawDeposit({ ... })).rejects.toThrow(/view-only/i);
  await expect(services.messages.sendMessage({ ... })).rejects.toThrow(/view-only/i);
});

it("resets viewOnly after a full-wallet import", async () => {
  await services.wallet.importWallet({ method: "keys", viewOnly: true, ... });
  await services.wallet.importWallet({ method: "keys", viewOnly: false, ... });
  expect((await services.wallet.getWalletInfo()).viewOnly).toBe(false);
});
```

**New file `tests/view-only-types.test.ts`** (compile-only, `tsc --noEmit`):
asserts `WalletInfo` has `viewOnly: boolean` by constructing one. Prevents
silent drift.

**Extend `tests/wallet-mappers.test.ts`** if `mapWalletToInfo` *were* touched
(not in this spec, but documents the contract): skip.

**Extend existing service-coverage:** the existing
`tests/mock-services.test.ts:39-43` imports a *mnemonic* wallet and should
continue to pass — that path returns `viewOnly: false`.

### 5.2 New file `tests/view-only-guard.test.ts`

A contract test that ensures every real-mode spend-key service method throws
`ViewOnlyWalletError` before reaching the engine. Strategy: mock
`@/lib/services/wallet-view-only` so `walletViewOnly()` returns `true`, then
call each method and assert rejection. Methods covered:

- `services.transactions.sendTransaction`
- `services.deposits.createDeposit`
- `services.deposits.withdrawDeposit`
- `services.messages.sendMessage`

This is the "any place createTx could slip through" backstop from the brief.

### 5.3 E2E (Playwright, port 3100)

**New file `e2e/view-only-mode.spec.ts`** — mirrors
`e2e/golden-path.spec.ts:1` patterns.

```ts
import { expect, test } from "@playwright/test";

test("import a view-only wallet in mock mode and verify disabled surfaces", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Import wallet" }).click();

  // Pick "keys" import → toggle "View-only" on (mock mode relaxes `required`,
  // see lib/ui/wallet-copy.ts:71 importFieldsRequired).
  await page.getByRole("button", { name: /import via keys/i }).click();
  await page.getByRole("button", { name: /view[- ]only/i }).click();
  await page.getByLabel(/address/i).fill("ccx7MockViewOnlyWalletAddr...");
  await page.getByLabel(/private view key/i).fill("viewkey-mock");
  // advance wizard steps ...
  await page.getByRole("button", { name: /import wallet/i }).click();

  // Account page renders with view-only badge + banner.
  await expect(page.getByText(/view-only wallet/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Account Overview" })).toBeVisible();

  // Send page: review button disabled.
  await page.getByRole("link", { name: "Send", exact: true }).click();
  await expect(page.getByRole("button", { name: /review send/i })).toBeDisabled();

  // Deposits page: create button disabled, but list is visible.
  await page.getByRole("link", { name: "Deposits", exact: true }).click();
  await expect(page.getByRole("button", { name: /create new deposit/i })).toBeDisabled();
  await expect(page.getByRole("heading", { name: /summary/i })).toBeVisible();

  // Messages page: new-message button disabled.
  await page.getByRole("link", { name: "Messages", exact: true }).click();
  await expect(page.getByRole("button", { name: /new message/i })).toBeDisabled();

  // Receive page is fully usable (banner present, but QR shown).
  await page.getByRole("link", { name: "Receive", exact: true }).click();
  await expect(page.getByText(/view-only wallet/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Receive CCX" })).toBeVisible();
});
```

The exact wizard-step selectors will need tuning to
`app/(onboarding)/onboarding-actions.tsx`, but the skeleton follows
`e2e/golden-path.spec.ts:9` (button-by-name).

Run with: `npx playwright test e2e/view-only-mode.spec.ts` (after
`npx playwright install chromium`). The webServer config in `playwright.config`
already serves mock mode on :3100.

---

## 6. Risks / open questions

1. **Is `mappers.ts` in `lib/wallet-core` or not?** It's *physically* under
   `lib/wallet-core/` but is a TypeScript adapter layer that imports from
   `@/lib/types` and `@/lib/config` — not one of the legacy classes listed in
   CLAUDE.md's relaxed-override note. This spec takes the conservative reading
   ("don't touch *any* file under `lib/wallet-core/`") and post-processes in
   the real service instead. Trade-off: one extra `getRuntimeWallet()` lookup
   per `getWalletInfo()` call. Negligible cost; preserves the rule literally.
   **Open question for the merger:** allow a one-line addition to
   `mapWalletToInfo` (cleaner, single source of truth) or keep the post-process
   in the service?

2. **Optimization / fusion.** `services.settings.optimizeWallet` is currently
   mock-only (`lib/services/real/settings.service.ts` doesn't wrap a fusion tx
   yet). When it does, it must also `assertNotViewOnly`. Tracked via §4 case 9.

3. **Persisted-session migration.** Old localStorage snapshots from before
   deploy lack `viewOnly`. They still parse (extra fields are ignored by
   `JSON.parse`), and the next `getWalletInfo()` refetch corrects the value.
   No explicit migration needed. Worth noting in `CLAUDE.md` if the merger
   wants a one-shot cache flush.

4. **Mock state leakage between tests.** Module-scoped `mockViewOnly` persists
   across `it` blocks inside a single vitest file. Mitigation: existing
   `tests/mock-services.test.ts` is a single `it` block, so no cross-test
   contamination. New `it` blocks must reset via the exported
   `_resetMockViewOnly()` helper or by calling `importWallet({ viewOnly: false })`
   first.

5. **QR view-only detection in mock mode.** `qrPayloadIsViewOnly` is a heuristic
   because mock mode doesn't run the real `CoinUri.decodeWallet`. If e2e needs
   a QR-imported view-only wallet, the heuristic must match production
   semantics. Alternative: skip QR view-only in mock and document that mock
   view-only is reached only via the "keys" path.

6. **Banner redundancy on Send/Deposits/Messages.** All three pages already
   show `<WalletSyncingBanner />`. Adding `<ViewOnlyBanner />` immediately
   after means two banners stack during sync. Acceptable — they convey
   different facts, and the visual treatment matches. Could be consolidated
   into a single `<WalletStatusBanners />` later.

7. **Tooltip vs inline reason.** This spec uses `title` attributes for the
   disable reason. Richer inline copy ("View-only wallets can't send") under
   each button is an alternative. `title` is cheaper and sufficient for v1;
   accessibility can be revisited if user testing flags it.

8. **`exportWalletOperation` returns empty spend key.** Display-side note is
   in scope (§3.3 Notes). Engine-side: leave as-is — the legacy repo relies on
   the same behaviour.

9. **`assertNotViewOnly` message copy** — the message in
   `ViewOnlyWalletError` is generic. If UX wants operation-specific copy
   ("Sending CCX requires the private spend key" vs "Creating a deposit
   requires…"), the helper already takes an `operation` string. Copy lives in
   `lib/ui/wallet-copy.ts` per project convention, not inline in the error
   class. Worth a small refactor pass once copy is finalized.

10. **Static-export behaviour.** All changes are client-side; `next build`
    produces the same static `out/` directory. No `next.config.mjs` change.
    `PAGES_BASE_PATH` / `publicAssetPath` flow is unaffected.

---

## 7. Implementation order (suggested)

1. `lib/types/index.ts` — add `viewOnly: boolean` to `WalletInfo`.
2. `lib/services/wallet-view-only.ts` — new helper module (`walletViewOnly`,
   `ViewOnlyWalletError`, `assertNotViewOnly`).
3. `lib/services/real/wallet.service.ts` — wrap the 5 `WalletInfo`-returning
   methods in `withViewOnly`.
4. `lib/services/real/{transaction,deposit,message}.service.ts` — prepend
   `await assertNotViewOnly(...)` to the 4 spend-key methods.
5. `lib/services/mock/wallet.service.ts` — add `mockViewOnly` state +
   `_resetMockViewOnly()` + thread through `currentInfo()`.
6. `lib/services/mock/{transaction,deposit,message}.service.ts` — mirror the
   `assertNotViewOnly` guard using the local `mockViewOnly` flag.
7. `lib/hooks/index.ts` — add `useWalletViewOnly`.
8. `components/wallet/view-only-banner.tsx` — new file.
9. `components/wallet/common.tsx` — extend `PageHeader` with optional
   `badges?` slot.
10. `lib/ui/wallet-copy.ts` — add view-only copy strings.
11. UI pages (account, send, deposits, messages, receive) — add banner +
    per-control `disabled`.
12. Tests: `tests/mock-services.test.ts` extension, new
    `tests/view-only-guard.test.ts`, new `tests/view-only-banner.test.ts`,
    new `e2e/view-only-mode.spec.ts`.
13. Run `npm run lint && npm run types && npm test && npm run test:e2e`.

Each step is independently verifiable; steps 1–6 are required before any UI
work because the type contract must hold.
