"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { forgetBiometricEnrollment } from "@/components/wallet/open-wallet-form";
import { hasBiometricEnrollment } from "@/lib/auth/biometric-store";
import { isBiometricAvailable } from "@/lib/auth/webauthn-prf";

/**
 * Settings control for biometric unlock. Enabling happens on the unlock screen
 * (where the password is verified before it's encrypted); here the user can see
 * the status and turn it off. Renders nothing when no platform authenticator is
 * available.
 */
export function BiometricSetting() {
  const [available, setAvailable] = useState(false);
  const [enrolled, setEnrolled] = useState(false);

  useEffect(() => {
    let mounted = true;
    setEnrolled(hasBiometricEnrollment());
    void isBiometricAvailable().then((value) => {
      if (mounted) setAvailable(value);
    });
    return () => {
      mounted = false;
    };
  }, []);

  if (!available) return null;

  function disable() {
    forgetBiometricEnrollment();
    setEnrolled(false);
    toast.success("Biometric unlock disabled.");
  }

  return enrolled ? (
    <Button type="button" variant="outline" onClick={disable}>
      Disable
    </Button>
  ) : (
    <span className="text-sm text-muted-foreground">
      Enable it next time you unlock with your password
    </span>
  );
}
