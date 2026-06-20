# BRIEF — Receive page "Your Wallet Address" card redesign

## The problem
On the Receive page, the **"Your Wallet Address"** card lays its contents out as a
2-column flex row: **left** = address + controls, **right** = QR + logo picker +
Download button. The right column is intrinsically taller (QR + 3 small logo
buttons + a Download button stacked), so the left column is shorter and leaves an
**awkward vertical gap**. Centering the columns just splits the gap top + bottom.
Shrinking the QR only narrows it. We want a layout that reads **balanced** with no
dead space — the columns/sections should feel intentionally composed.

## What's in the card (content inventory — keep all of it)
1. Card title `Your Wallet Address` + subtitle `Share this address or QR to receive funds`
2. The wallet **address** — a long monospace string in a soft `secondary` panel (wraps to ~3 lines)
3. **Copy Address** button (outline/secondary, clipboard icon)
4. A **"QR encode for V1"** toggle (shadcn Switch + label) — niche, low priority
5. A short caption: `Scan the QR to send CCX to this address.`
6. The **QR code** (~150–180px, white rounded panel; has the Conceal orange coin mark centered in it)
7. A **logo picker**: 3 small square swatch buttons (orange mark / steel mark / coin) — pick which logo sits in the QR. Selected = orange ring.
8. **Download PNG** button (outline, download icon)

## Hard constraints (this is grounded redesign, NOT a new visual language)
- **Use the real Conceal design tokens** (block below). Primary accent is **`#FFA500` warm orange**. Surfaces are **warm** near-black / near-white. Render BOTH **dark and light**.
- Match the existing **shadcn `base-nova`** card feel already in the app: `--card` surface, `1px` warm `--border` hairlines, ~`14–16px` radius on the card, `12px` radius on inner panels, generous padding (`~24px`), `text-muted-foreground` for secondary text, mono font for the address.
- The QR panel is always **white** (`#fff`) with the QR dark — QR contrast can't be themed.
- Don't invent decorative chrome (no gradients on the card, no emoji, no left-border accent stripe, no glow). Anti-AI-slop: every element earns its place.
- The card sits in a `max-w-2xl` (~672px) centered column on desktop; must also work down to ~360px (stack gracefully).

## Output (each agent)
Write **one self-contained static HTML file** to
`docs/design/receive-address-card/agents/<yourname>.html` (`codex.html` / `gemini.html` / `glm.html` / `opus.html`).
- **Inline everything** (one `<style>` block, no external CSS/JS/fonts beyond a Google Fonts `<link>` if you must; system mono is fine). It will be shown inside an `<iframe>`, so it must render offline.
- Show **2–3 distinct layout variants** of the card, stacked vertically, each labelled (e.g. "Variant A — QR-led hero"). For EACH variant render it **twice side by side: once on the dark surface, once on the light surface**, so we can judge both themes.
- Use a **placeholder QR**: a CSS/SVG block of small squares (≈21×21 grid) with the orange coin mark in the middle — do NOT generate a real QR; this is a layout study.
- Keep the real copy text above. Keep it realistic — use the sample address `ccx7QbH7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m`.

## Directions to explore (riff freely — don't just do these three verbatim)
- **A — QR-led hero**: QR becomes the centered focal point at top; address + Copy + Download arranged as a balanced row/footer beneath. Vertical, symmetric, no side gap.
- **B — Aligned two-column**: keep side-by-side but make the columns *equal height by design* — group the controls so the left fills, or move Download/logo-picker to sit under the address, QR alone on the right.
- **C — Compact / single-column**: full-width address block on top, then a tidy QR + actions strip — minimal, dense, no wasted space.
- (Bonus) something genuinely novel that still respects the tokens.

## Token block — copy this into your `<style>`
```css
/* Dark surface */
.theme-dark{
  --background:#171513; --card:#241f1c; --card-foreground:#ffffff;
  --primary:#FFA500; --primary-foreground:#000000;
  --secondary:#2b2521; --secondary-foreground:#ffffff;
  --muted-foreground:#a9a097; --border:#39332d; --ring:#FFA500;
}
/* Light surface */
.theme-light{
  --background:#faf7f2; --card:#ffffff; --card-foreground:#221d18;
  --primary:#FFA500; --primary-foreground:#000000;
  --secondary:#f0ebe2; --secondary-foreground:#2e2820;
  --muted-foreground:#6b6258; --border:#e6ddd0; --ring:#FFA500;
}
/* the card itself sits on --background, is --card colored */
```
Surrounding page bg = `--background`; the card = `--card`; inner address panel = `--secondary`; hairlines = `--border`; accent = `--primary`.
