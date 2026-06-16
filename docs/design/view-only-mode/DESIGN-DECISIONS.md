# Design decisions — View-only mode

> Curated from 9 variants (Codex / Gemini / GLM, 3 each). Screenshots in
> `shots/`. Best-per-element synthesis below is the build target.

## Tone
View-only is **informational, not an error**. Use the amber token
`--color-wallet-amber` (`#f5a623`) — Tailwind `text-wallet-amber`,
`border-wallet-amber/30`, `bg-wallet-amber/10`. Orange (`primary`) stays reserved
for the **sync** banner / active nav; red (`destructive`) stays for danger. A
syncing view-only wallet must show two visually distinct banners (orange sync +
amber view-only) — validated in GLM's stacked mock.

## Badge _(Codex V2/Gemini V2)_
Amber-outline pill in the `PageHeader`: lucide `EyeOff` (16px) + "View-only",
`text-xs font-semibold`, `border-wallet-amber/40 text-wallet-amber`. Not the solid
secondary grey (too quiet) and not solid orange (collides with active-nav pill).

## Banner — `<ViewOnlyBanner>` _(Codex V2 body, amber)_
Amber sibling of `WalletSyncingBanner`:
```
mb-4 rounded-xl border border-wallet-amber/30 bg-wallet-amber/10 px-4 py-3 text-sm
```
`role="status"`, `data-testid="view-only-banner"`, leading `EyeOff` icon, then:
- **Title (bold):** "View-only wallet"
- **Body (muted):** "It can watch balances and receive, but can't send, deposit, or message — these need the private spend key. Import the full wallet to unlock them."

Reject "Wallet is locked" (Gemini V3) — a view-only wallet isn't locked; it's
watch-only. "Locked" implies a password prompt.

## Disabled affordance _(Codex V1+V2 buttons, Codex V3 chip)_
- **Primary action** (Review Send / Create Deposit / New Message / compose Send):
  **native muted `disabled`** button (the default disabled grey) + a single inline
  amber helper line beneath, e.g. "Import the spend key to send CCX." + `title`
  tooltip with the same text.
- **Reject** the amber-*filled* "Review Send (View-only)" treatment (Gemini V3,
  GLM) — a filled amber button reads as an enabled CTA and invites clicks.
- **Per-row / secondary actions** (deposit Withdraw, message Reply): keep the
  control `disabled` and add a small amber-outline **"View-only" chip** next to it
  (Codex V3) so the reason is local without a layout shift.
- **Inputs stay editable** (address/amount) — only the signing step is blocked;
  this keeps the page feeling alive and lets a payment-link prefill survive.

## Copy → `lib/ui/wallet-copy.ts`
`viewOnlyBadge: "View-only"`, plus the banner title/body and the three
per-surface helper strings already enumerated in `spec-merged.md §3.5`. Reuse the
same strings in the service-guard errors so tests assert stable text.

## Icon
lucide `EyeOff` for badge + banner (the "watching, but not acting" metaphor).
Per-row chips: no icon or a 12px `EyeOff` if space allows. Line icons only.

## Maps to spec
This is exactly the `<ViewOnlyBanner>` + `PageHeader badges?` slot + control-level
disable from `spec-merged.md §3` — the design phase confirms the amber tone, the
`EyeOff` metaphor, the "don't fill the disabled button" rule, and the per-row chip
for secondary actions.
