"use client";

import { Plus } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { GoalCard } from "@/app/(wallet)/wallet/goals/goal-card";
import { GoalFormDialog } from "@/app/(wallet)/wallet/goals/goal-form-dialog";
import { LogContributionDialog } from "@/app/(wallet)/wallet/goals/log-contribution-dialog";
import { GoalsRail } from "@/components/layout/rails/goals-rail";
import { usePageRightRail } from "@/components/layout/right-rail";
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
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, PageHeader } from "@/components/wallet/common";
import type { Goal, GoalContribution } from "@/lib/goals/goal";
import { computeGoal, type GoalComputation } from "@/lib/goals/progress";
import { useMarketData } from "@/lib/hooks";
import { useCreateDeepLink } from "@/lib/hooks/use-create-deeplink";
import { useGoals } from "@/lib/hooks/use-goals";
import { useI18n } from "@/lib/i18n/i18n-provider";

export default function GoalsPage() {
  const { t } = useI18n();
  const goalsApi = useGoals();
  const { goals, loading, error } = goalsApi;
  const usdPrice = useMarketData().data?.price?.value;

  const [formOpen, setFormOpen] = useState(false);
  const [formGoal, setFormGoal] = useState<Goal | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logGoal, setLogGoal] = useState<Goal | null>(null);
  const [logContribution, setLogContribution] = useState<GoalContribution | null>(null);
  const [deleteGoal, setDeleteGoal] = useState<Goal | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const openCreate = useCallback(() => {
    setFormGoal(null);
    setFormOpen(true);
  }, []);
  useCreateDeepLink(openCreate);

  usePageRightRail(<GoalsRail />);

  const { active, archived, computations } = useMemo(() => {
    const map = new Map<string, GoalComputation>();
    for (const g of goals) map.set(g.id, computeGoal(g));
    const act = goals.filter((g) => g.status !== "archived");
    const arc = goals.filter((g) => g.status === "archived");
    act.sort((a, b) => {
      // nearest deadline first, then highest progress
      if (a.deadline && b.deadline) return a.deadline < b.deadline ? -1 : 1;
      if (a.deadline) return -1;
      if (b.deadline) return 1;
      return (map.get(b.id)?.visualPct ?? 0) - (map.get(a.id)?.visualPct ?? 0);
    });
    return { active: act, archived: arc, computations: map };
  }, [goals]);

  const openLog = (goal: Goal, contribution?: GoalContribution) => {
    setLogGoal(goal);
    setLogContribution(contribution ?? null);
    setLogOpen(true);
  };
  const openEdit = (goal: Goal) => {
    setFormGoal(goal);
    setFormOpen(true);
  };

  const renderCard = (goal: Goal) => {
    const computation = computations.get(goal.id);
    if (!computation) return null;
    return (
      <GoalCard
        key={goal.id}
        goal={goal}
        computation={computation}
        usdPrice={usdPrice}
        onAdd={(g) => openLog(g)}
        onEdit={openEdit}
        onArchive={(g) => void goalsApi.archive(g.id)}
        onRestore={(g) => void goalsApi.restore(g.id)}
        onDelete={(g) => setDeleteGoal(g)}
        onEditContribution={(g, c) => openLog(g, c)}
        onDeleteContribution={(g, c) => void goalsApi.deleteContribution(g.id, c.id)}
      />
    );
  };

  return (
    <>
      <PageHeader
        title={t("goals.title")}
        subtitle={t("goals.subtitle")}
        action={
          <Button type="button" onClick={openCreate} className="gap-2">
            <Plus className="size-4" aria-hidden="true" />
            {t("goals.newGoal")}
          </Button>
        }
      />

      {error ? (
        <div className="rounded-xl border border-dashed border-border bg-secondary/60 p-6 text-sm text-muted-foreground">
          {t("goals.storageUnavailable")}
        </div>
      ) : loading ? (
        <div className="grid gap-4 @3xl:grid-cols-2 @5xl:grid-cols-3">
          {["a", "b", "c"].map((k) => (
            <Skeleton key={k} className="h-52 rounded-xl" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <div className="space-y-4">
          <EmptyState title={t("goals.emptyTitle")} description={t("goals.emptyBody")} />
          <div className="flex justify-center">
            <Button type="button" onClick={openCreate} className="gap-2">
              <Plus className="size-4" aria-hidden="true" />
              {t("goals.emptyCreate")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <section>
            <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground">
              {t("goals.activeHeading")}
            </h2>
            <div className="grid gap-4 @3xl:grid-cols-2 @5xl:grid-cols-3">
              {active.map(renderCard)}
            </div>
          </section>
          {archived.length > 0 ? (
            <section>
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                className="mb-4 text-sm font-medium uppercase tracking-wide text-muted-foreground transition hover:text-foreground"
                aria-expanded={showArchived}
              >
                {t("goals.archivedHeading")} ({archived.length})
              </button>
              {showArchived ? (
                <div className="grid gap-4 @3xl:grid-cols-2 @5xl:grid-cols-3">
                  {archived.map(renderCard)}
                </div>
              ) : null}
            </section>
          ) : null}
        </div>
      )}

      <div className="mt-8 min-[1200px]:hidden">
        <GoalsRail embedded />
      </div>

      <GoalFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        goal={formGoal}
        onSubmit={async (input) => {
          if (formGoal) return goalsApi.updateGoal(formGoal.id, input);
          return (await goalsApi.createGoal(input)) !== null;
        }}
      />

      {logGoal ? (
        <LogContributionDialog
          open={logOpen}
          onOpenChange={setLogOpen}
          goalName={logGoal.name}
          contribution={logContribution}
          onSubmit={(input) =>
            logContribution
              ? goalsApi.updateContribution(logGoal.id, logContribution.id, input)
              : goalsApi.logContribution(logGoal.id, input)
          }
        />
      ) : null}

      <AlertDialog open={deleteGoal !== null} onOpenChange={(o) => !o && setDeleteGoal(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("goals.deleteTitle")}</AlertDialogTitle>
            {/* English consequence copy (per i18n policy). */}
            <AlertDialogDescription>
              This removes the goal and everything you&apos;ve logged for it. No CCX is affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("goals.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteGoal) void goalsApi.removeGoal(deleteGoal.id);
                setDeleteGoal(null);
              }}
            >
              {t("goals.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
