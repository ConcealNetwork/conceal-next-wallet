# Stage 3 Review

## Findings

1. `app/(wallet)/wallet/transactions/transactions-page-client.tsx:73` + `app/(wallet)/wallet/transactions/transactions-page-client.tsx:275-277` gates the detail dialog only on viewport width, while `components/layout/wallet-shell.tsx:92-100` renders rail content only when the rail is not collapsed and `components/layout/wallet-shell.tsx:111-130` replaces it with an expand-only strip when collapsed. At >=1200px, collapse the context panel, select a transaction, and the page suppresses the dialog because `railVisible` is true, but the selected transaction detail is not rendered anywhere until the user notices and expands the strip. Fix: include rail collapsed/expanded state in the gating, expand the rail on row selection, or render the dialog when the rail is collapsed.

## Checked Clean

- `components/layout/right-rail.tsx:86-95`: re-registering via `[setContent, ...deps]` is sound for the current caller because `selected` changes only on discrete row/back actions; `nodeRef.current` prevents JSX identity from becoming a dependency, and cleanup clears the rail on unmount or dep replacement.
- `components/wallet/transaction-display.tsx:29-129`: extraction preserves the old label/icon/sign/status/timestamp/height logic, including outgoing message sign handling at `components/wallet/transaction-display.tsx:94-99`.
- `app/(wallet)/wallet/transactions/transactions-page-client.tsx:554-648`: the existing detail dialog still renders below the rail breakpoint and still includes signed amount, status, timestamp, height, payment ID, message, hash copy, address copy, and note.
- `lib/hooks/use-media-query.ts:13-28`: no `window` access occurs at module init; the hook starts `false` and reads `matchMedia` only in an effect, so static export/SSR is safe.
- `components/layout/rails/transactions-rail.tsx:79-86` and `components/wallet/common.tsx:251-299`: the Back button is keyboard reachable, and icon-only copy buttons receive explicit labels plus the existing live-region copy announcement.

## Verification

- `npm run types`
- `npm run lint`
