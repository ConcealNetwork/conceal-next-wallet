# Review response — panic wipe

Reviewers (CLAUDE.md workflow, CLIs called directly): **CodeRabbit** (clean),
**GLM-5.2** (`opencode`, 8 findings), **Antigravity / Gemini 3.1 Pro** (`agy`, 2 findings).
**Codex** (`codex exec`) unavailable — workspace out of credits.

## Addressed

- **Abort-on-throw left data behind / left the user authenticated** (GLM CRITICAL #1, HIGH #4;
  Gemini CRITICAL + HIGH) — both layers are now best-effort. `panicWipeOperation` runs each
  clear step in its own try/catch and throws only at the end; `usePanicWipe` runs each step
  independently and **always** clears the React Query cache + drops the session, surfacing a
  partial-failure toast. A panic wipe can no longer be aborted mid-way or leave you logged in.
- **Re-persist race / wrong order** (GLM HIGH #2 + #3) — the delete path flushed (re-wrote) the
  wallet before deleting, and a watchdog debounced save could re-persist *after* `Storage.clear()`.
  Fixed: `disconnectWalletRuntime` takes `{ flush }` (default unchanged); the panic path calls it
  with `flush:false`, which **stops the watchdog + worker first** (no re-write) before any storage
  is cleared.
- **Mock left localStorage behind; dialog copy lied** (GLM MEDIUM #5) — `usePanicWipe` now clears
  `localStorage` (mode-agnostic), so the mock wipe is as complete as the copy claims.
- **No typed confirmation on an irreversible wipe next to Delete** (GLM MEDIUM #6) — the new
  `PanicWipeDialog` requires typing **ERASE** before the destructive button enables, so a
  misdirected click on the adjacent red control can't trigger an all-data wipe.
- **e2e only asserted navigation** (GLM LOW #7) — the e2e now seeds a probe key, confirms the
  typed-confirm gating (button disabled → enabled), and asserts `localStorage` was actually cleared.

## Deferred (with reason)

- **Service-worker registration + shell cache survive** (GLM LOW #8) — the SW cache holds the
  vendored crypto libs and app shell, **no user data**. Unregistering it on wipe would needlessly
  break the offline shell for the next user of the browser. Out of scope for a data-erasure
  feature; revisit only if "erase every trace incl. cached assets" is an explicit requirement.
