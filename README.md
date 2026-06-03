# Conceal Next Wallet

Next.js App Router recreation of the Conceal CCX wallet, with a typed service layer and optional real browser wallet backend.

## Modes

| Mode | Env | Behavior |
|------|-----|----------|
| Mock (default) | unset or `NEXT_PUBLIC_USE_MOCK=true` | UI mock data only — safe for design/E2E |
| Real wallet | `NEXT_PUBLIC_USE_MOCK=false` | Legacy v1 engine (`lib/wallet-core`) + public daemons |

## Run

```bash
npm install
npm run sync:legacy-libs   # copy v1 browser scripts to public/lib/
npm run dev                # mock mode
```

Real wallet locally (copy `.env.example` → `.env.local`, or inline for one-off runs):

```bash
cp .env.example .env.local   # sets NEXT_PUBLIC_USE_MOCK=false
npm run dev
```

```bash
NEXT_PUBLIC_USE_MOCK=false npm run dev
```

Refresh vendored crypto after updating `conceal-lib-js`:

```bash
npm run concealjs:prebuild
npm run sync:legacy-libs
```

## Verify

```bash
npm run build
npm run types
npm run lint
npm run format            # optional: auto-format scoped files
npm test
npx playwright install chromium   # first time only
npm run test:e2e
```

CI runs a non-blocking quality workflow (`.github/workflows/npm-audit.yml`): `npm audit`, typecheck, and Biome — all report-only.

## Dependency policy

Project [`.npmrc`](.npmrc) sets `min-release-age=7`, which blocks package versions published in the last 7 days on **`npm install`** / **`npm update`**. It does **not** apply to **`npm ci`** (lockfile is installed verbatim). Requires npm 11+ (Node 24).

Production static export (GitHub Pages uses this in CI):

```bash
NEXT_PUBLIC_USE_MOCK=false PAGES_BASE_PATH=/conceal-next-wallet npm run build
```

## Backend wiring

The UI talks to typed services only:

- Interfaces: `lib/services/*.service.ts`
- Mocks: `lib/services/mock`
- Real: `lib/services/real` → `lib/wallet-core` + `lib/conceal/init.ts`
- Swap: `lib/env.ts` (`NEXT_PUBLIC_USE_MOCK` in `.env.local`) → `lib/services/index.ts`

Legacy browser globals manifest: `public/lib/legacy-manifest.json`

## Safety

Real mode stores an encrypted wallet in IndexedDB (v1-compatible `"wallet"` key). Keys are not persisted in React session state across reloads — unlock again after refresh. Use at your own risk until audited.
