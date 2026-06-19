"use client";

import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeleteWallet, useRenameWallet, useWallets } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { WalletSummary } from "@/lib/types";
import { truncateAddress } from "@/lib/utils";

/**
 * Settings management for the wallets stored on this device (#95): rename inline
 * and delete (with a confirm). Switching lives in the sidebar switcher; the active
 * wallet can't be deleted here (delete the open wallet via "Delete wallet" so the
 * session is torn down correctly).
 */
export function WalletsSetting() {
  const { t } = useI18n();
  const { data: wallets, isLoading } = useWallets();
  const renameWallet = useRenameWallet();
  const deleteWallet = useDeleteWallet();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");

  const list = wallets ?? [];

  function startRename(wallet: WalletSummary) {
    setEditingId(wallet.id);
    setEditLabel(wallet.label);
  }

  function saveRename() {
    if (!editingId) return;
    const label = editLabel.trim();
    if (!label) {
      toast.error(t("wallets.nameLabel"));
      return;
    }
    renameWallet.mutate(
      { id: editingId, label },
      {
        onSuccess: () => {
          toast.success(t("wallets.renamed"));
          setEditingId(null);
        },
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : "Rename failed."),
      },
    );
  }

  function remove(wallet: WalletSummary) {
    deleteWallet.mutate(wallet.id, {
      onSuccess: () => toast.success(t("wallets.deleted")),
      onError: (error: unknown) =>
        toast.error(error instanceof Error ? error.message : "Delete failed."),
    });
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">…</p>;
  }

  return (
    <ul className="flex w-full flex-col gap-1.5">
      {list.map((wallet) => (
        <li
          key={wallet.id}
          className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
        >
          {editingId === wallet.id ? (
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
                aria-label={t("wallets.nameLabel")}
                autoFocus
                className="h-9"
              />
              <Button type="submit" variant="ghost" size="sm" disabled={renameWallet.isPending}>
                {t("wallets.save")}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setEditingId(null)}>
                {t("wallets.cancel")}
              </Button>
            </form>
          ) : (
            <>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-foreground">
                  {wallet.label}
                  {wallet.isActive ? (
                    <span className="ml-2 text-xs font-normal text-primary">
                      · {t("wallets.active")}
                    </span>
                  ) : null}
                </p>
                {wallet.address ? (
                  <p className="truncate font-mono text-xs text-muted-foreground">
                    {truncateAddress(wallet.address, 10, 6)}
                  </p>
                ) : null}
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => startRename(wallet)}
                  aria-label={`${t("wallets.rename")} ${wallet.label}`}
                >
                  {t("wallets.rename")}
                </Button>
                {!wallet.isActive ? (
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        aria-label={`${t("wallets.delete")} ${wallet.label}`}
                      >
                        {t("wallets.delete")}
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>{t("wallets.deleteTitle")}</AlertDialogTitle>
                        <AlertDialogDescription>
                          {t("wallets.deleteConfirm", { name: wallet.label })}
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>{t("wallets.cancel")}</AlertDialogCancel>
                        <AlertDialogAction
                          className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          onClick={() => remove(wallet)}
                        >
                          {t("wallets.deleteAction")}
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                ) : null}
              </div>
            </>
          )}
        </li>
      ))}
    </ul>
  );
}
