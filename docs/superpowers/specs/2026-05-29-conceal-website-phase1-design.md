# Conceal Website — Phase 1 (Foundation + Home) Design

> Status: approved design · 2026-05-29
> Scope of this spec: **Phase 1 only** (project foundation + home page). Later
> phases get their own spec → plan → build cycles.

## 1. Goal

Build a new marketing website for Conceal Network that reproduces the content of
the existing site (https://www.conceal.network) in the visual style of the
Conceal Web Wallet's "Aurora" splash/landing design.

The existing wallet design **is** the official Conceal brand language. The
official branding statement (conceal.network/branding) reads:

> "Backgrounds are often darkened, shrouded, or obscured. Text is a Grey or
> White on blackened backgrounds. The deep Yellow is used sparingly… ample
> shades of greys and blacks implies that though much is hidden, what lies
> underneath is truly special."

So porting the wallet's warm-dark + sparing-orange + frosted-glass system is
both the fastest path and the on-brand one.

## 2. Overall project (full parity) — phased roadmap

Full parity (~15 routes) is decomposed into sub-projects, each its own cycle:

- **Phase 1 (this spec):** Foundation (design system port + shared shell) + home page.
- **Phase 2:** Core pages — About/Manifesto, Earn, Messaging, Roadmap, Team.
- **Phase 3:** Secondary pages — Community, Mining, Partners, Donate, Branding, Labs, In-the-Media, Contact.
- **Phase 4:** Dynamic data — live market price, mining pools, partner feeds.

## 3. Approach (chosen)

Separate repo, **port the Aurora foundation** (copy the wallet's design tokens,
fonts, glass primitives, and brand assets into the new project).

Rejected alternatives: monorepo/shared design package (big wallet refactor,
user chose a separate repo); rebuild visual language from scratch (divergence
risk, less reuse).

## 4. Tech & hosting (chosen)

- **Next.js 16 App Router + Tailwind v4 + Geist**, mirroring the wallet.
- **Static export** (`output: 'export'`, `trailingSlash`, `images.unoptimized`).
- Base-path handling identical to the wallet: `basePath`/`assetPrefix` from
  `PAGES_BASE_PATH`, `NEXT_PUBLIC_BASE_PATH` exposed, and a `withBasePath()`
  helper for raw asset refs (`<img src>`, CSS `url()`).
- **Deploy:** new repo `ConcealNetwork/conceal-website` + the same GitHub Pages
  Actions workflow as the wallet. **Scaffold locally and confirm with the user
  before creating the repo or pushing.**
- Marketing content only — no wallet session, guards, or mock services.

## 5. Project structure

```
~/Projects/conceal-website/
  app/
    layout.tsx            # Geist + Geist Mono, body ambient glow, metadata
    globals.css           # ported Aurora tokens + glass utilities
    page.tsx              # home (composes section components)
    icon.svg, favicon.ico # official Conceal mark
  components/
    layout/{nav,footer}.tsx
    ui/{button,card}.tsx          # ported glass primitives
    home/                         # one file per home section (see §6)
    brand/conceal-backdrop.tsx    # coin/aura backdrop (ported)
  lib/
    utils.ts              # cn, withBasePath
    snapshot.ts           # static price + mining-pool sample data (Phase 1)
    earn.ts               # compound-interest math (pure, unit-tested)
    links.ts              # central registry of external URLs (wallet, explorer, …)
  public/brand/           # official logo set + reused coin/marks
  .github/workflows/deploy.yml
  next.config.mjs, package.json, tsconfig, eslint, postcss, vitest config
```

Many small, focused files (one component per home section).

## 6. Home page — sections (faithful content, Aurora styling)

Each is its own component under `components/home/`:

1. **Nav** — Conceal logo (official mark) + section anchor links (About, Earn,
   Messaging, Mining, Partners) + "Open Web Wallet" primary CTA →
   `wallet.conceal.network`. Phase-1 nav uses in-page anchors only (no dead
   internal routes); dedicated inner-page nav items are added as those pages
   ship in later phases.
2. **Hero** — "Privacy." statement headline + 3D coin backdrop + ambient glow;
   primary CTA (Open Web Wallet) + secondary (Get CCX / Learn more).
3. **About** — "We are about" intro paragraph.
4. **Feature trio** (glass cards) — Conceal-Earn banking · Encrypted Messages ·
   Untraceable/private transactions.
5. **Conceal-Earn calculator** — interactive compound-interest tool, pure
   client-side math from `lib/earn.ts`, Aurora glass styling.
6. **Wallets** — Conceal-Desktop · Conceal-Core (CLI) · Web & Paper · Mobile,
   each a card with the real download/link.
7. **Getting CCX** — CCX plus wCCX on Polygon / BSC / Ethereum, with the real
   external buy links.
8. **Mining** — Tier 1/2/3 + a pools table rendered from `lib/snapshot.ts`
   (snapshot data, clearly marked; live in Phase 4).
9. **Markets** — price/market snapshot card (snapshot data; live in Phase 4).
10. **Partners** — partner logo strip (real logos sourced from the live site).
11. **Footer** — full link groups (General / Tools / Community) + socials, using
    `lib/links.ts`.

Content is reproduced faithfully from the existing home; copy is sourced by
rendering the live site during implementation.

## 7. Data approach (Phase 1)

- `lib/snapshot.ts` — typed static sample data for the price card and mining
  pools table, clearly commented as snapshots pending Phase 4 live wiring.
- `lib/earn.ts` — pure compound-interest function(s); unit-tested with Vitest.
- No network calls in Phase 1.

## 8. Assets

- Pull the official logo set into `public/brand/`:
  `/images/branding/logo.svg` + dark/white PNGs (1600 & 256).
- Reuse the wallet's 3D coin (`conceal-coin.png`) and faceted-C marks.
- Generate via **codex (GPT Image 2)** only where genuinely needed (e.g. a
  subtle section/hero accent) — kept minimal to avoid AI-slop; honest
  placeholders otherwise.
- Partner logos sourced from the live site (real assets, not generated).
- All raster assets downscaled before commit (as in the wallet).

## 9. External links

All external tool links keep their real URLs via `lib/links.ts`: Web Wallet,
Paper Wallet, Explorer, Bridge, Marketplace, Wiki, Docs, GitHub, Medium,
community channels, donate.

## 10. Verification & deploy

- `npm run lint`, `npm run build` (with `PAGES_BASE_PATH` set), `npm test`
  (calculator math + any utils).
- Playwright screenshot pass of the home (full page + key sections) for visual
  review before sign-off.
- GitHub Pages workflow identical to the wallet; **repo creation/push gated on
  explicit user confirmation.**

## 11. Out of scope (Phase 1)

- Inner routes (About, Manifesto, Earn, Messaging, Roadmap, Team, Community,
  Mining, Partners, Donate, Branding, Labs, In-the-Media, Contact) → Phases 2–3.
- Live/dynamic data (price, pools, feeds) → Phase 4.
- i18n / language switcher (present on the current site) → later phase.

## 12. Success criteria (Phase 1)

- New `conceal-website` project builds as a static export and runs locally.
- Home page reproduces the existing home's sections with faithful content in the
  Aurora style; calculator is interactive; snapshot-driven sections render.
- Lint/build/tests pass; home verified via screenshots.
- Ready to deploy to GitHub Pages on user confirmation.
