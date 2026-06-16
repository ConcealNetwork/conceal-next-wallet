# Design brief — View-only mode UI treatment

> You are a product designer contributing **3 hi-fi variants** for one wallet
> feature. Design from the **existing** system below — do not invent a new visual
> language. Variants should span by-the-book → novel.

## The product
Conceal Next Wallet — a dark, warm-grey crypto wallet (shadcn/ui, lucide icons).
When a wallet is imported **view-only** (no spend key), we must (a) badge that
state persistently, (b) show a per-page banner, and (c) disable the spend actions
(Send / Deposits create+withdraw / Messages send) so the user understands *why*
instead of hitting a cryptic failure. **It is an informational state, not an error.**

## Design system (use these EXACT values — they are the real tokens)
- **Background** `#212121` (lifted warm grey — **never pure black**). Cards `#262626`. Nested/inset `#2e2e2e`.
- **Border** `#404040` (card separation comes from the border, not dark fills).
- **Text** white `#ffffff`; secondary/muted `#a3a3a3`.
- **Primary / active / sync accent** orange `#FFA500` (solid pill = active nav; also the **sync** banner). **Do not reuse orange for view-only** — it must read as distinct from syncing.
- **Info / caution** amber `#f5a623` ← the natural tone for view-only (informational, not danger).
- **Danger** red `#ef4444` (delete / outgoing). **Do not** use for view-only — it isn't an error.
- **Radius** cards `rounded-xl`; badges are full pills.
- **Type**: system sans; data/amounts feel slightly mono. Keep it calm.

## The pattern to mirror (the existing sync banner)
```tsx
<div className="mb-4 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground" role="status">
  Syncing blockchain… block 12,345 / 67,890 (18%)
</div>
```
The view-only banner should feel like a **sibling** of this (same shape/placement)
but use the amber info tone, not orange — so a syncing view-only wallet shows two
visually distinct banners stacked.

## Badge pattern (existing)
Full pill, `text-xs font-semibold`, variants: default(orange), secondary(grey
`#2e2e2e`), destructive(red), outline. A "View-only" badge should sit in the page
header / wallet chrome.

## Deliver: 3 variants, each showing ALL THREE elements in context
Produce ONE self-contained HTML file. Dark bg `#212121`. Render a small mock
"Send" screen three times (V1/V2/V3), each containing: the page header with the
**View-only badge**, the **view-only banner**, and a **disabled "Review Send"
button** plus a disabled "Withdraw" row — showing how each variant signals *why*
it's disabled (tooltip text, lock affordance, helper line, etc.). Label each
variant with a one-line rationale.

Suggested span:
- **V1 — by the book**: amber sibling of the sync banner; secondary badge; native disabled button + `title` tooltip.
- **V2 — more guidance**: add a small lucide-style line icon (eye / eye-off) to badge + banner; inline helper text under the disabled button explaining the spend-key requirement.
- **V3 — novel**: a distinct lock/affordance on disabled controls (e.g. a subtle lock glyph + amber hairline), or a compact "view-only" chip on each blocked control — your most considered original take, still on-system.

## Hard rules (anti-slop + scope)
- Use ONLY the hex tokens above. **No purple gradients, no emoji icons, no
  pure-black backgrounds, no invented colors.**
- Line icons only (inline SVG in lucide style) or none — never emoji.
- Honest placeholders; don't fabricate balances beyond a plausible sample.
- Write ONLY your single assigned HTML file. Do NOT modify any other file. Do NOT
  run git/npm/build. Read DESIGN.md, components/wallet/syncing-banner.tsx,
  components/ui/badge.tsx, app/globals.css read-only for grounding.
