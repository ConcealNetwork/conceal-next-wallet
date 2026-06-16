"use client";

import { useState } from "react";
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
import { Label } from "@/components/ui/label";

const CONFIRM_WORD = "ERASE";

/**
 * Panic-wipe confirm dialog. Because the action is irreversible and sits next to
 * the (similar-looking) Delete-wallet control, it requires the user to type
 * "ERASE" before the destructive button enables — a misdirected click can't
 * trigger an all-data wipe.
 */
export function PanicWipeDialog({ isMock, onConfirm }: { isMock: boolean; onConfirm: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const confirmed = confirmText.trim().toUpperCase() === CONFIRM_WORD;

  function handleOpenChange(next: boolean) {
    setOpen(next);
    if (!next) setConfirmText("");
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="destructive">
          Erase everything
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Erase all local data?</AlertDialogTitle>
          <AlertDialogDescription>
            {isMock
              ? "This clears the mock wallet session plus all local settings and transaction notes, returning you to the open wallet screen."
              : "This permanently erases the encrypted wallet, all settings, your custom node, and every local transaction note from this browser. Make sure your recovery phrase is backed up — this cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="panic-confirm">
            Type <span className="font-mono font-semibold">{CONFIRM_WORD}</span> to confirm
          </Label>
          <Input
            id="panic-confirm"
            value={confirmText}
            onChange={(event) => setConfirmText(event.target.value)}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            aria-label={`Type ${CONFIRM_WORD} to confirm`}
          />
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={!confirmed}
            onClick={(event) => {
              if (!confirmed) {
                event.preventDefault();
                return;
              }
              onConfirm();
            }}
          >
            Erase everything
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
