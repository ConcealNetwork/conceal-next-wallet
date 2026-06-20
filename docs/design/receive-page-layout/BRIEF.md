# BRIEF — Receive page rethink (kill the dead space, use the QR's right side)

## Context — where we are now
The Receive page (desktop, main column is `max-w-2xl` ≈ 672px wide; a right rail beside it already
holds Recently-Received / Deposit-History / Market — DON'T design that, it stays) currently has **two
stacked cards**:

1. **"Your Wallet Address"** card (compact single-column):
   - Header: title `Your Wallet Address` + subtitle `Share this address or QR to receive funds`, with a **Copy Address** button top-right.
   - Full-width **address** panel (long mono `ccx7…` string in a soft `--secondary` inset).
   - Then a row: **QR on the left** (white tile, ~150px, Conceal coin mark centered) + a **right column** holding a **logo picker** (4 small swatches: orange / steel / coin / ink mark for the QR centre), a **Download PNG** button, and a caption `Scan the QR to send CCX to this address.`
2. **"Request a Payment"** card: `Amount (CCX)`, `Payment ID`, `Message` fields; when an amount is entered it shows a **Payment Link** box (copyable URL) + a `Use legacy (v1) link` toggle.

## The problem
In card 1, the **right side of the QR is mostly dead space** — the QR tile is much taller than the
3 stacked controls (picker + Download + caption), leaving an L-shaped void. We want that space to
**earn its place**, and ideally make the whole page feel more cohesive / less "two stacked boxes".

## Directions to design (each is a hypothesis — show your best take; you may blend or invent)
- **A — Merge the two cards (interactive QR).** Put the **Request-a-Payment fields** (Amount / Payment ID / Message) in that dead space to the **right of the QR**, in ONE card. The QR + payment-link **regenerate live** as the user types an amount/note. Kills the void AND consolidates the page. (Strongest hypothesis.)
- **B — Receive-action right column.** Keep it focused on the address, but fill the right column with genuinely useful receive actions: **Share** (native share-sheet style button — send the address/link/QR to a contact), **Present QR** (a "show fullscreen" affordance for showing the code to someone in person, POS-style), plus the existing logo-picker + Download PNG. Make it look deliberate, not padded.
- **C — Different format / bigger visual.** Rethink the QR as a designed object: a larger centered QR hero with a tidy action row beneath, OR a shareable **"payment card"** (address + optional amount + Conceal coin artwork) that reads like something you'd screenshot and send. Lean visual.

## Hard constraints (grounded redesign — NOT a new visual language)
- Use the **real Conceal tokens** (block below). Accent **`#FFA500`** warm orange; warm dark/light surfaces. Render **BOTH dark and light**.
- Match the app's **shadcn `base-nova`** card feel: `--card` surface, 1px `--border` hairlines, ~14–16px card radius, 12px inner-panel radius, ~24px padding, mono address, `--muted-foreground` secondary text. **The QR tile is always white** (`#fff`) with a hairline border + soft shadow (it must stay scannable / themed-independent).
- Anti-AI-slop: no gradients on the card, no emoji, no left-border accent stripe, no glow. Every element earns its place — don't just fill the void with decoration.
- Works at `max-w-2xl` desktop AND collapses gracefully to ~360px mobile (stack).

## Output (each agent)
Write ONE self-contained static HTML file to `docs/design/receive-page-layout/agents/<yourname>.html`
(`gemini.html` / `glm.html` / `opus.html`).
- **2–3 distinct variants**, stacked + clearly labelled (e.g. "Variant A — Interactive merged card"). For EACH variant render it **twice side by side: dark surface (left) and light surface (right)**.
- **Inline everything** (one `<style>` block, no external CSS/JS; system fonts fine) — it renders inside an `<iframe>` offline.
- **Placeholder QR**: a CSS/SVG grid of small squares (~21×21) with an orange coin mark centered — NOT a real QR.
- Use the real copy + the sample address `ccx7QbH7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3m`. For the "interactive" variant you can show the form pre-filled (e.g. Amount `5`) so the live-QR concept reads.

## Token block — copy into your `<style>`
```css
.theme-dark{
  --background:#171513; --card:#241f1c; --card-foreground:#ffffff;
  --primary:#FFA500; --primary-foreground:#000000;
  --secondary:#2b2521; --secondary-foreground:#ffffff;
  --muted-foreground:#a9a097; --border:#39332d; --ring:#FFA500;
}
.theme-light{
  --background:#faf7f2; --card:#ffffff; --card-foreground:#221d18;
  --primary:#FFA500; --primary-foreground:#000000;
  --secondary:#f0ebe2; --secondary-foreground:#2e2820;
  --muted-foreground:#6b6258; --border:#e6ddd0; --ring:#FFA500;
}
```
Page bg = `--background`; card = `--card`; inner panels/inputs = `--secondary`; hairlines = `--border`; accent = `--primary`. Form inputs: `--secondary` bg, 1px `--border`, focus ring `--ring`.
