# Settings redesign — decisions (curated)

User pick (2026-06-22): **Gemini's body styling + Opus's right-rail content.**

## Body (from Gemini)
- Grouped, visually-distinct **cards** (not the old flat `Section`/`Row` list). Groups:
  1. **Appearance & language** — Theme, Language.
  2. **Security & unlock** — Passkey unlock, Auto-lock, Change password.
  3. **Network & node** — Use custom node toggle, Node URL, Available nodes (Use / Use fastest).
  4. **Sync & performance** — **Sync speed** (DOOM segmented pills) with an explanatory box (cores / batch / nodes per level), Read miner transactions, Block heights, Maintenance (Update / Reset & rescan).
  5. **Wallets** — switcher (Active badge, Rename, Delete, + Add wallet).
  6. **Backup & data** — Device data backup (Export / Restore), Notifications + Watch-other-wallets toggles can live here or in Security/Appearance.
  7. **Danger zone** — red-accented, isolated: Delete wallet, Panic wipe.
- Gemini's segmented sync-speed pills + the per-level explainer box.

## Right rail (from Opus / Claude) — `usePageRightRail`
- **Wallet status** — live sync % ring, connected node + latency, active DOOM sync-speed level, active wallet.
- **Security posture** — checklist: Passkey unlock (on/off), Auto-lock (interval), Recovery phrase (verify backup), Watch other wallets (on/off), Notifications (allowed/blocked). Green check / amber warn per item.
- **Jump to** — scrollspy nav to each body card.
- Rail summarizes STATE; body holds CONTROLS (no duplication). `embedded` prop for the <1200px body fallback.

## Build notes
- Reuse shadcn `Card`/`Switch`/`Button` + `rail-parts` (`RailSectionHeading`); match base-nova tokens (already the app's).
- Keep existing data hooks (`useWalletSettings`, `useWalletInfo`, `useWalletSyncStatus`, passkey/auto-lock/notification/watch state). No service-layer change.
- New i18n keys (card group titles, rail section labels, security-posture items) → all 10 locales (Opus subagent for translations).
- Security/consequence copy stays English (panic-wipe/delete confirmations).
