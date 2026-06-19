## Findings

1. `wallet-shell.tsx:96-101` + `wallet-shell.tsx:115-118` hides the entire right rail below 1200px, while `app/(wallet)/wallet/account/page.tsx:99-135` now renders only Transaction Summary in the page body. The old account body rendered Market Summary inline at `HEAD:app/(wallet)/wallet/account/page.tsx:143-180`, so mobile/tablet users lose the market summary completely until a later drawer exists. Fix: keep a body fallback below the rail breakpoint, or do not remove the body card until the drawer lands.

2. `components/layout/rails/account-rail.tsx:52-75` replaces the old Market Summary with price/change/sparkline only, and `components/layout/rails/account-rail.tsx:158-215` replaces holdings with raw balance rows. The old card exposed `View Full Market` at `HEAD:app/(wallet)/wallet/account/page.tsx:148-155`, portfolio value and 24h volume at `HEAD:app/(wallet)/wallet/account/page.tsx:474-482`, and available/locked percentages at `HEAD:app/(wallet)/wallet/account/page.tsx:453-469`; none are present in the new rail. Fix: carry those fields/links into `AccountRail`, or explicitly retain them in a responsive body fallback.

## Checked Clean

- React registration: `usePageRightRail` registers once via `useEffect` and the current `AccountRail` does not depend on page props/state, so I do not see a re-render loop or stale rail data in this use case (`components/layout/right-rail.tsx:81-88`, `app/(wallet)/wallet/account/page.tsx:30`).
- Context value memoization is stable enough for this provider: `setContent` is memoized and `value` changes only with `content`/`collapsed` (`components/layout/right-rail.tsx:41-48`).
- Unmount cleanup clears registered content (`components/layout/right-rail.tsx:85-88`).
- SSR/static export: the new files are client components and do not touch `window`/browser globals at module init.
- Accessibility: the rail has an `aside` label, collapse/expand buttons have names, and quick actions use distinct `aria-label`s (`components/layout/wallet-shell.tsx:96-101`, `components/layout/wallet-shell.tsx:115-128`, `components/layout/rails/account-rail.tsx:258-265`).
