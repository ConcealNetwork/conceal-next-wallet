# Accessibility pass — review response

Parallel review of `git diff main...HEAD` by Antigravity (Gemini 3.1 Pro), GLM‑5.2, and CodeRabbit. Codex was out of credits this run. The pass started from a read-only audit (7 candidate findings; 3 were false positives — the QR sheet already has a `DialogTitle`, the send "Max" control is an accessible sibling button, and `CopyButton`'s `label` defaults to `"Copy"` so its aria-label is never undefined). The remaining real gaps and the reviewers' findings on the implementation:

## Addressed

| # | Sev | Source | Finding | Resolution |
|---|-----|--------|---------|------------|
| 1 | HIGH ×2 | Antigravity, GLM | `CopyButton` live region was **inside** the `<button>`, polluting its accessible name after a copy ("Copy" → "Copy Copied to clipboard") and risking the announcement being swallowed by the focus event. | Hoisted the `role="status"` span out as a sibling (component now returns a fragment). It stays out of the accessible name. |
| 2 | HIGH ×2 / MED | Antigravity, GLM | `role="alert"` on field errors: multiple alerts mount together on submit (verbose); React **reuses** the hint node across ternary branches so toggling `role` often doesn't announce; the `sendToSelf` branch was assertive-but-not-invalid. | **Dropped `role="alert"` from all field errors.** Kept `aria-invalid` + `aria-describedby`. react-hook-form focuses the first invalid field on submit, so the linked description is read on focus — the standard WCAG 3.3.1 / 4.1.2 pattern, no assertive interruptions. Applied to send fields and the shared import `LabeledTextField`. |
| 3 | MED | GLM | A repeat copy within the 1.2s reset window wouldn't re-announce (identical live-region text). | Added a `copyNonce` that appends `​` (zero-width, silent) so the text differs each copy and the region re-fires. |
| 4 | MED/LOW | Antigravity, GLM | create-page mnemonic helper: `role="status"` already implies `aria-live="polite"`. | Dropped the redundant `aria-live`; kept `role="status"` (it announces the "Copied!" change, which is the point — Antigravity's "remove the role" would have silenced the very feature). |
| 5 | MINOR | CodeRabbit | The Message textarea has `max(255)` schema validation but no error feedback/wiring — fails silently on submit. | Added `aria-invalid` + `aria-describedby` (`message-count message-error`) + an error `<p id="message-error">`, consistent with the other fields (no `role="alert"`). |

## Accepted as-is (documented)

- **`LabeledTextField`: `invalid && !error && !hint` → an invalid field with no description (LOW — GLM).** Latent only: every call site passes `error` alongside `invalid`. The `aria-describedby` guard already returns `undefined` when nothing renders, so there's no dangling idref. Left as-is.
- **Inline import-field errors aren't auto-announced.** The import-keys form isn't react-hook-form and doesn't move focus, so an inline error isn't spoken until the field is focused. This still satisfies WCAG 3.3.1 (error identified in text + programmatically associated via `aria-describedby`); a live announcement is not required. Kept consistent with the send form rather than reintroducing the `role="alert"` pitfalls.

## Verification

`npm run types && npm run lint && npm test` (250 unit, incl. a `CopyButton` SR-announcement test) green; `NEXT_PUBLIC_USE_MOCK=false npm run build` (111 precache entries) clean; `e2e/send-safety.spec.ts` (new: invalid address → `aria-invalid` + `aria-describedby` resolves to a visible message) + `golden-path` pass.
