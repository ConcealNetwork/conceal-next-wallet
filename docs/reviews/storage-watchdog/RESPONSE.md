# Review response — IndexedDB persistence + quota watchdog

Reviewers (CLAUDE.md CLIs, direct): **GLM-5.2** (`opencode`, 7 findings),
**Antigravity / Gemini 3.1 Pro** (`agy`, 4 findings), **CodeRabbit** (1 finding).
**Codex** (`codex exec`) unavailable — out of credits. Strong cross-model agreement on
the two HIGHs below.

## Addressed

- **`persist()` ran inside the React Query `queryFn`** (GLM HIGH, Antigravity HIGH) —
  `persist()` is a permission request; off a user gesture it prompts (Firefox) or
  auto-denies, producing a permanent false `not-persisted`. **Fix:** the probe now reads
  the *read-only* `persisted()`; `persist()` is requested once from `openSession` (the
  unlock/create/import gesture path) via `requestPersistentStorage()`.
- **Banner was un-dismissible** (GLM HIGH, Antigravity HIGH) — Incognito/WebView permanently
  deny durable storage, so the banner would never clear and train users to ignore it. Added a
  dismiss "X" persisted in `sessionStorage` (re-warns next session — a seed-loss risk shouldn't
  be silenced forever, but shouldn't nag every navigation).
- **Ratio-only low-space false-positives on large disks** (GLM MEDIUM, Antigravity MEDIUM) —
  85% of a 100 GB disk is fine, and `estimate().usage` is per-origin (Cache API, SW, all IDB).
  Added an absolute free-space floor (`< 50 MB`) AND the ratio. Unit-tested with a 100 GB disk.
- **No re-probe during a long session** (GLM MEDIUM) — now the probe is a cheap read,
  re-enabled `refetchOnWindowFocus` so a filling quota is caught mid-session.
- **Redundant on the export page** (Antigravity LOW) — hidden when `pathname === "/wallet/export"`.
- **No low-space e2e** (CodeRabbit MAJOR) — added (plus a dismiss-persists-across-nav case),
  using a stubbed `navigator.storage` with free space below the floor.

## Deferred (with reason)

- **Tri-state `unknown` for probe exceptions** (GLM HIGH) — behaviorally already correct: an
  exception leaves `persisted = true` → verdict `none` (no warning). This is the intended
  "don't nag on incomplete information", and it also avoids the private-mode false-positives
  both reviewers flagged. Kept the simpler boolean.
- **Warn only when both `persist()` and `persisted()` are false** (GLM/Antigravity MEDIUM,
  private/headless false-positives) — the per-session dismiss already bounds the nuisance to
  once-per-session-plus-dismiss; gating on a second probe adds complexity for marginal gain.
- **dev-log on probe error** (GLM LOW) — `probeStorageHealth` swallows all errors internally and
  always resolves, so the query error path is unreachable; nothing to log.
