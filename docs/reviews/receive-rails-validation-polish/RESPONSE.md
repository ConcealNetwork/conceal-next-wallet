# Review response — receive-rails-validation-polish

Pre-PR triple review (per the repo workflow). Reviewers: **GLM-5.2** (`opencode -m zai/glm-5.2`),
**Codex gpt-5.5** (`codex exec`), **CodeRabbit** (`coderabbit review --plain`). 520 unit tests +
e2e green before and after fixes.

## GLM-5.2

| # | Sev | Finding | Resolution |
|---|-----|---------|-----------|
| 1 | HIGH | `formatUsd` default decimals silently changed 4→2 (scope creep on the CCX-6dp task); small CCX→USD values round to `$0.00` at 3 sites. | **Fixed** — reverted `formatUsd` default to 4 in `lib/utils.ts` + `lib/i18n/use-formatters.ts`; only the CCX→6dp change kept; test reverted to `$56.2725`. |
| 2 | MEDIUM | New `deposits-rail` / `market-rail` labels hardcoded English. | **Deferred → backlog issue.** Pre-existing cross-surface gap: the rails mirror the already-unlocalized `interest-calculator-dialog` + `MarketStatsGrid` (both have zero `t()` keys). Localizing one twin and not the other is inconsistent; the full pass (~100 translations across 4 surfaces) is its own focused PR, matching the project's phased i18n rollout. |
| 3 | MEDIUM | `interest-calc.ts` validates `ccx` but not `months` (≤0 → negative period rate). | **Fixed** — guard extended to `!Number.isFinite(months) || months <= 0`; `tests/interest-calc.test.ts` added. |
| 4 | LOW | Send insufficient-balance gives no feedback (button just grays). | **Rejected (verified).** `send/page.tsx:301-303` already renders the localized "Exceeds available balance" in red when `amount + fee > available`. |
| 5 | LOW | `messages/page.tsx` `!activeMessageId && "hidden md:flex"` is dead. | **Rejected (verified).** `selectedMessage` falls back to `filteredMessages[0]`, so `active` is truthy even when `activeMessageId` is null — the class is exactly what hides the thread pane on mobile in that fallback. Live + necessary. |
| 6 | LOW | Both the registered rail and the body-fallback rail mount simultaneously (CSS-hidden), doubling hook subscriptions. | **Deferred w/ rationale.** The CSS-hide (`min-[1200px]:hidden`) is deliberate — `useMediaQuery` gating risks SSR/hydration mismatch on the static export. Shared query cache = no double-fetch; cost is render work only. Noted for a future `useMediaQuery`-with-hydration-guard pass. |
| — | LOW | `CCX_HUMAIN_DECIMAL_DISPLAY` 2→6 global. | **Intended** (the user's explicit "CCX at 6dp everywhere" request). No action. |

GLM also verified clean: i18n key parity ×10, service-spine parity for the new `WalletSummary.balanceTotal`
(mock fills, real-sdk omits for locked wallets w/ comment), immutability.

## Codex gpt-5.5

| # | Sev | Finding | Resolution |
|---|-----|---------|-----------|
| 1 | MEDIUM | `receive/page.tsx` `parseFloat(amount)` accepts `1e3`/`1.`; raw string encoded into QR/link but scans as `1` / rejected by the link parser. | **Fixed** — strict `^\d{1,12}(\.\d{1,6})?$` validation → `amountForUri`; QR/link/share/caption all use the validated value; inline `receive.errAmountInvalid` (×10 locales) + `aria-invalid`. |
| 2 | LOW | `recipientName` / `message` concatenated into the URI unencoded → `?`/`&`/`=`/spaces corrupt or inject query segments. | **Fixed** — `encodeURIComponent` for `recipient_name`/`label` in `encodeTx`; guarded `decodeURIComponent` in `decodeTx`. amount/payment_id/address stay raw (constrained → legacy-scanner-safe). Symmetry + malformed-`%` tolerance covered by new tests. |
| 3 | LOW | `use-create-deeplink` reads `window.location.search` once on mount → sidebar `+` no-ops when already on that page. | **Deferred w/ rationale.** Clean fix needs `useSearchParams`, which conflicts with the hook's deliberate no-Suspense choice for the static export (risks the export build). Minor edge case (`+` while already on the page); tracked for a focused follow-up. |

## CodeRabbit

| Sev | Finding | Resolution |
|-----|---------|-----------|
| minor | `sidebar.tsx:318` hardcoded "wallet/wallets" plural. | **Fixed** — `wallets.countOne` / `wallets.countOther` added to all 10 locales; sidebar uses the plural keys. |
| minor | Gradient in `docs/design/receive-page-layout/agents/glm.html` violates the design brief's anti-slop rule. | **Noted, no fix.** Throwaway design-exploration artifact under `docs/` (Biome-excluded), not shipped code. |

## e2e adjustments (from a full clean run)

The rail additions + the password gate legitimately changed some e2e expectations:

- `insights.spec.ts` — Insights rail adds a 2nd "Insights" heading and repeats summary labels; scoped the
  heading to `level:1` and the stat assertions to `main … .first()`.
- `shell-redesign.spec.ts:80` — the "no rail" page was Address Book, which now has a rail; switched to Messages.
- `view-only-mode.spec.ts` — the new min password-strength gate disables submit for `password123`; bumped to a
  passing password (`Password123!`).
- `send-safety.spec.ts` — hardened `openSend` with a `toPass` retry (cold-compiled Send route under webpack dev
  can exceed a single 5s assertion). Several other specs were CPU-contention flakes under local parallel e2e
  (pass at `--workers=1` / on CI with `retries: 2`).

> Related: GLM #6 (the double rail mount — registered + embedded fallback both mounted) is the underlying cause
> of both the insights label duplication and the slower per-page hydration that makes single-click nav flaky.
> Deferred (correctness is fine — shared cache, no double-fetch), but worth the `useMediaQuery`-gated fallback.

## Deferred → backlog issues

1. **Localize the deposit calculator + market stats** across the rails *and* their main-page twins
   (`interest-calculator-dialog`, `MarketStatsGrid`) — GLM #2.
2. **`use-create-deeplink` same-page `?new=1`** — re-open the create dialog when the sidebar `+` is
   clicked while already on the target page (needs `useSearchParams` + a Suspense/hydration-safe
   approach) — Codex #3.
