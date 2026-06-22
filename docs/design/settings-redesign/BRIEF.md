# Settings page redesign — design brief

Redesign the Conceal Next Wallet **Settings** page. Produce ONE self-contained hi-fi HTML mockup.

## Current state (what exists)
A single long scrolling column of flat sections (label + control rows), no contextual rail:
- **General** — Theme (System/Light/Dark), Language (select), Passkey unlock (add/list), Enable notifications (toggle), Watch other wallets (toggle).
- **Wallets** — wallet switcher: each wallet row (address, Active badge, Rename, Delete).
- **Node** — "Use custom node" toggle + "Node URL" field; "Available nodes" list (latency + uptime per node) with **Use** / **Use fastest**.
- **Wallet** — **Sync speed** (5 DOOM levels: *I'm too young to die · Hey, not too rough · Hurt me plenty · Ultra-Violence · Nightmare!*), Read miner transactions (toggle), Block heights (creation/synced), Maintenance (Update / Reset & rescan), Device data backup (Export / Restore), **Delete wallet**, **Panic wipe** (erase everything).
- **Security** — Auto-lock (select), Change password.

A syncing banner appears at the top during catch-up.

## Goals
1. **Group into logical, visually-separated CARDS** — not one flat list. Sensible groupings (e.g. Appearance & language, Security & unlock, Network/Node, Sync & performance, Wallets, Backup & data, Danger zone).
2. **Add a contextual RIGHT RAIL** — the shell renders a ~380px rail at ≥1200px (`usePageRightRail`). Propose what Settings shows there: e.g. a live status summary (sync %, connected node + latency, current sync-speed level, security posture: passkey on?/auto-lock), and/or jump-to-section nav. It should COMPLEMENT, not duplicate, the body.
3. **Separate DESTRUCTIVE actions** (Delete wallet, Panic wipe) into a clearly-marked **Danger Zone** card (red accents, set apart).
4. Surface the **Sync speed** control as a first-class, fun element (it's DOOM-themed) — consider showing what each level does (cores/batch/nodes).

## Visual language (match the app — do NOT invent new)
shadcn/ui **base-nova**, dark theme, lucide icons, rounded cards. Tokens:
- bg `#0e0e10`, card `#17171a`, border `#26262b`, primary orange `#e8a33d`, text `#ededed`, muted `#9a9a9f`.
- font: system-ui. Rounded-xl cards, subtle borders, generous spacing. Toggles = pill switches. Selectors = segmented pill buttons (the Sync-speed levels are segmented pills).

## Deliverable
A single self-contained **`<AGENT>.html`** (inline `<style>`, no external deps) showing the redesigned Settings at desktop width (~1280px) WITH the right rail column visible. Realistic content. A short `<!-- rationale -->` comment at top explaining the grouping + rail choices. Write it to `docs/design/settings-redesign/<AGENT>.html`. Do NOT modify app source.
