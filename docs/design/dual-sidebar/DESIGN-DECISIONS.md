# #122 Dual-sidebar shell — design decisions

Hi-fi mockup for owner sign-off. Grounded in the existing Aurora palette + components/layout/.
No new visual language; matches the Unsloth Studio reference the owner shared (both sidebars).

## Files
- `review.html` — **canonical / recommended** (= agy's polish + Claude's right-rail panel-header refinement).
- `review-agy.html` — agy (Gemini 3.1 Pro) polish pass.
- `review-v1-claude.html` — Claude's first pass (kept for reference).

## Curated best-per-element
- **Left sidenav** (agy): active full-width **amber pill** + inline `＋` affordance; muted, letter-spaced
  section labels (Wallet / Banking / Recents); calm vertical rhythm; switcher header + footer (account + gear) + collapse.
- **Main** (agy): deconstructed cards, **segmented floating stat cards**, a **dismissible notif card**
  (Unsloth-style: info icon + primary/secondary actions + ×) — matches the shipped toast style (#120).
- **Right rail** (Claude, from the Unsloth Run-settings reference): a **panel header** with the
  contextual title (Account / Transaction) + a **collapse pin**; sectioned content (Market / Holdings /
  Quick actions ↔ Transaction detail / Filters) with right-aligned values, muted labels — Run-settings feel.
- **A11y** (agy): unified amber focus ring; keyboard-activatable nav + tx rows.

## Open decisions for the owner (sign-off)
1. Direction OK? grouping/labels/section membership?
2. Right rail on desktop: always-on (shown) vs collapsible-by-default?
3. More contextual right-rail routes to mock (Send fee-preview, Deposits APR calc)?

## Next (post-sign-off)
Implement against components/layout/ (sidebar.tsx, wallet-shell.tsx, wallet-switcher.tsx) +
a new right-rail slot per route. Responsive: right rail → drawer on mobile (already in the mockup).
