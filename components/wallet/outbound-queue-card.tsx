"use client";

import { Loader2, RotateCw, TriangleAlert } from "lucide-react";
import { useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  useCancelQueuedTransaction,
  useQueuedTransactions,
  useSubmitHungIntent,
} from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { takeDropToast } from "@/lib/services/real-sdk/send-intent";
import type { QueuedTransaction } from "@/lib/types";
import { queueCopy } from "@/lib/ui/queue-copy";
import { toast } from "@/lib/ui/toast";
import { cn } from "@/lib/utils";

/**
 * Session send-intent surface: lists auto-retrying (or hung) payments from this unlock,
 * not parked signed hex. Renders nothing when the queue is empty. Cancel drops the intent
 * so it is not rebuilt.
 */
function hungOpen(entry: QueuedTransaction): boolean {
  return entry.kind === "hung" && entry.state !== "sent" && !entry.sent;
}

export function OutboundQueueCard() {
  const { t } = useI18n();
  const { data: entries } = useQueuedTransactions();
  const cancel = useCancelQueuedTransaction();
  const submit = useSubmitHungIntent();

  useEffect(() => {
    if (entries === undefined) return;
    const message = takeDropToast();
    if (message) toast.error(message);
  }, [entries]);

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
                  {entry.label || `${(entry.hash ?? entry.id).slice(0, 10)}…`}
                </p>
                {hungOpen(entry) ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{queueCopy.hungBody}</p>
                ) : entry.state === "failed" && entry.lastError ? (
                  <p className="mt-0.5 truncate text-xs text-destructive">{entry.lastError}</p>
                ) : entry.hash ? (
                  <p className="mt-0.5 text-xs text-muted-foreground">{`${entry.hash.slice(0, 16)}…`}</p>
                ) : null}
              </div>
              {hungOpen(entry) ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={submit.isPending}
                  onClick={() => submit.mutate(entry.id)}
                >
                  {queueCopy.submit}
                </Button>
              ) : null}
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
  if (entry.state === "broadcast" || entry.state === "sent" || entry.sent) {
    return (
      <Badge variant="outline" className="shrink-0 gap-1 text-wallet-incoming">
        {t("queue.stateBroadcast")}
      </Badge>
    );
  }
  const retrying = entry.kind === "auto" && entry.state === "pending";
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
      {t(retrying ? "queue.stateRetrying" : "queue.statePending")}
    </Badge>
  );
}
