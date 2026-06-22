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
} from "@/components/ui/alert-dialog";
import { Switch } from "@/components/ui/switch";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { ScheduledPayment } from "@/lib/ui/scheduled-payments";

/**
 * Per-schedule auto-send arm/disarm switch (#92 phase 2). Arming opens a one-time CONSENT
 * dialog (real funds, no per-fire prompt) — confirmed once, it never prompts again.
 * Disarming is immediate. The consent copy is deliberately English (consequence copy, like
 * the send/panic-wipe confirmations); the neutral switch label is localized.
 */
export function AutoSendToggle({
  schedule,
  disabled = false,
  onArm,
  onDisarm,
}: {
  schedule: ScheduledPayment;
  disabled?: boolean;
  onArm: () => void;
  onDisarm: () => void;
}) {
  const { t } = useI18n();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const armed = schedule.autoSend === true;

  return (
    <>
      <label
        htmlFor={`auto-send-${schedule.id}`}
        className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
      >
        <span>{t("scheduled.autoSend")}</span>
        <Switch
          id={`auto-send-${schedule.id}`}
          checked={armed}
          disabled={disabled}
          aria-label={t("scheduled.autoSendAria", { label: schedule.label })}
          onCheckedChange={(on: boolean) => (on ? setConfirmOpen(true) : onDisarm())}
        />
      </label>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Arm auto-send?</AlertDialogTitle>
            <AlertDialogDescription>
              “{schedule.label}” will automatically send {schedule.amount} CCX to its saved address
              every time it’s due — with no confirmation each time. Real funds will leave your
              wallet. Auto-send only runs while this wallet is open and unlocked (your keys are
              never stored), so a payment due while the app is closed or locked waits until you next
              open it. You can disarm it any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmOpen(false);
                onArm();
              }}
            >
              Arm auto-send
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
