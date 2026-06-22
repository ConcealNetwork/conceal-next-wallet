# Internal code-reviewer (sonnet) — `chore/audit-cleanup-batch-2` vs `main`

Read-only review of the committed diff across all 6 audit categories.

## CRITICAL / HIGH
None found.

## Item 1: `formatHashrate` extraction — Clean
Extracted body in `lib/ui/format-hashrate.ts` (GH/MH/kH/H, `.toFixed(2)`, `Math.round` for sub-kHz) is behavior-identical to the deleted inline copies. Both call sites — `app/(wallet)/wallet/network/page.tsx` and `components/layout/rails/network-rail.tsx` — now import it. No inline copies remain.

## Item 2: `triggerBlobDownload` / `sanitizePngLabel` extraction — Clean
- `lib/ui/download-blob.ts`: identical to prior inline (`createObjectURL` → anchor append/click/remove → deferred `revokeObjectURL`). The `typeof window === "undefined"` throw is a deliberate guard, not a regression.
- `downloadCsvFile` / `downloadJsonFile` import and delegate; blob construction unchanged.
- `sanitizePngLabel` in `qr-png.ts`; `paymentCardFilename` imports it. Filename builders call `sanitizePngLabel(label, "conceal-qr"|"conceal-request")` — behavior-identical.
- `downloadQrPng` keeps its `.png` extension guard; callers already pass `qrPngFilename(…)`/`paymentCardFilename(…)` (always `.png`), so the guard is a no-op in practice. No regression.

## Item 3: CCX const collapse — Clean
No remaining reference to `CCX_HUMAIN_DECIMAL_DISPLAY`. `CCX_PRECISION_DECIMAL_DISPLAY` = `COIN_UNIT_PLACES` (the deleted constant's value). All former call sites use the surviving name / the `formatCcx` default.

## Item 4: hooks dedup — Clean
Private `useWalletInfo`/`useWalletSynced` gone; imports canonical `useWalletSynced` from `@/lib/hooks/use-check-ins`. `useWalletSession` still used (`usePrefetchMessagesForBadge`). No import cycle (`lib/hooks/index.ts` doesn't import either file). Canonical predicate (`currentHeight >= networkHeight - 1`, `networkHeight <= 0` guard) is byte-identical.

## Item 5: Deletions — Clean
`threadKeyFor`, `WALLET_DONATION_ADDRESSES`, `MOCK_EXPORT_ADDRESS` (line 365 → `MOCK_ADDRESS`), donation `*_LABELS`/`*_SOLE_DESCRIPTIONS`/`getDonationMethodsDescription` (+ its test) — no remaining references. OnboardingGuard `/terms`+`/privacy` branches removed; legal pages live in the `(legal)` route group and never mount this guard, so no regression.

## Item 6: Unexports — Clean
`DONATION_METHOD_KEYS` correctly unexported; still powers `export type DonationMethodKey = (typeof DONATION_METHOD_KEYS)[number]` (TS inlines the `typeof` — compiles). All ~22 real-sdk / spine / vault / lib-helper unexports verified still used internally with no external or test importer. No mappers/runtime export was incorrectly stripped (those stay exported, consumed by the 8 services + tests).

## Summary
All 6 items behavior-identical. No regressions, dead references, import cycles, or missing re-exports. The branch is clean.
