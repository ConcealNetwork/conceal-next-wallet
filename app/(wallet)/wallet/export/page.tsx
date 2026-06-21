"use client";

import { Eye, FileDown, FileText } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "@/lib/ui/toast";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { CopyButton, PageHeader, SectionCard } from "@/components/wallet/common";
import { useWalletViewOnly } from "@/lib/hooks";
import { services } from "@/lib/services";
import type { ExportWalletData } from "@/lib/services/wallet.service";
import { backupDownloadFilename, downloadJsonFile } from "@/lib/ui/download-json-file";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { formatWalletBackupMarkdown } from "@/lib/ui/wallet-export-backup";

export default function ExportPage() {
  const [data, setData] = useState<ExportWalletData | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [backupName, setBackupName] = useState("wallet");
  const [backupPassword, setBackupPassword] = useState("");
  const [downloading, setDownloading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const viewOnly = useWalletViewOnly();

  useEffect(() => {
    services.wallet.exportWallet().then(setData);
  }, []);

  const hidden = "•••• •••• •••• •••• •••• ••••";
  const downloadFilename = backupDownloadFilename(backupName);

  async function handleDownloadBackup(event: React.FormEvent) {
    event.preventDefault();
    if (!backupPassword) return;

    setDownloading(true);
    try {
      const result = await services.wallet.downloadWalletBackup({
        filename: backupName,
        password: backupPassword,
      });
      downloadJsonFile(result.filename, result.payload);
      toast.success(walletCopy.downloadBackupSuccess);
      setDownloadOpen(false);
      setBackupPassword("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to download backup.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleExportPdf() {
    setExportingPdf(true);
    try {
      await services.wallet.exportWalletPdf();
      toast.success(walletCopy.exportPdfSuccess);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to export PDF.");
    } finally {
      setExportingPdf(false);
    }
  }

  return (
    <>
      <PageHeader title="Export" subtitle={walletCopy.exportPageSubtitle} />
      <Alert className="mb-6 animate-rise-in border-wallet-amber bg-wallet-amber/10 motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <AlertTitle>{walletCopy.exportAlertTitle}</AlertTitle>
        <AlertDescription>{walletCopy.exportAlertBody}</AlertDescription>
      </Alert>
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 [animation-delay:70ms]">
        <SectionCard title="Backup Data">
          <div className="space-y-5">
            {viewOnly ? (
              <p className="rounded-xl border border-wallet-amber/30 bg-wallet-amber/10 px-4 py-3 text-sm text-foreground">
                This is a view-only wallet — the spend key and mnemonic are blank. Only the address
                and view key are available.
              </p>
            ) : null}
            <div className="rounded-xl bg-secondary p-4">
              <p className="text-sm text-muted-foreground">Mnemonic seed words</p>
              <p className="mt-2 wrap-break-word font-mono text-sm text-foreground">
                {revealed ? data?.mnemonic : hidden}
              </p>
            </div>
            <div className="rounded-xl bg-secondary p-4">
              <p className="text-sm text-muted-foreground">Spend key</p>
              <p className="mt-2 break-all font-mono text-sm text-foreground">
                {revealed ? data?.spendKey : hidden}
              </p>
            </div>
            <div className="rounded-xl bg-secondary p-4">
              <p className="text-sm text-muted-foreground">View key</p>
              <p className="mt-2 break-all font-mono text-sm text-foreground">
                {revealed ? data?.viewKey : hidden}
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => setRevealed((value) => !value)}
              >
                <Eye className="size-4" aria-hidden="true" />
                {revealed ? "Hide" : "Reveal"}
              </Button>
              {data && <CopyButton value={formatWalletBackupMarkdown(data)} label="Copy Backup" />}
              {data && (
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={exportingPdf}
                  onClick={() => void handleExportPdf()}
                >
                  <FileText className="size-4" aria-hidden="true" />
                  {exportingPdf ? "Exporting…" : walletCopy.exportPdfButton}
                </Button>
              )}
              <Button type="button" className="gap-2" onClick={() => setDownloadOpen(true)}>
                <FileDown className="size-4" aria-hidden="true" />
                Download backup
              </Button>
            </div>
          </div>
        </SectionCard>
      </div>

      <Dialog open={downloadOpen} onOpenChange={setDownloadOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{walletCopy.downloadBackupDialogTitle}</DialogTitle>
            <DialogDescription>{walletCopy.downloadBackupDialogDescription}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={(event) => void handleDownloadBackup(event)}>
            <div className="space-y-2">
              <Label htmlFor="backup-filename">{walletCopy.downloadBackupFilenameLabel}</Label>
              <Input
                id="backup-filename"
                value={backupName}
                onChange={(event) => setBackupName(event.target.value)}
                placeholder="wallet"
                autoComplete="off"
                required
              />
              <p className="text-xs text-muted-foreground">
                {walletCopy.downloadBackupFilenameHint.replace("{filename}", downloadFilename)}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="backup-password">{walletCopy.downloadBackupPasswordLabel}</Label>
              <Input
                id="backup-password"
                type="password"
                value={backupPassword}
                onChange={(event) => setBackupPassword(event.target.value)}
                autoComplete="current-password"
                required
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDownloadOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={downloading || !backupPassword}>
                {downloading ? "Downloading…" : "Download"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
