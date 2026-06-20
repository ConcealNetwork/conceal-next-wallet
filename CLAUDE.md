# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Conceal Next Wallet — a Next.js App Router (Next 16 / React 19) recreation of the Conceal CCX wallet. It runs in two modes behind one typed service layer: a **mock** UI (default) and a **real** in-browser wallet whose engine (`lib/wallet-core`) is being migrated from the legacy `conceal-web-wallet` repo.

## Commands

```bash
npm install                  # respects .npmrc min-release-age=7 (see Dependency policy); needs npm 11+/Node 24
npm run dev                  # mock mode (NEXT_PUBLIC_USE_MOCK defaults to true)
NEXT_PUBLIC_USE_MOCK=false npm run dev   # real wallet (or copy .env.example → .env.local)

npm run build                # prebuild:wallet (generate:config + build:sync-worker) → static export to out/
npm run types                # tsc --noEmit
npm run lint                 # Biome lint (lint:fix to autofix)
npm run format               # Biome format (format:fix to write)
npm test                     # vitest run (jsdom)
npm run test:e2e             # Playwright (first run: npx playwright install chromium; webServer on :3100)
```

- **Single unit test:** `npx vitest run tests/utils.test.ts`, or by name: `npx vitest run -t "formats amount"`, or watch a file: `npx vitest tests/utils.test.ts`.
- **Production static export (GitHub Pages):** `NEXT_PUBLIC_USE_MOCK=false PAGES_BASE_PATH=/conceal-next-wallet npm run build`.
- **Refresh vendored crypto** (after bumping `conceal-lib-js` or the legacy repo): `npm run concealjs:prebuild && npm run sync:legacy-libs`.

## Architecture

**Typed service layer is the spine.** All UI talks to `services` from `lib/services/index.ts` — never to `wallet-core` directly. `WalletServices` aggregates 8 services (`wallet`, `transactions`, `market`, `messages`, `deposits`, `addressBook`, `network`, `settings`), each defined as an interface in `lib/services/*.service.ts`. `lib/env.ts` reads `NEXT_PUBLIC_USE_MOCK` (inlined at build time): `true` (default) → `lib/services/mock`; `false` → `lib/services/real`, which is **lazy-`require`d** so mock mode and tests never pull `wallet-core` at module init.

> **When adding or changing a wallet feature, update the interface AND both the mock and real implementations.** A change in only one mode breaks the other.

**Purely-local UI metadata bypasses the service layer.** State that is device-local and identical in both modes — display ticker (`lib/ui/ticker-preference.ts`), per-transaction notes (`lib/storage/tx-notes.ts`), UI locale (`lib/i18n`), passkey unlock enrollments (`lib/auth` — multi-authenticator, WebAuthn-PRF) — is consumed directly by the UI rather than threaded through the 8 services (which would just duplicate identical mock/real code). Keep these self-contained and **free of `wallet-core` imports** so mock mode never pulls the engine; `lib/storage/*` stores guard `typeof indexedDB` for static-export/SSR safety. **i18n** (`lib/i18n`): bundled dictionaries for **10 locales** (`en`/`es`/`fr`/`de`/`it`/`pt`/`ru`/`zh`/`ja`/`ko`) + a client `I18nProvider` (localStorage `ccx-locale`, `navigator.languages` detection); strings render via `t("namespace.key")` with `{placeholder}` interpolation. State starts at `DEFAULT_LOCALE` (en) to match SSR (non-en browsers see a one-render English flash — inherent to client-only i18n on a static export). Add a string → add the key to **all 10** dictionaries (a test asserts every locale covers EXACTLY the `en` key set — no missing/extra). Every neutral page label + safe runtime toast is localized; **security/consequence copy is deliberately kept English** (send/deposit/message broadcast confirmations, recovery-phrase + seed onboarding, panic-wipe/delete, key export, the storage-data-safety banner) — it awaits a translator-in-the-loop and must NOT be machine-translated. Keep `en` values byte-identical (the forced-mock e2e selects by exact English name).

**`lib/wallet-core` is ported v1 code, kept deliberately legacy.** Classes like `Wallet`, `WalletWatchdog`, `TransactionsExplorer`, `KeysRepository`, `Cn`, `ChaCha8`, `Mnemonic` come from `conceal-web-wallet@development` and are mid-migration. Biome applies a **relaxed override for `lib/wallet-core/**`** (allows `any`, disables many style/complexity rules) — do **not** "modernize" this code to idiomatic TS; match the surrounding legacy style. To read the upstream source it's migrated from, use `opensrc path 'ConcealNetwork/conceal-web-wallet@development'` (see project memory). **UI/service code no longer imports `lib/wallet-core` (#91 decoupling).** The UI-facing helpers that used to live in `wallet-core/mappers`, `CoinUri`, and `Interest` were relocated to neutral modules — `lib/ui/transaction-kind.ts` (tx classification: `resolveUiTransactionType`/`isUiMessageOut`), `lib/ui/coin-uri.ts` (payment URIs), `lib/messages/thread-mappers.ts` (message threads; `RawAddressEntry` moved to `lib/types`), `lib/deposits/interest.ts` (deposit interest, de-globalized off `window.config`) — each re-exported from its old `wallet-core` path so the engine's own internal consumers keep working. The engine stays behind the `NEXT_PUBLIC_WALLET_ENGINE=wallet-core` escape hatch pending full removal (the only remaining #91 step, gated on SDK-readiness). **After relocating any wallet-core-bundled source, regenerate `public/workers/wallet-sync.bundle.js`** (`npm run build:sync-worker`) — the tracked artifact otherwise ships stale code.

**Real mode depends on non-module browser globals loaded in a fixed order.** `lib/conceal/init.ts` injects vendored scripts onto `window`/`self`: `biginteger → nacl-fast → nacl-util → concealjs → window.config` (extended set for export/QR/sync). Sources live in `public/lib/` (manifest: `public/lib/legacy-manifest.json`), copied from the legacy repo by `npm run sync:legacy-libs` (which expects a `../conceal-web-wallet/src` sibling checkout). `concealjs` itself is built from the `conceal-lib-js` dependency via `npm run concealjs:prebuild`.

**Wallet sync runs in web workers** (`public/workers/`). Workers can't see `window.config`, so `generate:config` emits `public/config.js` (`self.config`) and `build:sync-worker` esbuild-bundles the worker with a globals banner. Both run automatically in `prebuild:wallet` before `next build` — but if you edit `lib/config/wallet-network-scalars.mjs` or sync-worker code and run `next dev`, regenerate them manually.

**Static export, no server.** `next.config.mjs` sets `output: "export"` (deploys to `out/`) with `images.unoptimized`. For subpath deploys, `PAGES_BASE_PATH` flows to `NEXT_PUBLIC_BASE_PATH`; Next only auto-prefixes `Link`/favicon, so **raw asset URLs must be prefixed manually** via `lib/conceal/asset-path.ts` (`publicAssetPath`).

**Routing & layout.** App Router with route groups: `(onboarding)` (create/import), `(wallet)`, `(legal)` (terms/privacy/support). There is **no `src/` dir** — `@/*` aliases the repo root. UI is shadcn/ui (`components/ui`, style `base-nova`, lucide icons). **Shell (#122, `components/layout/`):** a sticky `GlobalHeader` (brand, `WalletSwitcher`, sync pill, notifications, theme) over a grouped left sidenav (Wallet / Banking / More) and a **contextual right rail** — a page registers its own rail content via `usePageRightRail(<Rail/>[, deps])` (`right-rail.tsx` `RightRailProvider`; the node re-registers only on `deps` change, e.g. row selection); the shell renders it in a ~320px column at **≥1200px** (collapsible to a strip; a `min-[1200px]:hidden` body fallback below the breakpoint). Account + Transactions ship rails (`components/layout/rails/`); the Transactions detail rail shows on row-select at ≥1200px and falls back to the dialog when narrow or the rail is collapsed (`useMediaQuery`). Tailwind v4 gotcha: `.hidden` beats `.xl:block` by source order — use a single `max-[1199px]:hidden` to hide-below-breakpoint.

**Real-mode storage/security.** The encrypted wallet lives in IndexedDB under the v1-compatible `"wallet"` key. Keys are **not** persisted in React session across reloads (`persistWalletSession` is mock-only) — the user must unlock again after refresh.

**Multi-wallet (#95, SDK engine).** Several encrypted wallets coexist in the one IndexedDB store via a `"wallets-index"` registry (`lib/services/real-sdk/wallets-index.ts`): the **default** wallet keeps the bare `"wallet"` key (`namespace: ""`, id `"default"`) for legacy/back-compat; each ADDITIONAL wallet gets a namespaced keyspace (`createNamespacedStorage`, keys `<id>:<key>`). The runtime (`runtime.ts`) operates on the **active** wallet's storage (`SdkRuntime.storage`); `adopt` REGISTERS a new wallet (create/import = "Add wallet", never overwrites), `unlock` opens the active keyspace + caches its address, delete/panic-wipe target the active wallet. The service spine adds `listWallets/switchWallet/renameWallet/deleteWallet` (`WalletSummary`); `switchWallet` locks + sets active, then the UI re-unlocks the target (real mode bounces to the landing unlock dialog via `?next=`; mock keeps the session and refetches). UI is the sidebar-header **switcher** (`components/layout/wallet-switcher.tsx`, under the brand) + a **Wallets** section in Settings (`components/wallet/wallets-setting.tsx`). The legacy `wallet-core` engine is single-wallet — its `listWallets` returns one entry and switch/rename/delete throw "Multiple wallets require the SDK engine." **Passkey enrollments are keyed per wallet id** (`lib/auth/biometric-store.ts`, key suffix `:<walletId>`; the default wallet inherits the unchanged legacy global key, so existing enrollments migrate for free); callers resolve the active id via `lib/auth/active-wallet-id.ts` (lazy, real-SDK-only — never pulls the engine into mock mode). The `OnboardingGuard` permits `/create` + `/import` for an OPEN session so "Add wallet" works.

## Conventions & gotchas

- **Biome only** (no ESLint/Prettier): 2-space indent, double quotes, semicolons, trailing commas, line width 100, imports auto-organized. Most lint rules are `warn`, but **CI gates** on `npm run lint`/`npm run types` (they exit non-zero on errors), so run both before pushing.
- **`.npmrc` `min-release-age=7`** blocks packages published in the last 7 days on `npm install`/`npm update` (not `npm ci`). Requires npm 11+ / Node 24.
- **Tests:** unit tests in `tests/` (vitest, jsdom, coverage over `lib/**`); E2E in `e2e/` (Playwright, port 3100). `test-results/` is a Playwright artifact — don't commit it.
- **CI** (`.github/workflows/`): `ci.yml` runs typecheck · lint · test · static build · Playwright e2e, plus security gates (gitleaks secret-scan, `dependency-review`, `actionlint`, commitlint) and informational jobs (npm audit, bundle-size, Lighthouse). `codeql.yml` + `scorecard.yml` are scheduled security scans. The single **`ci-complete`** job is the required status check for branch protection. Third-party actions are SHA-pinned (Dependabot bumps them). Commits must follow Conventional Commits (`<type>: …`).
- **Port 3000 is reserved** (other dev work) — never launch `npm run dev` there. Use an alternate port for ad-hoc runs: `PORT=3200 NEXT_PUBLIC_USE_MOCK=true npm run dev` (or `npm run dev -- -p 3200`). Keep 3000 and 3100 (e2e) free; kill ad-hoc servers when done.

## Multi-agent feature workflow (default)

Backlog features are built with a collaborative multi-model workflow. Artifacts live under `docs/{specs,design,reviews}/<feature>/`. The co-agents (run headless, each writes only its own file — no parallel edits to shared source):

| Agent | Invocation |
|---|---|
| Codex (gpt-5.5) | `codex exec --dangerously-bypass-approvals-and-sandbox -m gpt-5.5 "…"` |
| Antigravity (Gemini 3.1 Pro) | `agy -p "…" --model "Gemini 3.1 Pro (High)" --dangerously-skip-permissions --print-timeout 20m` |
| GLM-5.2 | `opencode run --dangerously-skip-permissions -m zai/glm-5.2 "…"` |
| CodeRabbit | `coderabbit review --plain -t all --base main` |

Phases:
1. **Spec (parallel).** A shared `BRIEF.md` grounds **four** independent specs — Codex, Gemini, GLM, **and an Opus 4.8 subagent** (`Agent` tool, `model: opus`). The orchestrator (Opus, main thread) synthesizes the best ideas into `spec-merged.md`, noting provenance and resolving forks.
2. **Design (UI/UX).** Invoke the `huashu-design` skill, grounded in `DESIGN.md` + existing component patterns (don't invent new visual language). The three co-agents each contribute 3 hi-fi HTML variants; curate best-per-element into `DESIGN-DECISIONS.md`. Then **assemble all variants into one combined `review.html`** (iframes of each agent's sheet + a header noting the recommended pick), serve it (`python3 -m http.server <port> --directory docs/design/<feature>`) and **open it in the user's browser**. **STOP — wait for the user to approve the design before implementing.** Do not proceed to phase 3 on design assumptions.
3. **Implement.** Orchestrator drives the edits (TDD: foundation → service interface + real + mock → UI); co-agents advise only — never let multiple agents edit source concurrently. Honor the spine rule (interface + both impls) and immutability.
4. **Review (parallel).** Codex + Gemini + GLM each review the diff (read-only, write findings files) **plus** CodeRabbit. Address CRITICAL/HIGH; document deferrals in `RESPONSE.md` and the PR (don't silently dismiss).
5. **Verify.** Gate is `npm run types && npm run lint && npm test && npm run test:e2e` (add an `e2e/<feature>.spec.ts`). A live `claude-in-chrome` visual pass when a same-machine browser is available.
6. **Document.** Update the docs the change touches — `CLAUDE.md` (commands, conventions, gotchas, or the workflow itself), `README`, and any affected `docs/` — and fold in workflow learnings/feedback from the run. **Commit on the feature branch so it ships in the same PR, not as a follow-up.**
7. **PR** with multi-agent provenance + test plan + review response (the doc updates from phase 6 are part of it).

`docs/**` is excluded from Biome (it holds specs + design-mockup HTML, not source).
