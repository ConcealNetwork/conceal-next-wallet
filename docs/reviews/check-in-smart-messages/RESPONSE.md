# Smart-message check-ins (v1.1) — review notes

A check-in is now a Conceal *smart message* (`{checkin,alive}`), byte-compatible with the ecosystem convention in `Acktarius/Conceal-2fa-app` (`model/SmartMessage.ts`): brace-wrapped, comma-separated `{module,action,…}`, detected by a trimmed `{`/`}`.

## Review
- **CodeRabbit** — 1 Major (fixed): `encodeSmartMessage` didn't reject parts containing the structural delimiters (`,` `{` `}`), which could corrupt a round-trip. Added a guard that throws on invalid parts (check-in inputs are fixed constants, but the helper is reusable). Output for valid inputs is unchanged, so conceal-2fa compatibility holds. Test added.
- **Antigravity (Gemini 3.1 Pro)** — completed with no output.
- **Codex** — out of credits; **GLM** — used in the design phase.

## Self-review of the key risks
- **Spoofing:** the watcher matches a contact's messages by **payment-id AND address** when a PID is set — a third party can pick any PID but can't also send from the contact's address. Watchers without a PID stay address-only (no v1 regression). The residual ("a check-in is not authenticated") is documented in the disclaimer copy.
- **Parser safety:** `parseSmartMessage`/`parseCheckIn` never throw; whole-body anchored detection; status whitelist is `Object.hasOwn`-gated so `constructor`/`__proto__`/`toString` can't masquerade. Tested with adversarial input.
- **Two-timer hazard avoided:** the overdue clock is still driven by *any* received message (`lastReceivedForWatcher`); the 💚 indicator is the only thing keyed on intentional check-ins (`hasFreshCheckIn`). No competing timers.
- **Send safety:** one-tap send is guarded on view-only + `isPending` (no double-send), carries the watcher's PID, is non-TTL, surfaces errors, and states the honest gross fee.
- **No pollution:** smart messages render as a chip (💚 Check-in / "Smart message") in-thread and in the conversation preview, never the raw `{…}` token.

## Cross-app cipher note (follow-up, not built)
conceal-2fa encrypts its smart-message channel with **ChaCha12**; this wallet's message pipeline uses its standard cipher. This PR is **body-format** interop (correct for check-ins between conceal-next-wallet users). Full cross-app cipher-level interop would be a separate wallet-core message-encoding change.

## Verification
`npm run types && npm run lint && npm test` (309 unit) green; `NEXT_PUBLIC_USE_MOCK=false npm run build` clean; `e2e/check-ins.spec.ts` (incl. one-tap send) passes.
