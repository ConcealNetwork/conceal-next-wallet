/*
 * cordova-plugin-biometric-unlock JS bridge.
 *
 * Exposes cordova.plugins.biometricUnlock consumed by
 * lib/cordova/biometric-unlock.ts. Each method returns a Promise so the TS
 * bridge can await it directly. The native side (network.conceal.biometricunlock.
 * BiometricUnlockPlugin) only releases a secret through the BiometricPrompt
 * CryptoObject success callback — this JS layer never short-circuits that.
 */
(function () {
  var exec = cordova.require("cordova/exec");

  function promise(action, args) {
    return new Promise(function (resolve, reject) {
      exec(resolve, reject, "BiometricUnlock", action, args);
    });
  }

  module.exports = {
    isAvailable: function () {
      return promise("isAvailable", []);
    },
    enroll: function () {
      return promise("enroll", []);
    },
    unlock: function (credentialId) {
      return promise("unlock", [credentialId]);
    },
    remove: function (credentialId) {
      return promise("remove", [credentialId]);
    },
  };
})();
