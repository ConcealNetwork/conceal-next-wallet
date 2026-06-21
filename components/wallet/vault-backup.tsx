"use client";

import { useRef, useState } from "react";
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
  buildVaultFile,
  openVaultFile,
  parseVaultFile,
  restoreVaultData,
  type VaultFile,
} from "@/lib/storage/vault";
import { backupDownloadFilename, downloadJsonFile } from "@/lib/ui/download-json-file";
import { toast } from "@/lib/ui/toast";

/**
 * Settings control: export/import an encrypted backup of device-local data
 * (transaction notes + UI preferences) so it can be moved between browsers.
 * It does NOT contain wallet keys — the seed/keys are exported separately.
 */
export function VaultBackup() {
  const [mode, setMode] = useState<"idle" | "export" | "import">("idle");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [replaceNotes, setReplaceNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingFile, setPendingFile] = useState<VaultFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function close() {
    setMode("idle");
    setPassword("");
    setConfirm("");
    setReplaceNotes(false);
    setPendingFile(null);
  }

  async function handleExport() {
    if (password.length < 8) {
      toast.error("Use a password of at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords don't match.");
      return;
    }
    setBusy(true);
    try {
      const file = await buildVaultFile(password, new Date().toISOString());
      const stem = `conceal-device-data-${new Date().toISOString().slice(0, 10)}`;
      downloadJsonFile(backupDownloadFilename(stem), file);
      toast.success("Encrypted backup downloaded.");
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the backup.");
    } finally {
      setBusy(false);
    }
  }

  async function onFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    try {
      const parsed = parseVaultFile(await file.text());
      setPendingFile(parsed);
      setPassword("");
      setMode("import");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "That file isn't a valid backup.");
    }
  }

  async function handleImport() {
    if (!pendingFile || !password) return;
    setBusy(true);
    try {
      const data = await openVaultFile(pendingFile, password);
      const result = await restoreVaultData(data, { mergeNotes: !replaceNotes });
      toast.success(
        `Restored ${result.notes} note${result.notes === 1 ? "" : "s"} and ${result.prefs} preference${result.prefs === 1 ? "" : "s"}. Reload to apply preferences.`,
      );
      close();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore the backup.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" onClick={() => setMode("export")}>
        Export
      </Button>
      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()}>
        Restore
      </Button>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={onFilePicked}
      />

      <Dialog open={mode !== "idle"} onOpenChange={(open) => !open && close()}>
        <DialogContent className="sm:max-w-md">
          {mode === "export" ? (
            <>
              <DialogHeader>
                <DialogTitle>Export device data</DialogTitle>
                <DialogDescription>
                  Encrypts your transaction notes and display preferences with a password. This
                  backup does <strong>not</strong> contain your wallet keys.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="vault-password">Backup password</Label>
                  <Input
                    id="vault-password"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vault-confirm">Confirm password</Label>
                  <Input
                    id="vault-confirm"
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={busy}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleExport()} disabled={busy}>
                  {busy ? "Encrypting…" : "Download backup"}
                </Button>
              </DialogFooter>
            </>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Restore device data</DialogTitle>
                <DialogDescription>
                  Enter the password this backup was encrypted with.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="vault-restore-password">Backup password</Label>
                  <Input
                    id="vault-restore-password"
                    type="password"
                    autoComplete="off"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </div>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={replaceNotes}
                    onChange={(e) => setReplaceNotes(e.target.checked)}
                  />
                  Replace my existing notes (otherwise they're kept and only new ones are added)
                </label>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={close} disabled={busy}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={() => void handleImport()}
                  disabled={busy || !password}
                >
                  {busy ? "Restoring…" : "Restore"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
