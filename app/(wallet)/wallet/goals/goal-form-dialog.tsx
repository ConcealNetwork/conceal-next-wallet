"use client";

import { useEffect, useMemo, useState } from "react";
import { GOAL_COLOR_TEXT, GOAL_ICON_COMPONENT } from "@/app/(wallet)/wallet/goals/goal-color";
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
  DEFAULT_GOAL_COLOR,
  DEFAULT_GOAL_ICON,
  GOAL_COLORS,
  GOAL_ICONS,
  type Goal,
  type GoalColor,
  type GoalIcon,
  parseCcxToAtomic,
} from "@/lib/goals/goal";
import type { NewGoalInput } from "@/lib/goals/mutations";
import { buildGoal } from "@/lib/goals/mutations";
import { atomicToCcx, computeGoal } from "@/lib/goals/progress";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { cn } from "@/lib/utils";

interface GoalFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode. */
  goal?: Goal | null;
  onSubmit: (input: NewGoalInput) => Promise<boolean>;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function GoalFormDialog({ open, onOpenChange, goal, onSubmit }: GoalFormDialogProps) {
  const { t } = useI18n();
  const { formatCcx } = useFormatters();
  const editing = Boolean(goal);

  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [icon, setIcon] = useState<GoalIcon>(DEFAULT_GOAL_ICON);
  const [color, setColor] = useState<GoalColor>(DEFAULT_GOAL_COLOR);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Seed from the goal each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(goal?.name ?? "");
    setTarget(goal ? String(Number(BigInt(goal.target)) / 1e6) : "");
    setDeadline(goal?.deadline ?? "");
    setIcon(goal?.icon ?? DEFAULT_GOAL_ICON);
    setColor(goal?.color ?? DEFAULT_GOAL_COLOR);
    setError(null);
  }, [open, goal]);

  const preview = useMemo(() => {
    const atomic = parseCcxToAtomic(target);
    if (!atomic) return null;
    const targetText = formatCcx(atomicToCcx(atomic), 0, true);
    if (!deadline) return t("goals.previewNoDeadline", { target: targetText });
    const temp = buildGoal({ name: name || "x", target, deadline }, new Date(), "preview");
    const pace = temp ? computeGoal(temp).pace : null;
    if (!pace) return t("goals.previewNoDeadline", { target: targetText });
    return t("goals.previewWithDeadline", {
      target: targetText,
      rate: formatCcx(atomicToCcx(pace.requiredPerWeek), 0, true),
    });
  }, [target, deadline, name, formatCcx, t]);

  const handleSubmit = async () => {
    setError(null);
    if (!parseCcxToAtomic(target)) {
      setError(t("goals.errTarget"));
      return;
    }
    if (!name.trim()) {
      setError(t("goals.errName"));
      return;
    }
    if (deadline && deadline < todayIso()) {
      setError(t("goals.errDeadlinePast"));
      return;
    }
    setBusy(true);
    const ok = await onSubmit({ name, target, deadline: deadline || undefined, icon, color });
    setBusy(false);
    if (ok) onOpenChange(false);
    else setError(t("goals.errInvalid"));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? t("goals.editTitle") : t("goals.createTitle")}</DialogTitle>
          <DialogDescription>{t("goals.formSubtitle")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="goal-name">{t("goals.fieldName")}</Label>
            <Input
              id="goal-name"
              value={name}
              maxLength={60}
              onChange={(e) => setName(e.target.value)}
              placeholder={t("goals.fieldNamePlaceholder")}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="goal-target">{t("goals.fieldTarget")}</Label>
              <Input
                id="goal-target"
                value={target}
                inputMode="decimal"
                onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
                placeholder={t("goals.fieldTargetPlaceholder")}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-deadline">{t("goals.fieldDeadline")}</Label>
              <Input
                id="goal-deadline"
                type="date"
                value={deadline}
                min={todayIso()}
                onChange={(e) => setDeadline(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("goals.fieldIcon")}</Label>
            <div className="flex flex-wrap gap-2">
              {GOAL_ICONS.map((key) => {
                const Ico = GOAL_ICON_COMPONENT[key];
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setIcon(key)}
                    aria-label={key}
                    aria-pressed={icon === key}
                    className={cn(
                      "grid size-9 place-items-center rounded-lg border transition",
                      icon === key
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border text-muted-foreground hover:border-ring",
                    )}
                  >
                    <Ico className="size-4" />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t("goals.fieldColor")}</Label>
            <div className="flex flex-wrap gap-2">
              {GOAL_COLORS.map((key) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setColor(key)}
                  aria-label={key}
                  aria-pressed={color === key}
                  className={cn(
                    "grid size-8 place-items-center rounded-full border-2 transition",
                    color === key ? "border-foreground" : "border-transparent",
                  )}
                >
                  <span className={cn("size-5 rounded-full bg-current", GOAL_COLOR_TEXT[key])} />
                </button>
              ))}
            </div>
          </div>

          {preview ? (
            <p className="rounded-lg bg-secondary/60 px-3 py-2 text-xs text-muted-foreground">
              {preview}
            </p>
          ) : null}
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
            {editing ? t("goals.save") : t("goals.create")}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
