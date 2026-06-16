# Review response — offline PWA app shell

Reviewers (CLAUDE.md CLIs, direct): **Antigravity / Gemini 3.1 Pro** (`agy`, 1 CRITICAL +
2 HIGH), **GLM-5.2** (`opencode`, 3 MEDIUM + 4 LOW), **CodeRabbit** (2 major + 1 minor; free
tier printed only the minor in full). **Codex** out of credits. The service worker ships to the
live wallet, so reviewers were pointed hard at production blast-radius.

## Addressed

- **`activate` deleted every non-KEEP cache on the origin** (Antigravity CRITICAL) — would wipe
  caches of *other* ConcealNetwork projects on the shared `*.github.io` domain. Now only deletes
  `conceal-wallet-`-prefixed caches. (GLM rated the migration "clean" and missed this — good
  cross-model coverage.)
- **Partial precache could activate a broken offline shell** (Antigravity HIGH) — switched from
  best-effort `allSettled` to atomic `cache.addAll`: if any shell asset fails, the install rejects
  and the previous SW stays active. The manifest fetch is still tolerant (missing → skip precache in dev).
- **SW never updated across deploys → stale offline shell + unbounded `SHELL_CACHE` growth**
  (GLM MEDIUM) — the build now stamps a content-hash version into the SW (`__SW_VERSION__`), so a
  content change changes the SW bytes → the browser reinstalls, re-precaches under a versioned
  `shell-<hash>` cache, and activate prunes the old one. `ASSET_CACHE` (immutable libs) stays stable.
- **Navigation fell back to cache only on a network throw, not a 5xx** (GLM MEDIUM) — a GitHub Pages
  5xx now also serves the cached shell.
- **Navigation match missed query params / non-canonical paths** (Antigravity HIGH, GLM LOW) —
  `ignoreSearch: true` plus trailing-slash normalization before the per-route `index.html` resolve.
- **`cache.put` unhandled rejection** (GLM LOW) — `.catch(() => {})`.
- **404 / `_not-found` precached but never served** (GLM LOW) — excluded from the precache list
  (served via the offline fallback). Manifest dropped 113 → 110 entries.
- **Manifest `version: Date.now()` non-reproducible** (GLM MEDIUM, Antigravity LOW) — content hash.
- **Test server path-containment prefix attack** (CodeRabbit minor) — `filePath === OUT ||
  startsWith(OUT + sep)`.
- **Fallback chain only tested at root** (GLM LOW) — added a deep-route (`/wallet/receive/`)
  offline case to the e2e.

## Deferred (with reason)

- **Cache-first for `.html` so client-side HTML fetches work offline** (Antigravity MEDIUM) — kept
  HTML strictly network-first to avoid serving stale pages online; offline prefetch-miss is harmless
  and the app does no client-side raw-HTML fetches.
- **Network-fetch timeout for flaky (not-fully-offline) connections** (GLM LOW, optional) — adds
  complexity; `navigator.onLine`/throw already covers the common offline case. Revisit if real users
  report hung navigations on lie-fi.

## Verification note

The SW registers in real mode only, and the offline shell needs the static export — so the mock
`next dev` e2e harness can't exercise it. The `offline-pwa.spec.ts` test serves the real built `out/`
and cuts the network (passes locally); it **skips in CI** (no `out/`). CI's separate Build job
verifies the manifest + SW stamp generate without error.
