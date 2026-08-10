package network.conceal.biometricunlock;

import android.content.Context;
import android.content.SharedPreferences;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;

import java.security.KeyStore;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

/**
 * Holds the Android Keystore key + the SharedPreferences-backed ciphertext for a
 * given credential. The 32-byte wallet-unlock secret is never persisted in
 * cleartext: only its AES-GCM ciphertext + IV (encrypted under the
 * biometric-bound Keystore key) are stored, so they are useless without an
 * authenticated Keystore key.
 *
 * Every Keystore key is created with:
 *   - AES-256 (256-bit entropy, generated inside the Keystore provider)
 *   - GCM/NoPadding
 *   - setUserAuthenticationRequired(true)
 *   - setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
 *     (API 30+; the BIOMETRIC_STRONG gate that backs the security boundary)
 *   - setRandomizedEncryptionRequired(false) so the same explicit IV can be
 *     used to init the Cipher both at enroll (encrypt) and unlock (decrypt),
 *     which is what makes the Cipher usable as a BiometricPrompt CryptoObject.
 */
final class BiometricVault {

  static final String KEYSTORE = "AndroidKeyStore";
  static final String TRANSFORMATION = "AES/GCM/NoPadding";
  static final int GCM_TAG_BITS = 128;
  static final int SECRET_BYTES = 32; // AES-256 key material handed to the WebView
  static final int IV_BYTES = 12;

  private static final String PREFS = "ccx-biometric-vault";
  private static final String KEY_IV_SUFFIX = ".iv";
  private static final String KEY_CT_SUFFIX = ".ct";

  private final SharedPreferences prefs;

  BiometricVault(Context context) {
    this.prefs = context.getApplicationContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
  }

  /** New random credential id (used at enroll time). */
  static String newCredentialId() {
    byte[] id = new byte[16];
    new SecureRandom().nextBytes(id);
    return base64(id);
  }

  /** Keystore alias for a credential's biometric-bound AES key. */
  static String aliasFor(String credentialId) {
    return "ccx-biometric-" + credentialId;
  }

  /** Generate a fresh 256-bit AES-GCM key inside the Keystore, bound to biometric auth. */
  static SecretKey generateKey(String credentialId) {
    try {
      KeyGenerator kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE);
      KeyGenParameterSpec.Builder b = new KeyGenParameterSpec.Builder(
          aliasFor(credentialId),
          KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
          .setKeySize(256)
          .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
          .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
          // GCM is semantically secure; we supply the IV explicitly so the
          // Cipher is reproducible for the CryptoObject path.
          .setRandomizedEncryptionRequired(false)
          .setUserAuthenticationRequired(true);
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        // Bind the key to a BIOMETRIC_STRONG auth — the core security gate.
        b.setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG);
      }
      kg.init(b.build());
      return kg.generateKey();
    } catch (Exception e) {
      throw new IllegalStateException("Failed to generate Keystore key", e);
    }
  }

  /** Load an existing biometric-bound key (used at unlock time). */
  static SecretKey loadKey(String credentialId) {
    try {
      KeyStore ks = KeyStore.getInstance(KEYSTORE);
      ks.load(null);
      SecretKey key = (SecretKey) ks.getKey(aliasFor(credentialId), null);
      if (key == null) {
        throw new IllegalStateException("No Keystore key for credential " + credentialId);
      }
      return key;
    } catch (Exception e) {
      throw new IllegalStateException("Failed to load Keystore key", e);
    }
  }

  /** Delete the Keystore key + stored ciphertext for a credential (best effort). */
  void remove(String credentialId) {
    try {
      KeyStore ks = KeyStore.getInstance(KEYSTORE);
      ks.load(null);
      ks.deleteEntry(aliasFor(credentialId));
    } catch (Exception ignored) {
      // removal is best-effort; never block the UI
    }
    SharedPreferences.Editor ed = prefs.edit();
    ed.remove(credentialId + KEY_IV_SUFFIX);
    ed.remove(credentialId + KEY_CT_SUFFIX);
    ed.apply();
  }

  /** Generate a fresh 32-byte unlock secret (never persisted in cleartext). */
  static byte[] generateSecret() {
    byte[] secret = new byte[SECRET_BYTES];
    new SecureRandom().nextBytes(secret);
    return secret;
  }

  /** Persist the AES-GCM ciphertext + IV for a credential. */
  void storeEncrypted(String credentialId, byte[] iv, byte[] ciphertext) {
    SharedPreferences.Editor ed = prefs.edit();
    ed.putString(credentialId + KEY_IV_SUFFIX, base64(iv));
    ed.putString(credentialId + KEY_CT_SUFFIX, base64(ciphertext));
    ed.apply();
  }

  /** Read the stored ciphertext for a credential, or null if absent. */
  byte[] loadCiphertext(String credentialId) {
    String ct = prefs.getString(credentialId + KEY_CT_SUFFIX, null);
    return ct == null ? null : decodeBase64(ct);
  }

  /** Read the stored IV for a credential, or null if absent. */
  byte[] loadIv(String credentialId) {
    String iv = prefs.getString(credentialId + KEY_IV_SUFFIX, null);
    return iv == null ? null : decodeBase64(iv);
  }

  /** Init a GCM Cipher for this key in the requested mode with the given IV. */
  static Cipher cipherFor(SecretKey key, int opmode, byte[] iv) {
    try {
      Cipher cipher = Cipher.getInstance(TRANSFORMATION);
      cipher.init(opmode, key, new GCMParameterSpec(GCM_TAG_BITS, iv));
      return cipher;
    } catch (Exception e) {
      throw new IllegalStateException("Failed to init Cipher", e);
    }
  }

  static String base64(byte[] bytes) {
    return Base64.getEncoder().encodeToString(bytes);
  }

  static byte[] decodeBase64(String value) {
    return Base64.getDecoder().decode(value);
  }
}
