# Conceal Website — Phase 1 (Foundation + Home) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold a new static-export Next.js marketing site (`~/Projects/conceal-website`) that reproduces conceal.network's home content in the wallet's "Aurora" design language.

**Architecture:** Next 16 App Router + Tailwind v4 + Geist, static export to GitHub Pages. Port the wallet's Aurora design tokens, glass primitives, and brand assets. Home is composed of small per-section components; data-driven sections read static snapshots (`lib/snapshot.ts`); the Conceal-Earn calculator is pure client math (`lib/earn.ts`, unit-tested). Raw asset paths go through `withBasePath()` for the Pages subpath.

**Tech Stack:** Next.js 16, React 19, Tailwind CSS v4, TypeScript, Vitest + Testing Library, Playwright (verification), Geist fonts.

**Reference source of truth:** the wallet repo at `/Users/travis/Projects/conceal-next-wallet` — copy proven config/tokens/primitives from there rather than reinventing. Content/copy comes from rendering https://www.conceal.network during the relevant tasks.

---

## File Structure

```
~/Projects/conceal-website/
  package.json, next.config.mjs, tsconfig.json, postcss.config.mjs,
  eslint.config.mjs, vitest.config.ts, .gitignore
  app/
    layout.tsx          # Geist + Geist Mono, ambient glow, metadata
    globals.css         # Aurora tokens + glass utilities (ported)
    page.tsx            # home composition
    fonts/              # GeistVF.woff, GeistMonoVF.woff (copied from wallet)
    icon.svg, favicon.ico
  components/
    ui/{button.tsx,button-variants.ts,card.tsx}
    layout/{nav.tsx,footer.tsx}
    brand/conceal-backdrop.tsx
    home/{hero,about,feature-trio,earn-calculator,wallets,getting-ccx,mining,markets,partners}.tsx
  lib/{utils.ts,links.ts,snapshot.ts,earn.ts}
  tests/{earn.test.ts,utils.test.ts}
  public/brand/         # official logo set + reused coin/marks
  .github/workflows/deploy.yml
```

---

## Task 1: Scaffold project + config

**Files (all Create):** `package.json`, `next.config.mjs`, `tsconfig.json`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Create the project directory and copy proven config from the wallet.**

```bash
mkdir -p ~/Projects/conceal-website && cd ~/Projects/conceal-website
W=/Users/travis/Projects/conceal-next-wallet
cp "$W"/{tsconfig.json,postcss.config.mjs,eslint.config.mjs,.gitignore} . 2>/dev/null || true
cp "$W"/vitest.config.* . 2>/dev/null || true
mkdir -p app components lib tests public/brand app/fonts .github/workflows
cp "$W"/app/fonts/GeistVF.woff "$W"/app/fonts/GeistMonoVF.woff app/fonts/
```

- [ ] **Step 2: Write `package.json`** (mirror the wallet's deps; drop wallet-only libs like react-query, react-hook-form, qrcode, recharts unless a section needs them — Phase 1 home needs none of those).

```json
{
  "name": "conceal-website",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "NODE_OPTIONS=--no-deprecation next build",
    "start": "next start",
    "lint": "eslint .",
    "test": "NODE_OPTIONS=--no-deprecation vitest run"
  },
  "dependencies": {
    "class-variance-authority": "^0.7.1",
    "clsx": "^2.1.1",
    "lucide-react": "^1.17.0",
    "next": "16.2.6",
    "react": "19.2.6",
    "react-dom": "19.2.6",
    "tailwind-merge": "^3.6.0"
  },
  "devDependencies": {
    "@tailwindcss/postcss": "^4.3.0",
    "@testing-library/jest-dom": "^6.9.1",
    "@testing-library/react": "^16.3.2",
    "@types/node": "^25",
    "@types/react": "19.2.15",
    "@types/react-dom": "19.2.3",
    "@vitejs/plugin-react": "^6.0.2",
    "eslint": "^10.4.0",
    "eslint-config-next": "16.2.6",
    "jsdom": "^29.1.1",
    "postcss": "^8.5.10",
    "tailwindcss": "^4.3.0",
    "typescript": "^6",
    "vitest": "^4.1.7"
  },
  "overrides": { "@types/react": "19.2.15", "@types/react-dom": "19.2.3", "postcss": "^8.5.10" }
}
```

- [ ] **Step 3: Write `next.config.mjs`** (identical base-path handling to the wallet).

```js
/** @type {import('next').NextConfig} */
const basePath = process.env.PAGES_BASE_PATH ?? '';
const nextConfig = {
  output: 'export',
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};
export default nextConfig;
```

- [ ] **Step 4: Verify `vitest.config.ts` exists and references `tests/setup.ts`.** If the wallet's config referenced a setup file, copy `tests/setup.ts` too:

```bash
cp /Users/travis/Projects/conceal-next-wallet/tests/setup.ts tests/ 2>/dev/null || true
```

If no vitest config was copied, create `vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import { resolve } from "node:path"
export default defineConfig({
  plugins: [react()],
  test: { environment: "jsdom", setupFiles: ["tests/setup.ts"], globals: true },
  resolve: { alias: { "@": resolve(__dirname, ".") } },
})
```

And `tests/setup.ts` (if not copied): `import "@testing-library/jest-dom/vitest"`

- [ ] **Step 5: `npm install`**

Run: `npm install`
Expected: completes, `found 0 vulnerabilities`.

- [ ] **Step 6: `git init` + first commit**

```bash
git init -q && git add -A && git commit -q -m "chore: scaffold conceal-website (Next static export config)"
```

---

## Task 2: Design system — fonts, tokens, root layout

**Files:** Create `app/globals.css`, `app/layout.tsx`. Copy `app/icon.svg`, `app/favicon.ico` later (Task 8).

- [ ] **Step 1: Port `app/globals.css` from the wallet verbatim** (Aurora tokens, glass `wallet-card` utility renamed to `glass-card`, ambient body glow, `--font-mono`).

```bash
cp /Users/travis/Projects/conceal-next-wallet/app/globals.css app/globals.css
```

Then rename the utility for a marketing context: in `app/globals.css` change the `@utility wallet-card` block name to `@utility glass-card` (same body). Keep everything else (tokens, body ambient glow, animations).

- [ ] **Step 2: Write `app/layout.tsx`** (Geist + Geist Mono local fonts, dark class, ambient body, metadata).

```tsx
import type { Metadata } from "next"
import localFont from "next/font/local"
import { cn } from "@/lib/utils"
import "./globals.css"

const geist = localFont({ src: "./fonts/GeistVF.woff", variable: "--font-sans", weight: "100 900" })
const geistMono = localFont({ src: "./fonts/GeistMonoVF.woff", variable: "--font-mono", weight: "100 900" })

export const metadata: Metadata = {
  title: "Conceal Network — Privacy-Protected DeFi & Encrypted Communications",
  description: "Conceal Network (CCX): untraceable payments, encrypted messaging, and interest-earning deposits. Privacy you control.",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={cn("dark font-sans", geist.variable, geistMono.variable)}>
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 3: Commit** — `git add -A && git commit -q -m "feat: port Aurora design tokens, fonts, root layout"`

(Build verification deferred to Task 3 once `lib/utils` exists, since layout imports `cn`.)

---

## Task 3: `lib/utils.ts` (cn + withBasePath) — TDD

**Files:** Create `lib/utils.ts`, `tests/utils.test.ts`

- [ ] **Step 1: Write the failing test** (`tests/utils.test.ts`)

```ts
import { describe, expect, it } from "vitest"
import { cn, withBasePath } from "@/lib/utils"

describe("utils", () => {
  it("merges class names", () => {
    expect(cn("p-2", "p-4")).toBe("p-4")
  })
  it("withBasePath leaves data/absolute URLs untouched", () => {
    expect(withBasePath("data:image/png;base64,xx")).toBe("data:image/png;base64,xx")
    expect(withBasePath("https://x.com/a.png")).toBe("https://x.com/a.png")
  })
  it("withBasePath prefixes root-relative paths", () => {
    process.env.NEXT_PUBLIC_BASE_PATH = "/conceal-website"
    expect(withBasePath("/brand/logo.svg")).toBe("/conceal-website/brand/logo.svg")
  })
})
```

- [ ] **Step 2: Run it — expect FAIL** (`npm test -- utils`) → "Cannot find module '@/lib/utils'".

- [ ] **Step 3: Implement `lib/utils.ts`**

```ts
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function withBasePath(path: string): string {
  if (!path.startsWith("/")) return path
  return `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}${path}`
}
```

- [ ] **Step 4: Run tests — expect PASS** (`npm test -- utils`).
- [ ] **Step 5: Build the app to confirm layout compiles** — `npm run build` → expect success.
- [ ] **Step 6: Commit** — `git add -A && git commit -q -m "feat: add cn + withBasePath utils (tested)"`

---

## Task 4: `lib/links.ts` — external URL registry

**Files:** Create `lib/links.ts`

- [ ] **Step 1: Render the live site nav/footer to collect exact URLs.** Run a Playwright scrape (from the wallet repo where Playwright is installed) of https://www.conceal.network and record every external href (wallet, explorer, bridge, marketplace, wiki, docs, github, medium, donate, community channels, paper wallet). Save the values.

- [ ] **Step 2: Write `lib/links.ts`** with the collected URLs as named constants. Example shape (fill with the real values from Step 1):

```ts
export const links = {
  webWallet: "https://wallet.conceal.network",
  paperWallet: "https://conceal.network/paperwallet",
  explorer: "https://explorer.conceal.network",
  bridge: "https://bridge.conceal.network",
  marketplace: "https://conceal.network/marketplace",
  wiki: "https://conceal.network/wiki/doku.php?id=start",
  docs: "https://github.com/ConcealNetwork/conceal-core/wiki",
  github: "https://github.com/ConcealNetwork",
  medium: "https://concealnetwork.medium.com/",
  // community channels (discord/telegram/twitter/etc.) — fill from scrape
} as const
```

- [ ] **Step 3: Commit** — `git commit -am "feat: central external link registry"`

---

## Task 5: `lib/earn.ts` — Conceal-Earn compound interest — TDD

**Files:** Create `lib/earn.ts`, `tests/earn.test.ts`

- [ ] **Step 1: Confirm the real model.** From conceal.network (Earn / the home calculator) record the actual term→APR tiers and compounding rule. Encode them as `EARN_TIERS`. (If the live model is simple interest over a fixed term, implement that instead — match the site.)

- [ ] **Step 2: Write the failing test** (`tests/earn.test.ts`) — adjust expected numbers to the confirmed model:

```ts
import { describe, expect, it } from "vitest"
import { projectEarnings, EARN_TIERS } from "@/lib/earn"

describe("earn", () => {
  it("exposes term tiers", () => {
    expect(EARN_TIERS.length).toBeGreaterThan(0)
    expect(EARN_TIERS[0]).toHaveProperty("months")
    expect(EARN_TIERS[0]).toHaveProperty("apr")
  })
  it("computes interest for a principal over a term", () => {
    // simple-interest example: 1000 CCX at 6% APR for 12 months => 60 interest
    const r = projectEarnings({ principal: 1000, months: 12, apr: 0.06 })
    expect(r.interest).toBeCloseTo(60, 2)
    expect(r.total).toBeCloseTo(1060, 2)
  })
  it("returns zero interest for zero principal", () => {
    expect(projectEarnings({ principal: 0, months: 12, apr: 0.06 }).interest).toBe(0)
  })
})
```

- [ ] **Step 3: Run — expect FAIL** (`npm test -- earn`).

- [ ] **Step 4: Implement `lib/earn.ts`** (shown for simple-interest; swap to the confirmed model if different):

```ts
export type EarnTier = { months: number; apr: number }

export const EARN_TIERS: EarnTier[] = [
  { months: 1, apr: 0.03 },
  { months: 3, apr: 0.045 },
  { months: 6, apr: 0.05 },
  { months: 12, apr: 0.06 },
]

export function projectEarnings({ principal, months, apr }: { principal: number; months: number; apr: number }) {
  const safePrincipal = Math.max(0, principal)
  const interest = safePrincipal * apr * (months / 12)
  return { interest, total: safePrincipal + interest }
}
```

- [ ] **Step 5: Run — expect PASS** (`npm test -- earn`).
- [ ] **Step 6: Commit** — `git commit -am "feat: Conceal-Earn interest model (tested)"`

---

## Task 6: `lib/snapshot.ts` — static market + mining data

**Files:** Create `lib/snapshot.ts`

- [ ] **Step 1: Capture snapshot values** from the live site (current CCX price, 24h change, supply; mining pools list with name/hashrate/miners/fee). Record them.

- [ ] **Step 2: Write `lib/snapshot.ts`** with typed data, clearly marked as a snapshot.

```ts
// SNAPSHOT DATA — captured 2026-05-29. Replaced by live APIs in Phase 4.
export type Market = { priceUsd: number; change24hPct: number; circulatingSupplyCcx: number }
export type MiningPool = { name: string; url: string; hashrate: string; miners: number; fee: string }

export const market: Market = { priceUsd: 0.045, change24hPct: 2.34, circulatingSupplyCcx: 6_456_200 }

export const miningPools: MiningPool[] = [
  // fill from Step 1 (real pool names + urls)
]
```

- [ ] **Step 3: Commit** — `git commit -am "feat: snapshot market + mining data (Phase 4 will go live)"`

---

## Task 7: UI primitives — Button + Card (glass)

**Files:** Create `components/ui/button-variants.ts`, `components/ui/button.tsx`, `components/ui/card.tsx`

- [ ] **Step 1: Copy the wallet's primitives** and keep them as-is (they already use the Aurora tokens / glass).

```bash
W=/Users/travis/Projects/conceal-next-wallet
cp "$W"/components/ui/button.tsx "$W"/components/ui/button-variants.ts "$W"/components/ui/card.tsx components/ui/
```

- [ ] **Step 2: Confirm `Card` uses `bg-card/70 backdrop-blur-xl`** (the glass look) — it does in the wallet. No change.
- [ ] **Step 3: Build** — `npm run build` → success.
- [ ] **Step 4: Commit** — `git commit -am "feat: port glass Button + Card primitives"`

---

## Task 8: Brand assets

**Files:** add to `public/brand/`, `app/icon.svg`, `app/favicon.ico`

- [ ] **Step 1: Fetch the official logo set** into `public/brand/`:

```bash
cd ~/Projects/conceal-website
for f in logo.svg; do curl -sS -A "Mozilla/5.0" -L "https://www.conceal.network/images/branding/$f" -o "public/brand/conceal-logo.svg"; done
curl -sS -A "Mozilla/5.0" -L "https://www.conceal.network/images/branding/community-256x256.png" -o public/brand/community.png
```

- [ ] **Step 2: Reuse the wallet's coin + marks** and favicon:

```bash
W=/Users/travis/Projects/conceal-next-wallet
cp "$W"/public/brand/conceal-coin.png "$W"/public/brand/conceal-mark.svg "$W"/public/brand/conceal-mark-orange.svg public/brand/
cp "$W"/app/icon.svg "$W"/app/favicon.ico app/
```

- [ ] **Step 3: (Optional) generate accents via codex** only if a section needs one. Skip unless required.
- [ ] **Step 4: Commit** — `git commit -am "chore: add official logo + reused brand assets"`

---

## Task 9: Coin backdrop

**Files:** Create `components/brand/conceal-backdrop.tsx`

- [ ] **Step 1: Port the wallet's backdrop** (fixed coin + aura, `withBasePath` on the coin url).

```bash
cp /Users/travis/Projects/conceal-next-wallet/components/landing/conceal-backdrop.tsx components/brand/conceal-backdrop.tsx
```

Confirm it imports `withBasePath` from `@/lib/utils` and references `/brand/conceal-coin.png`.

- [ ] **Step 2: Build** → success. **Commit** — `git commit -am "feat: coin backdrop"`

---

## Task 10: Nav

**Files:** Create `components/layout/nav.tsx`

- [ ] **Step 1: Build the nav** — `<img>` official mark via `withBasePath` + "Conceal" wordmark; section anchor links (`#about`, `#earn`, `#messaging`, `#mining`, `#partners`); right side: a couple of external tool links from `lib/links` + an "Open Web Wallet" primary `Button` (asChild `<a href={links.webWallet}>`). Aurora styling (warm, sticky, subtle border). Mobile: collapse links into a simple menu (can reuse a minimal disclosure; no Radix dependency needed — a details/summary or useState toggle).
- [ ] **Step 2: Build** → success. Screenshot later in Task 19.
- [ ] **Step 3: Commit** — `git commit -am "feat: site nav"`

---

## Task 11: Footer

**Files:** Create `components/layout/footer.tsx`

- [ ] **Step 1: Build the footer** — three link groups (General / Tools / Community) from `lib/links`, copyright, the official mark. Faithful to the live footer's groupings.
- [ ] **Step 2: Commit** — `git commit -am "feat: site footer"`

---

## Tasks 12–18: Home section components

For EACH section below: **(a)** render the corresponding part of https://www.conceal.network to copy the real headings/body/links; **(b)** build the component under `components/home/<name>.tsx` using the glass `Card`, Aurora tokens, Geist, and `lib/links`; **(c)** `npm run build` → success; **(d)** `git commit -am "feat: <section> section"`. Keep each file focused (<300 lines). Use honest placeholders (labelled grey blocks) for any missing imagery rather than hand-drawn SVG.

- [ ] **Task 12 — `hero.tsx`** (`#top`): "Privacy." statement headline + subcopy from the live hero; primary CTA Open Web Wallet, secondary "Get CCX" (anchor to `#getting-ccx`). Sits above the coin backdrop.
- [ ] **Task 13 — `about.tsx`** (`#about`): the "We are about" intro paragraph(s).
- [ ] **Task 14 — `feature-trio.tsx`**: three glass cards — Conceal-Earn (banking), Encrypted Messages, Untraceable transactions — copy + icons (lucide).
- [ ] **Task 15 — `earn-calculator.tsx`** (`#earn`): **interactive** ("use client"). Inputs: principal (number) + term (select from `EARN_TIERS`). Live-computes via `projectEarnings`; shows interest + total in mono, an APR badge, and a progress-style bar. No API.
- [ ] **Task 16 — `wallets.tsx`**: four cards — Conceal-Desktop, Conceal-Core (CLI), Web & Paper, Conceal-Mobile — each with the real link from `lib/links`/live site.
- [ ] **Task 17 — `getting-ccx.tsx`** (`#getting-ccx`): CCX + wCCX (Polygon / BSC / Ethereum) with the real external buy links; quick-start steps.
- [ ] **Task 18 — `mining.tsx` (`#mining`) + `markets.tsx` + `partners.tsx` (`#partners`)**: mining tiers (1/2/3) + pools table from `miningPools`; market snapshot card from `market`; partners logo strip (real logos fetched into `public/brand/partners/`). Snapshot sections include a small "indicative" note.

---

## Task 19: Compose the home page

**Files:** Create `app/page.tsx`

- [ ] **Step 1: Compose** — render `<ConcealBackdrop/>`, `<Nav/>`, then the sections in order (Hero, About, FeatureTrio, EarnCalculator, Wallets, GettingCcx, Mining, Markets, Partners), then `<Footer/>`, inside a `relative z-10` container matching the wallet landing's frame.
- [ ] **Step 2: Build with base path** — `PAGES_BASE_PATH=/conceal-website npm run build` → success (26-route-style export; here just `/`).
- [ ] **Step 3: Screenshot** — run a Playwright full-page screenshot of `http://localhost:3000` (via `npm run dev`) and review each section visually; iterate styling to match the Aurora look (Junior-Designer loop: show, adjust).
- [ ] **Step 4: Commit** — `git commit -am "feat: compose home page"`

---

## Task 20: Deploy workflow + final verification

**Files:** Create `.github/workflows/deploy.yml`

- [ ] **Step 1: Copy the wallet's Pages workflow** verbatim.

```bash
cp /Users/travis/Projects/conceal-next-wallet/.github/workflows/deploy.yml .github/workflows/deploy.yml
```

- [ ] **Step 2: Full verification gate** — run and confirm all green:

```bash
npm run lint && npm test && PAGES_BASE_PATH=/conceal-website npm run build
```

Expected: lint clean, tests pass, build exports `out/`.

- [ ] **Step 3: Live-path asset check** — grep `out/index.html` for `url('/conceal-website/brand/conceal-coin.png')` and confirm no unprefixed `/brand/` leaks.
- [ ] **Step 4: Commit** — `git commit -am "ci: GitHub Pages deploy workflow"`
- [ ] **Step 5: STOP — confirm with the user before creating `ConcealNetwork/conceal-website` or pushing.** (Repo creation + push + public deploy are gated.)

---

## Self-Review

- **Spec coverage:** project structure (T1–2), design system port (T2,7,9), withBasePath (T3), links (T4), calculator math (T5), snapshot data (T6), all 11 home sections (Nav T10, Footer T11, Hero/About/Features/Calculator/Wallets/GettingCCX/Mining/Markets/Partners T12–18), home composition (T19), verification + deploy gate (T20). External links kept (T4). Assets incl. official logo (T8). i18n explicitly out of scope (spec §11) — no task, correct.
- **Placeholders:** snapshot/earn/link tasks require capturing real values from the live site in their first step before coding — flagged, not left vague. Visual sections specify content source + components + acceptance + verify/commit.
- **Type consistency:** `projectEarnings({principal,months,apr})`/`EARN_TIERS`/`EarnTier` consistent across T5 + T15; `market`/`miningPools`/`MiningPool` consistent across T6 + T18; `withBasePath`/`cn` consistent across T3 and consumers.
