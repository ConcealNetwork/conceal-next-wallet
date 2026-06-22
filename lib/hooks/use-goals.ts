"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getActiveWalletId } from "@/lib/auth/active-wallet-id";
import type { Goal } from "@/lib/goals/goal";
import {
  addContribution,
  archiveGoal,
  buildContribution,
  buildGoal,
  editContribution,
  editGoal,
  type NewContributionInput,
  type NewGoalInput,
  removeContribution,
  restoreGoal,
} from "@/lib/goals/mutations";
import { goalsStore } from "@/lib/storage/goals-store";

// Every mounted useGoals (the page + the rail are separate instances) refreshes
// from the store after any mutation — they don't share React state otherwise, so
// the rail would show stale data until reload.
const changeListeners = new Set<() => void>();
function notifyGoalsChanged() {
  for (const listener of changeListeners) listener();
}

export interface UseGoals {
  goals: Goal[];
  /** True until the wallet id is resolved and the first read completes. */
  loading: boolean;
  /** Storage/id error — when set, the UI shows a storage-unavailable state and writes are blocked. */
  error: string | null;
  ready: boolean;
  reload: () => Promise<void>;
  /** Returns the created goal, or null when name/target are invalid. */
  createGoal: (input: NewGoalInput) => Promise<Goal | null>;
  /** Returns false when the patch is invalid (bad name/target). */
  updateGoal: (id: string, input: Partial<NewGoalInput>) => Promise<boolean>;
  removeGoal: (id: string) => Promise<void>;
  archive: (id: string) => Promise<void>;
  restore: (id: string) => Promise<void>;
  /** Returns false when the amount is invalid. */
  logContribution: (goalId: string, input: NewContributionInput) => Promise<boolean>;
  updateContribution: (
    goalId: string,
    contributionId: string,
    input: NewContributionInput,
  ) => Promise<boolean>;
  deleteContribution: (goalId: string, contributionId: string) => Promise<void>;
}

export function useGoals(): UseGoals {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const walletId = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const id = await getActiveWalletId();
      walletId.current = id;
      setGoals(await goalsStore.list(id));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Goals storage is unavailable.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    changeListeners.add(load);
    return () => {
      changeListeners.delete(load);
    };
  }, [load]);

  // Resolve the find-by-id-from-current-state goal (avoids a stale-closure read).
  const withGoal = useCallback(
    async (id: string, mutate: (goal: Goal) => Goal | null): Promise<boolean> => {
      const wid = walletId.current;
      if (!wid) return false;
      const current = await goalsStore.list(wid);
      const goal = current.find((g) => g.id === id);
      if (!goal) return false;
      const next = mutate(goal);
      if (!next) return false;
      await goalsStore.save(wid, next);
      notifyGoalsChanged();
      return true;
    },
    [],
  );

  const createGoal = useCallback<UseGoals["createGoal"]>(async (input) => {
    const wid = walletId.current;
    if (!wid) return null;
    const goal = buildGoal(input);
    if (!goal) return null;
    await goalsStore.save(wid, goal);
    notifyGoalsChanged();
    return goal;
  }, []);

  const updateGoal = useCallback<UseGoals["updateGoal"]>(
    (id, input) => withGoal(id, (g) => editGoal(g, input)),
    [withGoal],
  );

  const removeGoal = useCallback<UseGoals["removeGoal"]>(async (id) => {
    const wid = walletId.current;
    if (!wid) return;
    await goalsStore.remove(wid, id);
    notifyGoalsChanged();
  }, []);

  const archive = useCallback<UseGoals["archive"]>(
    async (id) => {
      await withGoal(id, (g) => archiveGoal(g));
    },
    [withGoal],
  );

  const restore = useCallback<UseGoals["restore"]>(
    async (id) => {
      await withGoal(id, (g) => restoreGoal(g));
    },
    [withGoal],
  );

  const logContribution = useCallback<UseGoals["logContribution"]>(
    (goalId, input) =>
      withGoal(goalId, (g) => {
        const c = buildContribution(input);
        return c ? addContribution(g, c) : null;
      }),
    [withGoal],
  );

  const updateContribution = useCallback<UseGoals["updateContribution"]>(
    (goalId, contributionId, input) =>
      withGoal(goalId, (g) => editContribution(g, contributionId, input)),
    [withGoal],
  );

  const deleteContribution = useCallback<UseGoals["deleteContribution"]>(
    async (goalId, contributionId) => {
      await withGoal(goalId, (g) => removeContribution(g, contributionId));
    },
    [withGoal],
  );

  return {
    goals,
    loading,
    error,
    ready: walletId.current !== null && error === null,
    reload: load,
    createGoal,
    updateGoal,
    removeGoal,
    archive,
    restore,
    logContribution,
    updateContribution,
    deleteContribution,
  };
}
