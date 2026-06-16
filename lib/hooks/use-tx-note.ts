"use client";

import { queryKeys } from "@/lib/hooks/query-keys";
import { useMutation, useQuery, useQueryClient } from "@/lib/hooks/query-provider";
import { txNotes } from "@/lib/storage/tx-notes";

export interface UseTxNoteResult {
  /** Saved note for this hash; `""` while loading or when none exists. */
  note: string;
  isLoading: boolean;
  /** Persist a (raw) note. Resolves to the normalized stored value. */
  save: (raw: string) => Promise<string>;
  isSaving: boolean;
}

/**
 * Read/write the private local note for a transaction. Backed by IndexedDB via
 * {@link txNotes}; cached through React Query so the value is shared and never
 * goes stale (only this client mutates it). Pass `null` to disable (e.g. when no
 * transaction is selected).
 */
export function useTxNote(hash: string | null): UseTxNoteResult {
  const queryClient = useQueryClient();
  const enabled = Boolean(hash);
  const key = queryKeys.txNote(hash ?? "");

  const query = useQuery({
    queryKey: key,
    queryFn: () => txNotes.getNote(hash ?? ""),
    enabled,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const mutation = useMutation({
    mutationFn: (raw: string) => txNotes.setNote(hash ?? "", raw),
    onSuccess: (stored) => {
      queryClient.setQueryData(key, stored);
    },
  });

  return {
    note: query.data ?? "",
    isLoading: enabled && query.isPending,
    save: (raw: string) => {
      if (!hash) throw new Error("Cannot save a note without a transaction hash.");
      return mutation.mutateAsync(raw);
    },
    isSaving: mutation.isPending,
  };
}
