"use client";

import { Eye, EyeOff, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { WalletPasswordStrengthPanel } from "@/components/wallet/password-strength-bars";
import { SectionCard } from "@/components/wallet/common";
import { services } from "@/lib/services";
import { useWalletSession } from "@/lib/session/wallet-session";
import { walletCopy } from "@/lib/ui/wallet-copy";
import { cn } from "@/lib/utils";

const COPIED_FEEDBACK_MS = 1200;

export default function CreateWalletPage() {
  const { openSession } = useWalletSession();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [acknowledged, setAcknowledged] = useState(false);
  const [mnemonicDialogOpen, setMnemonicDialogOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const passwordsMatch = password !== "" && password === confirmPassword;
  const canSubmit = passwordsMatch && !loading;

  async function handleCreate(event: React.FormEvent) {
    event.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    try {
      const draft = await services.wallet.prepareCreateWallet();
      setMnemonic(draft.mnemonic);
      setAcknowledged(false);
      setCopied(false);
      setMnemonicDialogOpen(true);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to create wallet.");
    } finally {
      setLoading(false);
    }
  }

  async function handleFinish() {
    if (!acknowledged || mnemonic === null) return;

    setFinalizing(true);
    try {
      const wallet = await services.wallet.finalizeCreateWallet({ password });
      setMnemonicDialogOpen(false);
      openSession(wallet, "/wallet/account");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save wallet.");
    } finally {
      setFinalizing(false);
    }
  }

  async function handleAbort() {
    await services.wallet.abortCreateWallet();
    setMnemonicDialogOpen(false);
    setMnemonic(null);
    setAcknowledged(false);
    setCopied(false);
  }

  async function copyMnemonic() {
    if (mnemonic === null) return;

    try {
      await navigator.clipboard.writeText(mnemonic);
      setCopied(true);
      window.setTimeout(() => setCopied(false), COPIED_FEEDBACK_MS);
    } catch {
      toast.error("Could not copy to clipboard.");
    }
  }

  return (
    <div className="mx-auto max-w-xl py-12">
      <SectionCard title="Create wallet" description={walletCopy.createWalletDescription}>
        <form className="space-y-4" onSubmit={handleCreate}>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="create-password">Encryption password</Label>
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                className="inline-flex cursor-pointer items-center gap-1 rounded-sm text-xs text-muted-foreground transition-colors duration-200 hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                {showPassword ? "Hide" : "Show"}
              </button>
            </div>
            <Input
              id="create-password"
              type={showPassword ? "text" : "password"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
            <WalletPasswordStrengthPanel password={password} />
          </div>

          <div className="space-y-2">
            <Label htmlFor="create-confirm-password">Confirm password</Label>
            <Input
              id="create-confirm-password"
              type={showPassword ? "text" : "password"}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              required
            />
            {confirmPassword !== "" && !passwordsMatch && (
              <p className="text-sm text-wallet-outgoing">Passwords do not match.</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={!canSubmit}>
            {loading ? "Generating wallet…" : "Create wallet"}
          </Button>
        </form>
      </SectionCard>

      <AlertDialog open={mnemonicDialogOpen} onOpenChange={() => undefined}>
        <AlertDialogContent>
          <button
            type="button"
            onClick={() => void handleAbort()}
            className="absolute right-4 top-4 cursor-pointer rounded-sm opacity-70 ring-offset-background transition-opacity duration-200 hover:opacity-100 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            aria-label="Close and cancel wallet creation"
          >
            <X className="size-4" />
          </button>

          <AlertDialogHeader>
            <AlertDialogTitle>{walletCopy.mnemonicTitle}</AlertDialogTitle>
            <AlertDialogDescription>{walletCopy.mnemonicHint}</AlertDialogDescription>
          </AlertDialogHeader>

          <div className="space-y-1">
            <button
              type="button"
              onDoubleClick={() => void copyMnemonic()}
              onKeyDown={(event) => {
                // Native buttons activate on both Enter and Space; mirror that
                // (Space would otherwise scroll the page).
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  void copyMnemonic();
                }
              }}
              className="w-full cursor-pointer rounded-lg border border-wallet-amber bg-wallet-amber/10 p-3 text-left font-mono text-sm leading-relaxed text-foreground select-all"
            >
              {mnemonic}
            </button>
            <p
              role="status"
              aria-live="polite"
              className={cn(
                "text-xs transition-colors duration-200",
                copied ? "text-wallet-incoming" : "text-muted-foreground",
              )}
            >
              {copied ? walletCopy.mnemonicCopied : walletCopy.mnemonicDoubleClickCopy}
            </p>
          </div>

          <label className="flex cursor-pointer items-start gap-3 text-sm text-foreground">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(event) => setAcknowledged(event.target.checked)}
              className="mt-1"
            />
            <span>{walletCopy.mnemonicLossWarning}</span>
          </label>

          <AlertDialogFooter>
            <AlertDialogAction
              disabled={!acknowledged || finalizing}
              onClick={() => void handleFinish()}
            >
              {finalizing ? "Saving…" : "OK"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
