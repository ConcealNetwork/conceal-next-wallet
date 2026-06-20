# Design brief v2 — Conceal wallet avatar (open creative exploration)

> Round 1 came back too samey (everyone did a dark metal coin). **Round 2: you have
> full creative control.** Surprise us. Explore a visual language the other models
> wouldn't. The "coin" is no longer required — this is a *wallet avatar*, and the form
> is yours to invent.

## What it is
A small avatar that stands in for a wallet, carrying the wallet's **initial** (one
uppercase letter — `M`, `S`, `A`). Several wallets coexist, told apart by their letter.
It shows in the app header, a switcher dropdown, the sidebar footer, and a settings
list. Conceal is a privacy crypto wallet; brand accent is **warm orange `#FFA500`** /
`#f5a623`. The dark faceted login coin (`conceal-coin.png`) is *one* possible
inspiration — **feel free to ignore it entirely.**

## You have creative control
- Invent the **form**: monogram tile, enamel badge, gemstone, glass chip, gradient
  token, outline/ghost, embossed paper, holographic foil, brutalist mono, soft
  neumorphic, sigil, ticket, seal — anything. Not necessarily round, not necessarily a coin.
- Your **3 variants must be 3 different visual languages** — not three tweaks of one
  idea. Range from a safe/modern take to something genuinely novel.
- Pick directions the other models won't. Diversity across the set is the goal.
- Taste over gimmick: it should look like a real product shipped it, not a CSS demo.

## The only hard rules (functional, non-negotiable)
1. **Pure HTML + CSS, no images, no JS, no web fonts.** The initial is dynamic, so the
   avatar must be *drawn* (the letter drops into any design). System fonts only
   (`-apple-system`). A variant may use an inline SVG `<svg>` shape if it helps — but no
   external/network assets.
2. **Legible at 24px.** Real sizes are 24 / 28 / 32 / 36 px. The letter must stay clear
   and the design must not turn to mud at 24.
3. **Works in BOTH themes.** Show every variant on a dark `#1a1714` swatch AND a light
   `#f3efe9` swatch, side by side. It must look intentional on both — adapt per theme if
   your design needs it (you may use different treatments for dark vs light).
4. **Reads as Conceal.** Warm orange is the brand thread; how much/where is your call. No
   off-brand neon, no purple-SaaS-gradient, no emoji. (Multi-wallet distinction can come
   from the letter alone, or you may introduce a subtle per-wallet tint — your choice.)

## Tokens
- Brand orange `#FFA500` · amber `#f5a623`
- Dark theme surfaces: chrome `#1a1714`, card `#241f1c`, border `#39332d`, text `#fff`
- Light theme surfaces: chrome `#f3efe9`, card `#fff`, border `#e4ddd1`, text `#221d18`

## Deliverable (per agent)
ONE self-contained `.html` at `docs/design/wallet-coin-avatar/agents/<agent>.html`:
- **3 distinct variants** (3 different visual languages — make them really differ).
- Each shown at **24/28/32/36px** with initials **M, S, A**, on **both** a dark
  `#1a1714` and a light `#f3efe9` swatch.
- A name + a 1-line rationale (what the idea is, why it works at 24px / on light).
- Inline `<style>`, double-click-to-open, no network.

Anti-slop: no purple gradients, no emoji icons, no generic glassy-blue. Make three real,
differentiated choices. Show us something we wouldn't have asked for.
