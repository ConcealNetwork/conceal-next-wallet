# #84 i18n — utility pages (Receive / Network / Address Book) — review response

Localizes 3 safe utility pages into all 10 locales (91 new keys: receive.* 34,
network.* 23, addressBook.* 34; reuses `rail.paymentId`/`rail.message`/`action.copy`).

## Reviewer availability

- **CodeRabbit** — ran (see below).
- **Codex (gpt-5.5)** — **out of credits** this run (`ERROR: Your workspace is out of
  credits`). It reviewed the earlier slices this session; the workspace drained mid-batch.
- **GLM-5.2** — unavailable (opencode review-size hang, all session).

To compensate for losing Codex, the orchestrator ran a deeper-than-usual independent pass.

## Independent verification (orchestrator)

- **Placeholder integrity:** every interpolation token preserved across all 10 locales —
  exact ×10 totals (`{count}` 90 = 9 keys×10, `{label}` 60, `{pct}` 60, `{amount}` 30,
  `{out}`/`{in}` 20, `{names}`/`{relative}`/`{seconds}`/`{query}` 10). None dropped.
- **Key parity:** `tests/i18n.test.ts` passes — all 10 locales share the en key set.
- **No missing keys:** all 91 `t()` keys used across the 3 pages exist in the dictionary.
- **en byte-identity:** "Receive CCX", "Download PNG", "Network", "Address Book", reused-key
  labels — all unchanged → e2e (receive-qr-png + golden-path + shell-redesign) 10/10 green.
- **Hook safety:** `network/page.tsx` calls `useI18n()` only in the page component (line 24);
  SyncRing/SmartNodesGraph/PeerGraph receive labels as props — no module-scope/non-component hook.
- **Receive QR-state refactor:** the nested `encodeV1 → request → amount` ternary maps to the
  same 6 distinct description states (qrV1RequestAmount/qrV1Request/qrV1Address/qrRequestAmount/
  qrRequest/qrAddress) — no state lost or swapped.
- **Reused keys correct:** `rail.paymentId`="Payment ID", `rail.message`="Message",
  `action.copy`="Copy".

## CodeRabbit

`coderabbit review --plain -t all --base main` → **No findings.**

## Notes

No seed/recovery/send-key/irreversibility security copy on these pages — none touched.
Brand/product tokens (Conceal, CCX, ccx7) kept untranslated. Network telemetry terms
(hashrate/difficulty) + QR-logo brand aria-labels flagged for a native pass.
