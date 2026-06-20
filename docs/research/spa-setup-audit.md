# SPA / Build Setup Audit — Conceal Next Wallet

**Date:** 2026-06-21
**Scope:** Static-export (`output: "export"`) Next.js 16 / React 19 SPA. Hard constraint: **no SSR, no Server Actions, no server runtime** — every recommendation below is checked for static-export compatibility.
**Method:** Research-first. Every finding cites the doc/source it was verified against (Next.js 16.2.9 docs, React 19 release notes, npm registry `latest` tags). Codebase facts read directly from the repo.

---

## Executive summary

The setup is **already current and well-built**. All four core tools are on the latest stable release, the static-export config is correct and intentional, and — contrary to the brief's suspicion — this **is** a genuine, installable PWA with an offline app-shell, a manifest with shortcuts + protocol handlers, an install-prompt hook, and notification handling. There are **no deprecated or outdated patterns** in the app/build layer (no `next/head`, `next/router`, `images.domains`, `middleware.ts`, AMP, or `next lint`).

The opportunities are incremental modernizations (React 19 ergonomics, Next 16 `typedRoutes` + `<Form>`) and a few PWA polish items (update-available prompt, `screenshots` for richer install UI). Nothing is broken; nothing is urgent.

### Version landscape (verified against npm registry `latest`, 2026-06-21)

| Dependency | Installed (package.json) | Latest stable | Status |
|---|---|---|---|
| `next` | `^16.2.9` | 16.2.9 | Current |
| `react` / `react-dom` | `^19.2.7` | 19.2.7 | Current |
| `typescript` | `^6` (resolves 6.0.3) | 6.0.3 | Current |
| `@biomejs/biome` | `^2.5.0` | 2.5.0 | Current |
| `tailwindcss` | `^4.3.1` | 4.x | Current (v4) |
| Node / npm engines | `>=24` / `>=11` | Next 16 needs Node ≥20.9 | Exceeds minimum |

Sources: `https://registry.npmjs.org/{next,react,typescript,@biomejs/biome}/latest`; Next 16 version requirements — `https://nextjs.org/blog/next-16` ("Node.js 20.9+, TypeScript 5.1+").

> Note: `.npmrc` `min-release-age=7` (supply-chain guard) means brand-new patch releases are intentionally held for 7 days before they can be installed. Being exactly on `latest` here is a sign the floors are well-maintained, not a lag risk.

---

## HIGH

### H1 — Add an "update available" prompt for the service worker
**What:** The SW calls `self.skipWaiting()` on install and the registration never listens for `updatefound` / a waiting worker. Navigations are network-first (good — a bad cache can't brick the live site), but a long-lived installed PWA session that never re-navigates can run stale precached chunks until the tab is closed and reopened.
**Why:** This is the single most common real-world PWA bug class — users "on the old version" with no way to refresh. With `skipWaiting()` + `clients.claim()` an updated SW can also swap chunks mid-session, risking a chunk-load error if the page then lazy-loads an old chunk name. A controlled "New version available — Reload" toast (you already ship Sonner) is the standard fix.
**Source:** Next.js PWA guide, "Offline Support" + service-worker lifecycle (`https://nextjs.org/docs/app/guides/progressive-web-apps`); the guide's reference SW does not blind-`skipWaiting`. MDN SW update lifecycle is the underlying spec.
**Recommendation:** In `wallet-service-worker.tsx`, after `register()`, listen for `registration.addEventListener("updatefound", …)` → when the new worker reaches `installed` and `navigator.serviceWorker.controller` exists, show a Sonner action toast that posts `SKIP_WAITING` to the worker and reloads on `controllerchange`. Move `skipWaiting()` in `service-worker.js` behind that `message` handler instead of running it unconditionally on install. **Effort: M (~half day).**

---

## MEDIUM

### M1 — Enable `typedRoutes` (statically-typed `<Link>`/router)
**What:** Not enabled in `next.config.mjs`. The app uses route groups and many `next/link` hrefs + relative manifest shortcut URLs.
**Why:** Compile-time checking of every internal href catches typo'd routes and broken links during refactors — valuable for a 26-page App Router app. **Verified static-export compatible:** `typedRoutes` is NOT in the static-export "Unsupported Features" list, and it is now stable (no longer `experimental`).
**Source:** `https://nextjs.org/docs/app/api-reference/config/next-config-js/typedRoutes` ("marked as stable, use `typedRoutes`"); static-export unsupported list — `https://nextjs.org/docs/app/guides/static-exports` (lists Rewrites/Redirects/Headers/ISR/Server Actions/Image Optimization-with-default-loader, etc. — typedRoutes absent).
**Recommendation:** Add `typedRoutes: true` to `next.config.mjs`, run `npm run types`, and fix any flagged hrefs. Note it only types `<Link>`/`useRouter` string literals, not the manifest's relative shortcut strings. **Effort: S–M (depends on how many hrefs need fixing).**

### M2 — Drop `forwardRef` in shadcn `components/ui/*` (ref-as-prop)
**What:** 12 UI primitives still use `React.forwardRef` (`alert-dialog, tabs, progress, sheet, tooltip, switch, dialog, separator, button, select, textarea, input`).
**Why:** In React 19 `ref` is an ordinary prop on function components; `forwardRef` is now legacy and slated for future deprecation. Removing it simplifies each component and aligns with the current shadcn generator output. This is the canonical React 19 migration and there's a codemod.
**Source:** React 19 release — "ref as a prop" / `forwardRef` will be deprecated in a future release (`https://react.dev/blog/2024/12/05/react-19`).
**Recommendation:** Either re-generate these primitives from the current shadcn registry (they already ship ref-as-prop) or run `npx types-react-codemod@latest react-19/* ./components/ui`. Purely mechanical, behavior-neutral. **Effort: S (~1–2h, mostly verification).**

### M3 — Add `screenshots` to the web manifest (richer install UI)
**What:** `app/manifest.ts` has `id`, `name`, `short_name`, `description`, `icons` (incl. maskable), `shortcuts`, `protocol_handlers`, `categories`, `display`, theme/background colors — strong. It's missing `screenshots`.
**Why:** Chromium's richer "app install" dialog (desktop + Android) shows screenshots when present (`form_factor: "wide"` and narrow), materially improving install conversion. Everything else for installability is already satisfied.
**Source:** `MetadataRoute.Manifest` supports `screenshots`; the manifest doc defers the full field list to the type / MDN (`https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest`, "refer to the `MetadataRoute.Manifest` type … or MDN").
**Recommendation:** Add 1 wide + 1 narrow screenshot PNG under `public/`, reference them with relative `src` (matching the existing relative-URL convention for base-path safety), and add them to the precache allowlist's `MANIFEST_IMAGES` set if you want them available offline. Generate the screenshots via the image-gen tooling. **Effort: S.**

### M4 — Adopt `useOptimistic` for message send + transaction send flows
**What:** `messages/page.tsx` and `send/page.tsx` track submit/pending purely with `useState`; the messages thread doesn't optimistically append the outgoing message.
**Why:** `useOptimistic` is a client-side React 19 hook (no server required) — it's fully compatible with static export. It gives instant "message appears / sending…" feedback that reconciles when the real mutation (via TanStack Query) settles, which is exactly the UX a chat/messages surface wants.
**Source:** React 19 release — `useOptimistic` (`https://react.dev/blog/2024/12/05/react-19`). It is a React (not React-DOM-server) hook → client-safe.
**Recommendation:** Wrap the messages list in `useOptimistic` keyed to the send mutation; on `mutate`, push the optimistic message; let the TanStack Query invalidation reconcile. Optional for `send` (a confirm dialog already gates it). **Effort: M.**

---

## LOW

### L1 — Use `<Context>` as provider instead of `<Context.Provider>`
**What:** 7 first-party providers render `<X.Provider value=…>` (`theme-provider`, `ticker-preference-provider`, `network-telemetry-provider`, `i18n-provider`, `wallet-session`, `sidebar-collapse`, `right-rail`, `unlock-wallet-provider`).
**Why:** React 19 lets you render `<Context value=…>` directly; `<Context.Provider>` will be deprecated in a future version. Minor readability/future-proofing win.
**Source:** React 19 release — "`<Context>` as a provider" (`https://react.dev/blog/2024/12/05/react-19`); a codemod is published.
**Recommendation:** Run the React 19 context codemod or hand-edit the 7 files. Behavior-neutral. **Effort: S.**

### L2 — Migrate URL-relevant `useState` to `<Form>` / `useSearchParams` where it aids shareability
**What:** Transactions page keeps `active` filter, `search`, `pageSize`, `currentPage` in `useState`; market keeps `activeRange`. These are ephemeral, not in the URL.
**Why:** Next 16's `next/form` (`<Form action="…">` with a string action) does GET-based, client-side-navigated, **prefetched** search-param updates with progressive enhancement — and it works in static export (string action = client nav, no Server Action). Putting filter/search/page in the URL makes transaction views bookmarkable/shareable and survives reload. This is a UX judgment call, not a correctness fix.
**Source:** `<Form>` component — string `action` ⇒ GET + client-side navigation + prefetch, no server needed (`https://nextjs.org/docs/app/api-reference/components/form`).
**Recommendation:** Only where shareable state is desirable (transactions filter/search is the best candidate). Don't force it on transient UI (compose drafts, dialogs). **Effort: M per page; do opportunistically.**

### L3 — `<title>` in a client component is already-correct React 19 metadata; consider standardizing
**What:** `network/page.tsx` renders a native `<title>{…}</title>` inside a client component — this is React 19's document-metadata hoisting, and it's a legitimate, working pattern.
**Why:** It's correct, but it's the *only* place using it; the rest rely on App Router `metadata`/`generateMetadata` exports (only 3 routes export metadata: deposits, transactions, market, + root layout). No action required — flagged so a future reviewer doesn't "fix" the `<title>` as a mistake. If you want per-page titles on the many client pages without server metadata, React 19 native `<title>` is the static-export-friendly way to do it.
**Source:** React 19 metadata hoisting (`https://react.dev/reference/react-dom/components/title`); React 19 release notes (document metadata support).
**Recommendation:** Leave as-is, or adopt native `<title>` consistently on client pages that lack a `metadata` export. **Effort: S if pursued.**

### L4 — `images.unoptimized: true` is correct; revisit only if you want optimized images
**What:** Set because `next/image`'s default loader needs a server.
**Why / Source:** Confirmed correct for static export — Image Optimization with the **default** loader is unsupported, but a **custom loader** (`loaderFile`) IS supported in `output: "export"` (`https://nextjs.org/docs/app/guides/static-exports`, "Image Optimization"). The Next 16 image-default changes (`qualities`, `minimumCacheTTL`, `dangerouslyAllowLocalIP`, `maximumRedirects` — `https://nextjs.org/blog/next-16`) **do not apply** while `unoptimized` is on.
**Recommendation:** No change needed. Only if you later want responsive optimized images (e.g. via Cloudinary/imgix) would you switch to `images: { loader: "custom", loaderFile: … }`. The wallet's imagery is small static PNGs/SVGs, so this is genuinely optional. **Effort: M if ever pursued.**

---

## Things that are already correct (no action)

- **`output: "export"` + `basePath`/`assetPrefix` + `trailingSlash` + `publicAssetPath` base-path prefixing** — textbook static-export-under-subpath setup; matches the docs' Configuration example. (`https://nextjs.org/docs/app/guides/static-exports`)
- **`turbopack: {}` + opt-in `--webpack` `asyncWebAssembly` hook** — the comments correctly capture Next 16's behavior: Turbopack is the default bundler and errors if a `webpack` config exists without a `turbopack` key; the empty object is the documented opt-in. WASM is handled natively by Turbopack. (`https://nextjs.org/blog/next-16`, "Default bundler … opt out with `--webpack`")
- **`allowedDevOrigins`** — correct, current dev-only config for the Playwright 127.0.0.1 origin.
- **PWA core** — manifest `dynamic = "force-static"` (required for export), relative `src`/`start_url`/`scope` for base-path safety, maskable icon, shortcuts, `web+conceal` protocol handler, install-prompt hook tied to `navigator.storage.persist()`, network-first navigation with offline-shell fallback, content-hashed shell cache with scoped pruning. This is above-average PWA engineering.
- **No deprecated/removed APIs** — grep confirms zero `next/head`, `next/router`, `getStaticProps/getServerSideProps`, `next/legacy`, `images.domains`, `middleware`. Next 16 removed AMP and `next lint` (the project already uses Biome directly). (`https://nextjs.org/blog/next-16` Removals/Deprecations tables)
- **`tsconfig.json`** — `moduleResolution: "bundler"`, `strict`, `isolatedModules`, the `next` TS plugin, `@/*` paths — all current App Router conventions. (One nit: `target: "ES2017"` is conservative given Next 16 requires Chrome/Safari 16.4+; bumping to ES2022 would shrink down-leveled output, but it's cosmetic.)

---

## Suggested sequencing

1. **H1** (update prompt) — real user-facing reliability win.
2. **M2 + L1** (React 19 codemods: ref-as-prop, `<Context>`) — bundle into one mechanical PR.
3. **M1** (`typedRoutes`) — turn on, fix fallout, keep as a guardrail.
4. **M3** (manifest screenshots) — quick install-UX polish.
5. **M4 / L2 / L3 / L4** — opportunistic, UX-driven, no urgency.
