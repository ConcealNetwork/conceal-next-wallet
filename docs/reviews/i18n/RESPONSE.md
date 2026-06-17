# i18n foundation — review response

Three reviewers ran in parallel against `git diff main...HEAD` (Antigravity/Gemini 3.1 Pro, GLM‑5.2, CodeRabbit free‑tier). Codex was out of credits this run. Findings and resolutions below.

## Addressed

| # | Sev | Source | Finding | Resolution |
|---|-----|--------|---------|------------|
| 1 | HIGH | Antigravity, GLM | `translate()` resolved `Object.prototype` members: `t("valueOf")`/`t("toString")` returned native functions (crash on `.replace`); `name in vars` matched inherited keys. | `lib/i18n/i18n.ts` now uses `Object.hasOwn` for both the dict/fallback lookup and placeholder interpolation. Regression test added (`tests/i18n.test.ts`). |
| 2 | MEDIUM | GLM | Sidebar theme‑toggle `aria-label` read `"Theme: Light. Theme → Dark"` (nonsensical for screen readers) — the i18n refactor reused `theme.label` where the original said "Switch to". | Added `theme.switchTo` ("Switch to {name}" / "Cambiar a {name}"); aria‑label now interpolates it. `sidebar.tsx:159`. |
| 3 | MEDIUM | GLM | `DICTIONARIES[locale]` had no fallback — a future `LOCALES` entry without a dictionary would pass `undefined` to `translate` and white‑screen. | `i18n-provider.tsx` now `DICTIONARIES[locale] ?? DICTIONARIES[DEFAULT_LOCALE]`. |
| 4 | MAJOR | CodeRabbit | `setLocale(event.target.value as Locale)` cast bypassed validation. | `language-setting.tsx` guards with `isLocale()` before `setLocale` (rejects tampered DOM values). |
| 5 | MAJOR/LOW | CodeRabbit, GLM | `aria-label="Language"` hardcoded English in every locale. | Added `settings.languageAriaLabel`; the switcher uses `t(...)`. |
| 6 | LOW | Antigravity | `navigator.languages` can be `undefined` (privacy/legacy modes), ignoring `navigator.language`. | `i18n-provider.tsx` falls back to `[navigator.language]`. |
| 7 | LOW | Antigravity | Spanish: "cartera" (Spain‑leaning) and "Libreta de direcciones" (clunky). | → "billetera" (broader LATAM) and "Contactos". |
| 8 | — | (own pass) | `action.expandMenu/collapseMenu/openNavigation` dict keys existed but the sidebar's menu buttons still hardcoded English. | Wired the outer `Sidebar` buttons to `t(...)`. |

## Deferred (documented tradeoffs)

- **English flash for non‑English browsers (MEDIUM — Antigravity, GLM).** State starts at `DEFAULT_LOCALE` (required to match SSR and avoid a hydration mismatch) and the real locale resolves in a mount effect, so an `es` browser sees English nav for one render. This is inherent to a client‑only i18n layer on a static export. The suggested fixes each cost more than the flash: `return null` until mounted produces a *blank* flash (worse, and kills prerendered content); per‑locale static routes (`/[lang]/…`) are a routing‑architecture change out of scope for the foundation. Users with a stored choice, and all English users, see no flash. Tracked as a follow‑up if more locales land.
- **`isLocale` case‑sensitivity for stored values (LOW — GLM).** `"ES"`/`"es_419"` in storage would be ignored. Not reachable: `setLocale` only ever writes lowercase values from `LOCALES`. Left as‑is.
- **Typo'd `t()` keys render verbatim with no build‑time signal (LOW — GLM).** Acceptable for the small foundation set; a keyof‑typed `t()` is a future hardening step as the catalog grows.
- **Raw `<select>` vs shadcn `Select` (LOW — GLM).** The existing Settings page already uses raw `<select>` (page.tsx:305, :533). Matching the surrounding file wins over the global "UI is shadcn/ui" note; kept raw for consistency.

## Verification

`npm run types && npm run lint && npm test` (249 unit) green; `NEXT_PUBLIC_USE_MOCK=false npm run build` (111 precache entries) clean; `e2e/i18n.spec.ts` (switch → assert Spanish nav → reload → persisted) passes.
