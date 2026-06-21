"use client";

import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCancelQueuedTransaction, useQueuedTransactions } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { QueuedTransaction } from "@/lib/types";
import { toast } from "@/lib/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Durable outbound-queue surface (#92): lists built+signed transactions awaiting (or
 * failed) broadcast, so a send stuck behind a dropped connection is visible and the user
 * can cancel a still-queued one (or dismiss a failed entry). Renders nothing when the queue
 * is empty. A `pending`/`broadcast` entry that mines is pruned by the sync drainer, so it
 * disappears on its own — only genuinely-stuck/failed entries linger here.
 */
export function OutboundQueueCard() {
  const { t } = useI18n();
  const { data: entries } = useQueuedTransactions();
  const cancel = useCancelQueuedTransaction();

  if (!entries || entries.length === 0) return null;

  function handleCancel(entry: QueuedTransaction) {
    cancel.mutate(entry.id, {
      onSuccess: () => toast.success(t("queue.toastRemoved")),
      onError: () => toast.error(t("queue.toastRemoveError")),
    });
  }

  return (
    <Card className="wallet-card">
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-semibold text-foreground">{t("queue.title")}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{t("queue.description")}</p>
        </div>
        <ul className="space-y-2.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-center gap-3 rounded-xl border border-border/70 px-4 py-3"
            >
              <QueueStateBadge entry={entry} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] font-medium text-foreground">
                  {entry.label || `${entry.hash.slice(0, 10)}…`}
                </p>
                {entry.state === "failed" && entry.lastError ? (
                  <p className="mt-0.5 truncate text-xs text-destructive">{entry.lastError}</p>
                ) : (
                  <p className="mt-0.5 text-xs text-muted-foreground">{entry.hash.slice(0, 16)}…</p>
                )}
              </div>
              {/* A "broadcast" entry is live on the network — it can't be cancelled (that
                  would free its inputs while the tx can still mine), so offer no control. */}
              {entry.state !== "broadcast" ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={cancel.isPending}
                  onClick={() => handleCancel(entry)}
                >
                  {entry.state === "failed" ? t("queue.dismiss") : t("queue.cancel")}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function QueueStateBadge({ entry }: { entry: QueuedTransaction }) {
  const { t } = useI18n();
  if (entry.state === "failed") {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 border-destructive/40 text-destructive">
        <TriangleAlert className="size-3" aria-hidden="true" />
        {t("queue.stateFailed")}
      </Badge>
    );
  }
  if (entry.state === "broadcast") {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 text-wallet-incoming">
        {t("queue.stateBroadcast")}
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="shrink-0 gap-1 text-muted-foreground">
      {entry.attempts > 0 ? (
        <RotateCw
          className={cn("size-3", "animate-spin motion-reduce:animate-none")}
          aria-hidden="true"
        />
      ) : (
        <Loader2 className="size-3 animate-spin motion-reduce:animate-none" aria-hidden="true" />
      )}
      {t("queue.statePending")}
    </Badge>
  );
}
