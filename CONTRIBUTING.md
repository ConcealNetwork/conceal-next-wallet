# Contributing

Thanks for helping improve Conceal Next Wallet. This is a real wallet that ships
to users, so correctness and security come first.

## Prerequisites

- **Node 24+** and **npm 11+** (see `.nvmrc`). `.npmrc` enforces
  `min-release-age=7`, so freshly published packages are blocked on
  `npm install`/`npm update` (not on `npm ci`).

## Setup

```bash
npm install
npm run dev          # mock mode (NEXT_PUBLIC_USE_MOCK defaults to true)
```

Run the real in-browser wallet locally:

```bash
cp .env.example .env.local   # sets NEXT_PUBLIC_USE_MOCK=false
npm run dev
```

## The two modes

All UI talks to a typed service layer (`lib/services`). `NEXT_PUBLIC_USE_MOCK`
selects the implementation:

- `true` (default) → `lib/services/mock` (UI mock data; safe for design/E2E)
- `false` → `lib/services/real` → the ported engine in `lib/wallet-core`

**When you add or change a wallet feature, update the service _interface_ AND
both the mock and real implementations** — a change in only one mode breaks the
other.

## Quality gate (run before pushing)

```bash
npm run types     # tsc --noEmit
npm run lint      # Biome (lint:fix to autofix)
npm test          # vitest
npm run build     # static export must succeed
```

CI runs all of these on every PR and must pass before merge.

## Conventions

- **Biome only** (no ESLint/Prettier): 2-space indent, double quotes,
  semicolons, trailing commas, width 100. Run `npm run format:fix`.
- **`lib/wallet-core/**` is ported legacy CryptoNote code** kept deliberately in
  its original style (it has a relaxed Biome override). Do **not** modernize it
  to idiomatic TS — match the surrounding code.
- **Conventional commits**: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`,
  `chore:`, `perf:`, `ci:`.
- Prefer many small, focused files over large ones.

See `CLAUDE.md` for a deeper architecture tour.

## Tests

- Unit/integration tests in `tests/` (vitest, jsdom).
- E2E in `e2e/` (Playwright, dev server on port 3100). First run:
  `npx playwright install chromium`.

## Pull requests

1. Branch from `main`.
2. Keep the change focused; update docs when behavior changes.
3. Ensure the quality gate passes locally and in CI.
4. Fill out the PR template (summary, test plan, checklist).

## Security

Never report vulnerabilities in public issues — see [SECURITY.md](SECURITY.md).
