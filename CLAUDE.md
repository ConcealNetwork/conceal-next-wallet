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

**`lib/wallet-core` is ported v1 code, kept deliberately legacy.** Classes like `Wallet`, `WalletWatchdog`, `TransactionsExplorer`, `KeysRepository`, `Cn`, `ChaCha8`, `Mnemonic` come from `conceal-web-wallet@development` and are mid-migration. Biome applies a **relaxed override for `lib/wallet-core/**`** (allows `any`, disables many style/complexity rules) — do **not** "modernize" this code to idiomatic TS; match the surrounding legacy style. To read the upstream source it's migrated from, use `opensrc path 'ConcealNetwork/conceal-web-wallet@development'` (see project memory).

**Real mode depends on non-module browser globals loaded in a fixed order.** `lib/conceal/init.ts` injects vendored scripts onto `window`/`self`: `biginteger → nacl-fast → nacl-util → concealjs → window.config` (extended set for export/QR/sync). Sources live in `public/lib/` (manifest: `public/lib/legacy-manifest.json`), copied from the legacy repo by `npm run sync:legacy-libs` (which expects a `../conceal-web-wallet/src` sibling checkout). `concealjs` itself is built from the `conceal-lib-js` dependency via `npm run concealjs:prebuild`.

**Wallet sync runs in web workers** (`public/workers/`). Workers can't see `window.config`, so `generate:config` emits `public/config.js` (`self.config`) and `build:sync-worker` esbuild-bundles the worker with a globals banner. Both run automatically in `prebuild:wallet` before `next build` — but if you edit `lib/config/wallet-network-scalars.mjs` or sync-worker code and run `next dev`, regenerate them manually.

**Static export, no server.** `next.config.mjs` sets `output: "export"` (deploys to `out/`) with `images.unoptimized`. For subpath deploys, `PAGES_BASE_PATH` flows to `NEXT_PUBLIC_BASE_PATH`; Next only auto-prefixes `Link`/favicon, so **raw asset URLs must be prefixed manually** via `lib/conceal/asset-path.ts` (`publicAssetPath`).

**Routing & layout.** App Router with route groups: `(onboarding)` (create/import), `(wallet)`, `(legal)` (terms/privacy/support). There is **no `src/` dir** — `@/*` aliases the repo root. UI is shadcn/ui (`components/ui`, style `base-nova`, lucide icons).

**Real-mode storage/security.** The encrypted wallet lives in IndexedDB under the v1-compatible `"wallet"` key. Keys are **not** persisted in React session across reloads (`persistWalletSession` is mock-only) — the user must unlock again after refresh.

## Conventions & gotchas

- **Biome only** (no ESLint/Prettier): 2-space indent, double quotes, semicolons, trailing commas, line width 100, imports auto-organized. Most lint rules are `warn`, but **CI gates** on `npm run lint`/`npm run types` (they exit non-zero on errors), so run both before pushing.
- **`.npmrc` `min-release-age=7`** blocks packages published in the last 7 days on `npm install`/`npm update` (not `npm ci`). Requires npm 11+ / Node 24.
- **Tests:** unit tests in `tests/` (vitest, jsdom, coverage over `lib/**`); E2E in `e2e/` (Playwright, port 3100). `test-results/` is a Playwright artifact — don't commit it.
- **CI** (`.github/workflows/`): `ci.yml` runs typecheck · lint · test · static build · Playwright e2e, plus security gates (gitleaks secret-scan, `dependency-review`, `actionlint`, commitlint) and informational jobs (npm audit, bundle-size, Lighthouse). `codeql.yml` + `scorecard.yml` are scheduled security scans. A single **`ci-complete`** job aggregates results — make that the required status check for branch protection. Third-party actions are SHA-pinned (Dependabot bumps them). Commits must follow Conventional Commits (`<type>: …`).
