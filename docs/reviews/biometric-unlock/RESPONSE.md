# Review response — biometric unlock (WebAuthn PRF)

Security-focused review via the CLAUDE.md CLIs: **Antigravity / Gemini 3.1 Pro** (`agy`,
full 9-point threat-model pass) + **CodeRabbit**. **GLM-5.2** (`opencode`) hung and was killed;
**Codex** out of credits.

Antigravity rated **8/9 threat-model categories clean**, confirming the core design:
- the AES key is the PRF *result*, reproducible only via a user-verified biometric assertion, so
  the stored ciphertext is useless without the device authenticator;
- a fixed app salt is standard/secure for local WebAuthn encryption;
- `attestation: "none"` + default `rp.id` + random challenge is sound for no-server PRF use;
- enrollment runs only **after** `openWallet` resolves (the password is verified before encryption);
- fresh 12-byte random IV per encryption; failures fall back to manual entry.

## Addressed

- **Stale enrollment after import / re-create** (Antigravity HIGH) — overwriting the wallet left a
  ciphertext that decrypts to the *old* password. Two layers now: (1) the enrollment records the
  wallet address, and `openSession` clears it whenever a different wallet is opened; (2) a self-heal
  — if a biometric unlock decrypts but the recovered password no longer opens the wallet, the
  enrollment is dropped. (Both fail safe regardless; the old password never unlocks the new wallet.)
- **`setState` after unmount** (CodeRabbit minor) — added mounted guards to the async
  feature-detect effects in `open-wallet-form` and `biometric-setting`.

## Notes / accepted

- **localStorage (not IndexedDB) for the enrollment** — the blob (credential id + IV + ciphertext)
  is not secret without the authenticator, and localStorage is already cleared by the panic wipe.
- **Password fallback always available**; browsers without PRF (Firefox) never see the option
  (`isUserVerifyingPlatformAuthenticatorAvailable` gate).

## Verification

Crypto (AES-GCM + base64url) and the enrollment store are unit-tested. The WebAuthn ceremony is
verified by an e2e that attaches a CDP **virtual authenticator with PRF** and exercises the full
create → PRF → AES-GCM encrypt → assertion → PRF → decrypt round-trip in real Chromium (the module
is a thin wrapper over exactly these calls). Golden-path e2e confirms no regression to normal unlock.
