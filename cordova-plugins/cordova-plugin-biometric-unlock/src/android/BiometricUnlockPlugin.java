package network.conceal.biometricunlock;

import android.os.Build;

import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.fragment.app.FragmentActivity;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;

/**
 * Cordova bridge for the Conceal biometric wallet-unlock.
 *
 * Exposes four actions to window.cordova.plugins.biometricUnlock:
 *   - isAvailable  -> true only when BIOMETRIC_STRONG is enrolled & usable.
 *   - enroll       -> shows a BiometricPrompt; on success generates a 32-byte
 *                     secret, AES-GCM-encrypts it under a fresh biometric-bound
 *                     Keystore key, persists {iv, ciphertext}, and returns
 *                     { credentialId, secretBase64url }.
 *   - unlock       -> shows a BiometricPrompt bound to the stored key; on
 *                     success decrypts the stored ciphertext and returns
 *                     { secretBase64url }.
 *   - remove       -> deletes the Keystore key + stored ciphertext.
 *
 * The secret is returned to the WebView ONLY from the BiometricPrompt success
 * callback (the CryptoObject path). There is no code path that releases a
 * secret without a successful BIOMETRIC_STRONG authentication.
 */
public class BiometricUnlockPlugin extends CordovaPlugin {

  private BiometricVault vault;

  @Override
  protected void pluginInitialize() {
    vault = new BiometricVault(cordova.getContext());
  }

  @Override
  public boolean execute(String action, JSONArray args, CallbackContext callbackContext) {
    try {
      switch (action) {
        case "isAvailable":
          handleIsAvailable(callbackContext);
          return true;
        case "enroll":
          handleEnroll(callbackContext);
          return true;
        case "unlock":
          handleUnlock(args, callbackContext);
          return true;
        case "remove":
          handleRemove(args, callbackContext);
          return true;
        default:
          callbackContext.error("unsupported action: " + action);
          return false;
      }
    } catch (Exception e) {
      callbackContext.error(errorMsg(e));
      return true;
    }
  }

  private void handleIsAvailable(CallbackContext callbackContext) {
    boolean ok = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
        && BiometricManager.from(cordova.getContext())
            .canAuthenticate(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            == BiometricManager.BIOMETRIC_SUCCESS;
    callbackContext.success(ok ? 1 : 0);
  }

  private void handleEnroll(CallbackContext callbackContext) {
    requireFragmentActivity();
    final String credentialId = BiometricVault.newCredentialId();
    final SecretKey key = BiometricVault.generateKey(credentialId);
    final byte[] iv = randomIv();

    final Cipher cipher = BiometricVault.cipherFor(key, Cipher.ENCRYPT_MODE, iv);
    BiometricPrompt.CryptoObject cryptoObject = new BiometricPrompt.CryptoObject(cipher);

    prompt(cryptoObject, "Enable Biometric Unlock", "Confirm your biometric to protect this wallet",
        new BiometricPromptFragment.Result() {
          @Override
          public void onSuccess(BiometricPrompt.CryptoObject co) {
            try {
              byte[] secret = BiometricVault.generateSecret();
              byte[] ciphertext = co.getCipher().doFinal(secret);
              vault.storeEncrypted(credentialId, iv, ciphertext);
              JSONObject out = new JSONObject();
              out.put("credentialId", credentialId);
              out.put("secretBase64url", base64Url(secret));
              callbackContext.success(out);
            } catch (Exception e) {
              callbackContext.error(errorMsg(e));
            }
          }

          @Override
          public void onError(int code, String message) {
            callbackContext.error(message != null ? message : "biometric error");
          }

          @Override
          public void onCancelled() {
            callbackContext.error("cancelled");
          }
        });
  }

  private void handleUnlock(JSONArray args, CallbackContext callbackContext) throws JSONException {
    requireFragmentActivity();
    final String credentialId = args.getString(0);
    final byte[] iv = vault.loadIv(credentialId);
    final byte[] storedCt = vault.loadCiphertext(credentialId);
    if (iv == null || storedCt == null) {
      callbackContext.error("unsupported");
      return;
    }
    final SecretKey key = BiometricVault.loadKey(credentialId);
    final Cipher cipher = BiometricVault.cipherFor(key, Cipher.DECRYPT_MODE, iv);
    BiometricPrompt.CryptoObject cryptoObject = new BiometricPrompt.CryptoObject(cipher);

    prompt(cryptoObject, "Unlock Conceal Wallet", "Confirm your biometric to unlock",
        new BiometricPromptFragment.Result() {
          @Override
          public void onSuccess(BiometricPrompt.CryptoObject co) {
            try {
              byte[] secret = co.getCipher().doFinal(storedCt);
              if (secret == null || secret.length != BiometricVault.SECRET_BYTES) {
                // Defense in depth: only the expected 32-byte secret may leave
                // the native layer. Reject anything else and fail closed.
                callbackContext.error("unsupported");
                return;
              }
              JSONObject out = new JSONObject();
              out.put("secretBase64url", base64Url(secret));
              callbackContext.success(out);
            } catch (Exception e) {
              callbackContext.error(errorMsg(e));
            }
          }

          @Override
          public void onError(int code, String message) {
            callbackContext.error(message != null ? message : "biometric error");
          }

          @Override
          public void onCancelled() {
            callbackContext.error("cancelled");
          }
        });
  }

  private void handleRemove(JSONArray args, CallbackContext callbackContext) throws JSONException {
    String credentialId = args.getString(0);
    vault.remove(credentialId);
    callbackContext.success();
  }

  /** Attach the prompt fragment on the UI thread and wire its result callback. */
  private void prompt(
      BiometricPrompt.CryptoObject cryptoObject,
      String title,
      String subtitle,
      BiometricPromptFragment.Result result) {
    cordova.getActivity().runOnUiThread(() -> {
      FragmentActivity activity = (FragmentActivity) cordova.getActivity();
      BiometricPromptFragment fragment =
          (BiometricPromptFragment) activity.getSupportFragmentManager()
              .findFragmentByTag("ccx-biometric-prompt");
      if (fragment == null) {
        fragment = BiometricPromptFragment.newInstance(cryptoObject, title, subtitle);
        fragment.setResult(result);
        fragment.show(activity.getSupportFragmentManager(), "ccx-biometric-prompt");
      } else {
        fragment.setResult(result);
      }
      fragment.show();
    });
  }

  private void requireFragmentActivity() {
    if (!(cordova.getActivity() instanceof FragmentActivity)) {
      throw new IllegalStateException(
          "Biometric unlock requires a FragmentActivity host (Cordova MainActivity must extend AndroidX)");
    }
  }

  private static byte[] randomIv() {
    byte[] iv = new byte[BiometricVault.IV_BYTES];
    new java.security.SecureRandom().nextBytes(iv);
    return iv;
  }

  /** base64url (no padding) encoding for the secret handed to the WebView. */
  private static String base64Url(byte[] bytes) {
    return java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
  }

  private static String errorMsg(Throwable e) {
    String msg = e.getMessage();
    return msg != null ? msg : e.getClass().getSimpleName();
  }
}
