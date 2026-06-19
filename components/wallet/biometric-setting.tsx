"use client";

import { useEffect, useRef, useState } from "react";
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
  renamePasskeyCredential,
  savePasskeyEnrollment,
} from "@/lib/auth/biometric-store";
import {
  enrollPasskeyCredential,
  isPasskeyUnlockAvailable,
  PasskeyError,
  signalPasskeyRemoved,
} from "@/lib/auth/webauthn-prf";
import { getActiveWalletId } from "@/lib/auth/active-wallet-id";
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
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  // Active wallet id for per-wallet passkey keying (#95).
  const walletIdRef = useRef<string>("default");

  useEffect(() => {
    setAvailable(isPasskeyUnlockAvailable());
    let cancelled = false;
    void getActiveWalletId().then((walletId) => {
      if (cancelled) return;
      walletIdRef.current = walletId;
      setEnrollment(getPasskeyEnrollment(walletId));
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!available) return null;

  const credentials = enrollment?.credentials ?? [];

  function refresh() {
    setEnrollment(getPasskeyEnrollment(walletIdRef.current));
  }

  function remove(credentialId: string) {
    const walletId = walletIdRef.current;
    const current = getPasskeyEnrollment(walletId);
    if (!current) {
      refresh();
      return;
    }
    const next = removePasskeyCredential(current, credentialId);
    if (next) {
      savePasskeyEnrollment(next, walletId);
    } else {
      clearPasskeyEnrollment(walletId);
    }
    // Best-effort: ask the OS/provider to prune its copy of the removed passkey.
    void signalPasskeyRemoved(credentialId);
    refresh();
    toast.success("Passkey removed.");
  }

  function removeAll() {
    const walletId = walletIdRef.current;
    const ids = (getPasskeyEnrollment(walletId)?.credentials ?? []).map((c) => c.credentialId);
    clearPasskeyEnrollment(walletId);
    ids.forEach((id) => void signalPasskeyRemoved(id));
    refresh();
    toast.success("Passkey unlock disabled.");
  }

  function startRename(credentialId: string, label: string) {
    setEditingId(credentialId);
    setEditLabel(label);
  }

  function saveRename() {
    if (!editingId) return;
    const walletId = walletIdRef.current;
    const current = getPasskeyEnrollment(walletId);
    if (current)
      savePasskeyEnrollment(renamePasskeyCredential(current, editingId, editLabel), walletId);
    setEditingId(null);
    refresh();
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
              {editingId === credential.credentialId ? (
                <form
                  className="flex flex-1 items-center gap-2"
                  onSubmit={(event) => {
                    event.preventDefault();
                    saveRename();
                  }}
                >
                  <Input
                    value={editLabel}
                    onChange={(event) => setEditLabel(event.target.value)}
                    aria-label="Passkey name"
                    autoFocus
                    className="h-8"
                  />
                  <Button type="submit" variant="ghost" size="sm">
                    Save
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </Button>
                </form>
              ) : (
                <>
                  <span className="text-foreground">
                    {credential.label}
                    {credential.createdAt ? (
                      <span className="text-muted-foreground">
                        {" · "}
                        {new Date(credential.createdAt).toLocaleDateString()}
                      </span>
                    ) : null}
                    {credential.discoverable ? (
                      <span className="text-muted-foreground">{" · synced"}</span>
                    ) : null}
                  </span>
                  <div className="flex shrink-0 gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => startRename(credential.credentialId, credential.label)}
                      aria-label={`Rename ${credential.label}`}
                    >
                      Rename
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => remove(credential.credentialId)}
                      aria-label={`Remove ${credential.label}`}
                    >
                      Remove
                    </Button>
                  </div>
                </>
              )}
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
      // Bind the enrollment to the open wallet. If the session lapsed while the
      // dialog was open, bail rather than store an enrollment with no wallet
      // (which the address-mismatch self-heal couldn't later drop).
      const address = walletInfo?.address;
      if (!address) {
        toast.error("Wallet session expired — reopen your wallet to add a passkey.");
        return;
      }
      // Confirm the password before encrypting it under the new credential — a
      // typo would otherwise enroll an unusable passkey.
      if (!(await services.wallet.verifyPassword(password))) {
        toast.error("That password doesn't match this wallet.");
        return;
      }
      const walletId = await getActiveWalletId();
      const current = getPasskeyEnrollment(walletId);
      const credential = await enrollPasskeyCredential(password, current?.credentials ?? []);
      savePasskeyEnrollment(addPasskeyCredential(current, credential, address), walletId);
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
