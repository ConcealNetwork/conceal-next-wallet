package network.conceal.biometricunlock;

import android.os.Bundle;
import androidx.annotation.NonNull;
import androidx.biometric.BiometricManager;
import androidx.biometric.BiometricPrompt;
import androidx.core.content.ContextCompat;
import androidx.fragment.app.DialogFragment;

/**
 * Hosts a {@link BiometricPrompt} bound to a Keystore {@link Cipher} via a
 * CryptoObject. The secret is only released to the WebView from
 * {@link Result#onSuccess(BiometricPrompt.CryptoObject)} — i.e. only after the
 * OS reports a successful BIOMETRIC_STRONG authentication that has authorized
 * the Keystore key for use.
 *
 * Implemented as a retained DialogFragment because androidx BiometricPrompt
 * requires a Fragment/FragmentActivity host and Cordova's MainActivity is a
 * plain Activity; the plugin attaches this fragment to drive the prompt.
 */
public class BiometricPromptFragment extends DialogFragment {

  /** Notifies the plugin of the prompt outcome (called on the main thread). */
  interface Result {
    void onSuccess(BiometricPrompt.CryptoObject cryptoObject);
    void onError(int code, String message);
    void onCancelled();
  }

  private BiometricPrompt.CryptoObject cryptoObject;
  private Result result;
  private String title;
  private String subtitle;

  static BiometricPromptFragment newInstance(
      BiometricPrompt.CryptoObject cryptoObject, String title, String subtitle) {
    BiometricPromptFragment f = new BiometricPromptFragment();
    f.setCancelable(false);
    f.cryptoObject = cryptoObject;
    f.title = title;
    f.subtitle = subtitle;
    return f;
  }

  @Override
  public void onCreate(Bundle savedInstanceState) {
    super.onCreate(savedInstanceState);
    // Survive config changes so the prompt callback is not lost on rotation.
    setRetainInstance(true);
  }

  void setResult(Result result) {
    this.result = result;
  }

  void show() {
    if (getActivity() == null) {
      if (result != null) result.onError(BiometricPrompt.ERROR_HW_NOT_PRESENT, "No activity");
      return;
    }
    BiometricPrompt prompt = new BiometricPrompt(this, ContextCompat.getMainExecutor(getActivity()),
        new BiometricPrompt.AuthenticationCallback() {
          @Override
          public void onAuthenticationSucceeded(
              @NonNull BiometricPrompt.AuthenticationResult authenticationResult) {
            BiometricPrompt.CryptoObject co = authenticationResult.getCryptoObject();
            dismissAllowingStateLoss();
            if (result != null && co != null) {
              result.onSuccess(co);
            } else if (result != null) {
              result.onError(BiometricPrompt.ERROR_UNABLE_TO_PROCESS,
                  "Biometric success returned no crypto object");
            }
          }

          @Override
          public void onAuthenticationError(int errorCode, @NonNull CharSequence errString) {
            dismissAllowingStateLoss();
            if (result == null) return;
            if (errorCode == BiometricPrompt.ERROR_USER_CANCELED
                || errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON
                || errorCode == BiometricPrompt.ERROR_CANCELED) {
              result.onCancelled();
            } else {
              result.onError(errorCode, errString.toString());
            }
          }

          @Override
          public void onAuthenticationFailed() {
            // A single bad fingerprint/face read — the prompt stays open and
            // the user may retry. Do NOT resolve here; only error/cancel/success
            // are terminal.
          }
        });

    BiometricPrompt.PromptInfo info = new BiometricPrompt.PromptInfo.Builder()
        .setTitle(title != null ? title : "Unlock Conceal Wallet")
        .setSubtitle(subtitle != null ? subtitle : "Confirm your biometric to continue")
        .setNegativeButtonText("Cancel")
        .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
        .setConfirmationRequired(false)
        .build();

    if (cryptoObject != null) {
      prompt.authenticate(info, cryptoObject);
    } else {
      // No crypto object means no Keystore key — refuse to authenticate
      // unconditionally. Fail closed.
      if (result != null) {
        result.onError(BiometricPrompt.ERROR_UNABLE_TO_PROCESS,
            "Biometric prompt requires a Keystore crypto object");
      }
    }
  }
}
