# Conceal Next Wallet — Design System

The source of truth for theme + UI polish. Values are **ground-truth, sampled from the live
Conceal wallet** (`conceal-next-wallet.vercel.app`), not invented. All surfaces must use the
shadcn theme tokens below — **never ad-hoc hex** for foundational surfaces.

## Color tokens (defined in `app/globals.css`, HSL)

| Token | HSL | Hex | Use |
|---|---|---|---|
| `--background` | `0 0% 13%` | `#212121` | App background — a **lifted neutral grey**, NOT black. |
| `--card` | `0 0% 15%` | `#262626` | Cards — marginally lifted from bg for depth. |
| `--border` / `--input` | `0 0% 25%` | `#404040` | neutral-700 outlines. Card separation comes from the border, not heavy fills. |
| `--secondary` / `--muted` | `0 0% 18%` | `#2e2e2e` | Insets, nested boxes, subtle fills. |
| `--muted-foreground` | `0 0% 64%` | `#a3a3a3` | Secondary text. |
| `--primary` / `--accent` / `--ring` | `39 100% 50%` | `#FFA500` | **Pure orange** accent — active nav (solid pill, black text), primary buttons, links, focus ring. |
| `--chrome` | `0 0% 11%` | ~`#1c1c1c` | Shared dark chrome surface — sidebar + footer. Neutral, subtly darker than the body. |
| `--destructive` | `0 84% 60%` | `#ef4444` | Outgoing amounts, delete actions. |

### Critical rules learned
- **Hue is neutral (0), not cool blue (240).** The original is pure grey; a blue tint reads wrong.
- **Background is `13%` lightness (#212121), never `4%`/black.** Pure black was the #1 fidelity miss.
- **Cards are defined by their `#404040` border + a subtle lift**, not by a much-darker fill.
- Avoid near-black nested boxes — nested/inset panels use `--secondary`/`--muted` (`#2e2e2e`), not `#0a0a0a`.

### Semantic amount colors
- Incoming / positive: emerald `#10b981`
- Outgoing / negative: red `#ef4444`
- Deposits: blue `#60a5fa`

## Typography
- Geist Sans for UI, Geist Mono for addresses / amounts / IDs / heights.
- Page title ~30px bold; section title ~18–20px; body `text-sm`; line-height 1.5.

## Spacing, radius, density
- `--radius: 0.75rem` (rounded-xl cards). Keep radius consistent everywhere.
- One density per surface: comfortable (`gap-6` / `p-6`). Sidebar ~260px fixed.
- Content max-width ~1200px.

## Interaction standards (from ui-ux-pro-max)
- `cursor-pointer` on every clickable element (cards, rows, nav).
- Hover feedback via color/opacity/border — `transition-colors duration-200`. Never scale-shift layout.
- Visible focus rings (`ring-ring`) for keyboard nav on all interactive elements.
- Buttons disable + show progress during async (mock) actions.
- Lucide icons at `h-4 w-4` (inline) / `h-5 w-5` (standalone). No emoji icons.

## Accessibility & responsive
- Text contrast ≥ 4.5:1 (white/`#a3a3a3` on `#212121` passes).
- Respect `prefers-reduced-motion`.
- Verify at 375 / 768 / 1024 / 1440px. Sidebar collapses to a Sheet drawer on mobile.
- Color is never the only signal (pair amount color with +/− and an icon).

## Component conventions
- Build from shadcn primitives (Card, Button, Tabs, Dialog, AlertDialog, Sheet, Badge, etc.).
  Use `AlertDialog` for destructive confirms (Delete wallet, Disconnect).
- Use theme tokens (`bg-card`, `text-muted-foreground`, `border-border`) — no raw palette hex.
- One accent only (orange). No competing accent colors, no glassmorphism on every surface.

### Legal / auxiliary pages (Terms, Privacy, Support)
- Shared layout: sticky footer at viewport bottom (`flex min-h-screen flex-col` + `flex-1` content).
- Content column `max-w-3xl`; long-form pages use `prose prose-invert`, short pages use `PageHeader` + `SectionCard`.
- **Sticky back nav** (`LegalBackNav`): stays visible while scrolling (`sticky top-4 z-30`), **right-aligned** (`ml-auto`).
  - Icon: Lucide `Undo2` (counter-clockwise return arrow) in a circular bubble — not chevrons.
  - Bubble: `size-9`, `rounded-full`, `border-border`, `bg-secondary/95`, orange tint on hover.
  - Wrapper: light `bg-background/80 backdrop-blur-sm` so the control stays legible over scrolled content.
  - Label (sm+): contextual — “Back” when history exists, else “Back to wallet” / “Back to home”.
  - Mobile: icon-only bubble; label hidden but present in `aria-label`.

## Known polish backlog (bottom-up pass)
- [ ] Transaction Summary nested "Recent Transactions / Last Activity" boxes are too dark → use `--secondary`.
- [x] Sidebar + footer share the neutral `--chrome` surface.
- [ ] Hover/focus states + `cursor-pointer` audit across cards, rows, nav, tabs.
- [ ] Empty/loading/error states get designed treatment (skeletons, not bare text).
- [ ] Responsive sweep + sidebar mobile drawer.
