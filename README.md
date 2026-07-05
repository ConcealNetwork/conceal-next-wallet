# Conceal Next Wallet

[![CI](https://github.com/ConcealNetwork/conceal-next-wallet/actions/workflows/ci.yml/badge.svg)](https://github.com/ConcealNetwork/conceal-next-wallet/actions/workflows/ci.yml)
[![License: BSD-3-Clause](https://img.shields.io/badge/license-BSD--3--Clause-blue.svg)](LICENSE)

A fast, **non-custodial, in-browser wallet for Conceal (CCX)** — built with
Next.js (App Router) and React. Your keys are generated and stored **on your
device**; nothing is sent to a server.

**Live app:** https://concealnetwork.github.io/conceal-next-wallet/

> ⚠️ This wallet handles real funds in real-wallet mode. It is open source and
> under active development; review the [security policy](SECURITY.md) and use at
> your own risk until independently audited. Always back up your recovery phrase.

## Features

- Create a new wallet, or import via **recovery phrase, spend/view keys,
  encrypted backup file, or QR code** (with multi-language seed support).
- Send and receive CCX, with QR codes and payment URIs.
- **Deposits** (term deposits with interest), **encrypted messages**, and an
  **address book**.
- **Export** your wallet as an encrypted file or PDF backup.
- **Custom node** support, sync controls, and live market + network data.
- Security: encrypted local storage, password-gated unlock, and configurable
  **auto-lock** on inactivity.

## Security model

In real-wallet mode the engine runs entirely in your browser:

- Spend/view keys are derived locally and stored **encrypted** in IndexedDB
  (the v1-compatible `"wallet"` key). They never leave your device.
- The decrypted session is held in memory only — after a refresh (or auto-lock)
  you unlock again with your password.
- Blockchain sync runs in web workers against public (or your own custom) nodes.

Found a vulnerability? See [SECURITY.md](SECURITY.md) — please report privately.

## Two modes

| Mode | Env | Behavior |
|------|-----|----------|
| Mock (default) | unset or `NEXT_PUBLIC_USE_MOCK=true` | UI with mock data only — safe for design/E2E |
| Real wallet | `NEXT_PUBLIC_USE_MOCK=false` | In-browser engine (`lib/wallet-core`) + Conceal daemons |

## Development

Requires **Node 24+** and **npm 11+** (see `.nvmrc`).

```bash
npm install
npm run dev          # mock mode
```

Real wallet locally:

```bash
cp .env.example .env.local   # sets NEXT_PUBLIC_USE_MOCK=false
npm run dev
```

### Quality gate

CI runs all of these on every PR and push to `main`; they must pass:

```bash
npm run types     # tsc --noEmit
npm run lint      # Biome
npm test          # vitest
npm run build     # static export
```

End-to-end (Playwright, dev server on :3100):

```bash
npx playwright install chromium   # first time only
npm run test:e2e
```

### Production build (static export → GitHub Pages)

```bash
NEXT_PUBLIC_USE_MOCK=false PAGES_BASE_PATH=/conceal-next-wallet npm run build
```

### Dependency policy

[`.npmrc`](.npmrc) sets `min-release-age=7`, blocking package versions published
in the last 7 days on `npm install`/`npm update` (not on `npm ci`, which installs
the lockfile verbatim).

## Architecture

The UI talks only to a typed service layer; `lib/env.ts` swaps the implementation
by `NEXT_PUBLIC_USE_MOCK`:

- Interfaces: `lib/services/*.service.ts`
- Mock: `lib/services/mock` · Real: `lib/services/real` → `lib/wallet-core`

See [`CLAUDE.md`](CLAUDE.md) for a full architecture tour and
[`CONTRIBUTING.md`](CONTRIBUTING.md) to get started.

## Cordova

Build a Cordova-ready static export (real wallet, WebView-safe paths) and copy the
patched output into the sibling [`conceal-wallet-cordova`](../conceal-wallet-cordova)
project’s `www/` folder:

```bash
npm run cordova
```

Requires `.env.local` (see `.env.example`). Then build the APK from
`../conceal-wallet-cordova` (e.g. `./switch.sh` or `./build-with-version.sh`).

## License

[BSD-3-Clause](LICENSE) — derived from the Conceal / Masari / Karbo wallet
lineage.
