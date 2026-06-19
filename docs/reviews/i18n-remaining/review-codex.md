Findings

- app/(wallet)/wallet/scheduled/page.tsx:141 and app/(wallet)/wallet/scheduled/page.tsx:185 still render `formatCadence(c)`, which resolves through lib/ui/scheduled-payments.ts:32-40 to hard-coded English labels ("Weekly", "Monthly", "Quarterly", "Yearly"). In non-English locales, the scheduled page's cadence select and reminder detail stay English inside otherwise localized UI. Fix: add scheduled cadence label keys for all four cadences and pass `t(...)` instead of `formatCadence(...)` at both render sites.

Checked clean

- Donate method state is keyed by `DonationMethodKey`; default falls back to `"crypto"` at app/(wallet)/wallet/donate/donate-page-client.tsx:51-62, and crypto view selection is `method === "crypto"` at app/(wallet)/wallet/donate/donate-page-client.tsx:224. No localized-label comparison remains in the touched donate page.
- Removed/old donation label exports are not referenced by the touched pages or repo search; `DONATION_METHOD_LABELS` still exists in lib/donation-config.ts:21 but has no remaining references.
- No `useI18n()` call is at module scope in the five touched files. Message subcomponents call it inside component bodies, and module-scope `formatTtlMinutes` takes `noneLabel` at app/(wallet)/wallet/messages/page.tsx:763.
- Placeholder sets match English across all 10 locales for dictionary values; no dropped or renamed `{...}` placeholder found.
- Dictionary key parity is clean across all 10 locales, and direct `t("...")` keys used by the five pages exist.
- English selector strings checked against e2e-covered pages remain byte-identical for the visible selectors in insights, check-ins, and payment-reminders specs.
- `TYPE_LABEL_KEYS` covers every `TransactionType` member from lib/types/index.ts:48-55; `STATUS_META` covers every `CheckInStatus` member from lib/ui/check-ins.ts:18.

Verification

- `npm test -- --run tests/i18n.test.ts`
- `npm test -- --run tests/i18n-provider.test.tsx`
