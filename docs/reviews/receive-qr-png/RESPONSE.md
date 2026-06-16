# Review response — download receive QR as PNG

Reviewers (CLAUDE.md CLIs, called directly): **CodeRabbit** (1 finding),
**GLM-5.2** (`opencode`, clean), **Antigravity / Gemini 3.1 Pro** (`agy`, 3 findings).
**Codex** (`codex exec`) unavailable — workspace out of credits.

GLM rated all five focus categories clean (QR correctness, canvas/memory, SSR safety,
filename sanitization, paymentUri-matches-on-screen). Notably **Antigravity caught the
WebKit revoke bug that GLM rated clean** — useful cross-model coverage.

## Addressed

- **Synchronous `URL.revokeObjectURL` cancels the download in WebKit/Safari** (Antigravity
  HIGH) — deferred the revoke (`setTimeout(…, 1000)`) in `downloadQrPng`. The pre-existing
  CSV and JSON downloaders shared the same latent bug, so they got the same fix.
- **`qrModuleMatrix` could throw synchronously inside `qrToPngBlob`** (CodeRabbit MAJOR) —
  `qrcode-generator` throws if the value exceeds level-H capacity; wrapped it so the function
  always rejects its promise instead of throwing before the promise is returned.
- **`slice(0, 16)` could re-expose a trailing dash in the filename** (Antigravity MEDIUM) —
  trim again after the clamp; added a unit test covering a separator landing on the boundary.
- **Canvas backing store relied on GC** (Antigravity LOW) — zero the canvas dimensions in the
  `toBlob` callback to release it promptly.

## Deferred (with reason)

- **No decode-back test of the rendered PNG** (GLM LOW) — GLM notes this is "really a tautology"
  since `qrModuleMatrix` wraps `qrcode-generator` directly. The matrix shape/finder/determinism
  is unit-tested and the e2e asserts PNG magic bytes + filename, so a meaningful decode-back test
  would need a full QR decoder in jsdom for little added signal.
