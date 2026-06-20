"use client";

import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import type { GoalContribution } from "@/lib/goals/goal";
import { parseCcxToAtomic } from "@/lib/goals/goal";
import type { NewContributionInput } from "@/lib/goals/mutations";
import { useI18n } from "@/lib/i18n/i18n-provider";

interface LogContributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goalName: string;
  /** Present → edit mode. */
  contribution?: GoalContribution | null;
  onSubmit: (input: NewContributionInput) => Promise<boolean>;
}

export function LogContributionDialog({
  open,
  onOpenChange,
  goalName,
  contribution,
  onSubmit,
}: LogContributionDialogProps) {
  const { t } = useI18n();
  const editing = Boolean(contribution);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAmount(contribution ? String(Number(BigInt(contribution.amount)) / 1e6) : "");
    setDate((contribution?.at ?? new Date().toISOString()).slice(0, 10));
    setNote(contribution?.note ?? "");
    setError(null);
  }, [open, contribution]);

  const handleSubmit = async () => {
    setError(null);
    if (!parseCcxToAtomic(amount)) {
      setError(t("goals.errAmount"));
      return;
    }
    setBusy(true);
    const at = date ? new Date(`${date}T12:00:00Z`).toISOString() : undefined;
    const ok = await onSubmit({ amount, note: note || undefined, at });
    setBusy(false);
    if (ok) onOpenChange(false);
    else setError(t("goals.errAmount"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t("goals.editContribution") : t("goals.logTitle")}</DialogTitle>
          <DialogDescription>{t("goals.logSubtitle", { goal: goalName })}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="contrib-amount">{t("goals.logAmount")}</Label>
            <Input
              id="contrib-amount"
              value={amount}
              inputMode="decimal"
              autoFocus
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))}
              placeholder={t("goals.fieldTargetPlaceholder")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrib-date">{t("goals.logDate")}</Label>
            <Input
              id="contrib-date"
              type="date"
              value={date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="contrib-note">{t("goals.logNote")}</Label>
            <Textarea
              id="contrib-note"
              value={note}
              maxLength={120}
              rows={2}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
          {/* English, consequence-adjacent clarity (kept English per i18n policy). */}
          <p className="text-xs text-muted-foreground">
            This records money you&apos;ve set aside — it doesn&apos;t move any CCX.
          </p>
          {error ? <p className="text-sm text-wallet-outgoing">{error}</p> : null}
        </div>

        <DialogFooter>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="inline-flex min-h-10 items-center rounded-lg px-4 text-sm font-medium text-muted-foreground transition hover:text-foreground"
          >
            {t("goals.cancel")}
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={busy}
            className="inline-flex min-h-10 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
          >
            {editing ? t("goals.save") : t("goals.logSave")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
