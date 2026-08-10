# cordova-plugin-biometric-unlock (vendored)

Android Keystore + BiometricPrompt unlock for the Conceal wallet password. This
plugin is **vendored** in this repository (not pulled from npm) so its native
security boundary is reviewable in-tree. It is wired in as
`file:cordova-plugins/cordova-plugin-biometric-unlock` in
`lib/cordova/shell-setup.mjs` and consumed by the TypeScript bridge in
`lib/cordova/biometric-unlock.ts` via `window.cordova.plugins.biometricUnlock`.

## Why a vendored native plugin?

The wallet password is the highest-value secret in the app. On Cordova Android,
WebAuthn/PRF is unavailable, so the password is AES-GCM-wrapped under a secret
that must only be recoverable after a successful device biometric authentication.
That entire boundary rests on the native plugin — it is the only thing standing
between the wrapped password and an attacker with device access. Shipping that
boundary as an unversioned, unaudited `file:` reference (the gap introduced in
PR #266) is a secure-by-default and supply-chain risk. Vendoring makes the
native code reviewable and pinned.

## Security contract

The native implementation in `src/android/` guarantees:

1. **AES-256 key generated inside the Android Keystore** with 256-bit entropy
   (`KeyGenParameterSpec.Builder.setKeySize(256)`, `KeyGenerator` backed by the
   `AndroidKeyStore` provider) — per credential, alias `ccx-biometric-<id>`.
2. **The Keystore key is biometric-bound:**
   - `setUserAuthenticationRequired(true)`
   - On API 30+: `setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)`
   - The prompt requests `BiometricManager.Authenticators.BIOMETRIC_STRONG` only.
3. **The secret is released to the WebView ONLY after a successful
   BiometricPrompt + CryptoObject authentication.** Both `enroll` and `unlock`
   build a `Cipher` from the biometric-bound key, wrap it in a
   `BiometricPrompt.CryptoObject`, and the secret is produced solely inside the
   `onAuthenticationSucceeded` callback (via `cryptoObject.getCipher()`). There
   is no unconditional code path that returns a secret — a missing crypto object
   fails closed.
4. **The secret is never logged and never persisted outside the Keystore.**
   Only the AES-GCM ciphertext + IV (encrypted under the biometric-bound key)
   are stored in `SharedPreferences` (`ccx-biometric-vault`); they are useless
   without an authenticated Keystore key. The raw 32-byte secret lives only in
   memory on the prompt's success callback path.

### Defense in depth (native + TS)

- **Native (`BiometricUnlockPlugin.handleUnlock`):** rejects any decrypted
  output that is not exactly 32 bytes.
- **TypeScript (`lib/cordova/biometric-unlock.ts`):** `cordovaBiometricEnroll`
  and `cordovaBiometricUnlock` validate the returned secret is exactly 32 bytes
  and throw otherwise, so a buggy/short secret can never reach
  `aesKeyFromSecret`.

## Files

- `plugin.xml` — Cordova manifest; registers the plugin, the Android source,
  the `androidx.biometric` framework dependency, and the JS bridge.
- `www/biometricUnlock.js` — Promise-returning JS bridge clobbered onto
  `cordova.plugins.biometricUnlock`.
- `src/android/BiometricUnlockPlugin.java` — CordovaPlugin exposing
  `isAvailable` / `enroll` / `unlock` / `remove`.
- `src/android/BiometricVault.java` — Keystore key generation, Cipher init, and
  the SharedPreferences ciphertext store.
- `src/android/BiometricPromptFragment.java` — retained DialogFragment hosting
  the androidx `BiometricPrompt` bound to the CryptoObject.

## Host requirement

`BiometricPrompt` requires a `FragmentActivity` host. The Cordova app's
`MainActivity` must extend AndroidX's `FragmentActivity` (e.g.
`androidx.appcompat.app.AppCompatActivity`). `cordova-android >= 10` ships with
AndroidX enabled. If the host activity is not a `FragmentActivity`,
`BiometricUnlockPlugin` throws at action time and `isCordovaBiometricUnlockAvailable()`
returns false on the TS side, so biometric unlock is never offered.

## Verifying the plugin builds

The native side is compiled by the Cordova Android build (not by this repo's
`npm run build`). To verify it locally in a Cordova shell:

```sh
cordova plugin add cordova-plugins/cordova-plugin-biometric-unlock
cordova build android
```
