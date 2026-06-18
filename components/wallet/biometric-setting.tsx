"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  addPasskeyCredential,
  clearPasskeyEnrollment,
  getPasskeyEnrollment,
  type PasskeyEnrollment,
  removePasskeyCredential,
  savePasskeyEnrollment,
} from "@/lib/auth/biometric-store";
import {
  enrollPasskeyCredential,
  isPasskeyUnlockAvailable,
  PasskeyError,
} from "@/lib/auth/webauthn-prf";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";

/**
 * Settings control for passkey unlock. Lists the authenticators registered on
 * this device (Touch ID / Windows Hello / security keys / phone passkeys), lets
 * the user remove any of them, and add another (verifying the wallet password
 * first). Renders nothing when WebAuthn is unavailable.
 */
export function PasskeySetting() {
  const [available, setAvailable] = useState(false);
  const [enrollment, setEnrollment] = useState<PasskeyEnrollment | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    setAvailable(isPasskeyUnlockAvailable());
    setEnrollment(getPasskeyEnrollment());
  }, []);

  if (!available) return null;

  const credentials = enrollment?.credentials ?? [];

  function refresh() {
    setEnrollment(getPasskeyEnrollment());
  }

  function remove(credentialId: string) {
    const current = getPasskeyEnrollment();
    if (!current) {
      refresh();
      return;
    }
    const next = removePasskeyCredential(current, credentialId);
    if (next) {
      savePasskeyEnrollment(next);
    } else {
      clearPasskeyEnrollment();
    }
    refresh();
    toast.success("Passkey removed.");
  }

  function removeAll() {
    clearPasskeyEnrollment();
    refresh();
    toast.success("Passkey unlock disabled.");
  }

  return (
    <div className="flex w-full flex-col gap-3">
      {credentials.length > 0 ? (
        <ul className="space-y-1.5">
          {credentials.map((credential) => (
            <li
              key={credential.credentialId}
              className="flex items-center justify-between gap-3 text-sm"
            >
              <span className="text-foreground">
                {credential.label}
                {credential.createdAt ? (
                  <span className="text-muted-foreground">
                    {" · "}
                    {new Date(credential.createdAt).toLocaleDateString()}
                  </span>
                ) : null}
              </span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(credential.credentialId)}
                aria-label={`Remove ${credential.label}`}
              >
                Remove
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <span className="text-sm text-muted-foreground">
          No passkeys yet — add one below, or enable it next time you unlock with your password.
        </span>
      )}
      <div className="flex justify-end gap-2">
        {credentials.length > 0 ? (
          <Button type="button" variant="ghost" size="sm" onClick={removeAll}>
            Disable all
          </Button>
        ) : null}
        <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
          Add a passkey
        </Button>
      </div>
      <AddPasskeyDialog open={addOpen} onOpenChange={setAddOpen} onAdded={refresh} />
    </div>
  );
}

function AddPasskeyDialog({
  open,
  onOpenChange,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdded: () => void;
}) {
  const { walletInfo } = useWalletSession();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Don't leave the typed password in state/DOM after the dialog closes.
  useEffect(() => {
    if (!open) setPassword("");
  }, [open]);

  async function submit() {
    setLoading(true);
    try {
      // Confirm the password before encrypting it under the new credential — a
      // typo would otherwise enroll an unusable passkey.
      if (!(await services.wallet.verifyPassword(password))) {
        toast.error("That password doesn't match this wallet.");
        return;
      }
      const credential = await enrollPasskeyCredential(password);
      savePasskeyEnrollment(
        addPasskeyCredential(getPasskeyEnrollment(), credential, walletInfo?.address),
      );
      toast.success("Passkey added.");
      onAdded();
      onOpenChange(false);
      setPassword("");
    } catch (error) {
      if (!(error instanceof PasskeyError) || error.code !== "cancelled") {
        toast.error(error instanceof Error ? error.message : "Couldn't add this passkey.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a passkey</DialogTitle>
          <DialogDescription>
            Confirm your wallet password, then approve the passkey prompt (Touch ID, a security key,
            or your phone).
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void submit();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="add-passkey-password">Password</Label>
            <Input
              id="add-passkey-password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !password}>
              {loading ? "Adding…" : "Add passkey"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
