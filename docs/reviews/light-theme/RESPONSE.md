# Review response — light theme

Reviewers (CLAUDE.md CLIs, direct): **Antigravity / Gemini 3.1 Pro** (`agy`, 3 HIGH),
**CodeRabbit** (1 minor). **GLM-5.2** (`opencode`) hung (~66 min, zero output) and was
killed — not a usable review this pass. **Codex** (`codex exec`) out of credits. Plus a
live `claude-in-chrome` visual pass (user-approved).

## Addressed

- **No-FOUC script aborted entirely if `localStorage` threw** (Antigravity HIGH) — e.g. strict
  privacy settings. Scoped the try/catch to just the storage read so the `matchMedia` system
  fallback + DOM mutation still run.
- **`<html>` could revert to a hardcoded theme class** (Antigravity HIGH) — removed the hardcoded
  `dark` class from JSX entirely; the palette is driven by the `data-theme` attribute (set by the
  no-FOUC script + ThemeProvider), with `:root` (no attribute) as the dark default. Nothing to revert.
- **Orange accent contrast on light** (Antigravity HIGH) — `#FFA500` as *text/icons* on the
  near-white field is ~1.5:1. Kept the bright orange for `bg-primary` **fills** (buttons, active nav)
  and added a light-mode override so the `text-primary` **foreground** uses a deeper amber
  (`hsl(33 96% 38%)`) that meets contrast. Buttons stay vivid; orange text/links become readable.
- **Paint flash for non-dark users** (CodeRabbit minor) — the apply effect ran after paint with the
  initial `dark` state. Switched both theme effects to `useLayoutEffect` (isomorphic, so no SSR
  warning) so the resolved theme settles before paint.
- **Hydration mismatch** (caught live in the browser console) — the pre-paint script mutates
  `<html>`, so SSR vs client attributes differ; added `suppressHydrationWarning` to `<html>`
  (the standard next-themes pattern). Verified clean on a fresh tab.

Clean per the reviewers: resolve/normalize logic, system-change listener cleanup, no residual
hardcoded `bg-white`/`text-black` that should adapt.

## Deferred (with reason)

- **Sonner toasts + the Settings Switch thumb stay dark-styled** — both are functional and readable
  on light (dark toasts on light is a common pattern; the switch knob is a deliberate iOS-style
  control). Theming them is cosmetic polish, tracked as a follow-up.
- **Normal-size orange links at exactly 4.5:1** — the deeper amber lands ~4.5:1; bold/large accent
  text and UI icons (the bulk of `text-primary` use) clear 3:1 comfortably.
