"use client";

import { Heart } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, SectionCard } from "@/components/wallet/common";
import { useAddressBook, useMessages, useSendMessage, useWalletViewOnly } from "@/lib/hooks";
import { useWalletSynced } from "@/lib/hooks/use-check-ins";
import { focusCreateField, useCreateDeepLink } from "@/lib/hooks/use-create-deeplink";
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  listWatchers,
  removeWatcher,
  saveWatcher,
  updateWatcher,
} from "@/lib/storage/check-ins-store";
import { formatCheckIn } from "@/lib/ui/check-in-message";
import {
  type CheckInStatus,
  checkInStatus,
  daysSince,
  hasFreshCheckIn,
  lastReceivedForWatcher,
  type WatchedContact,
} from "@/lib/ui/check-ins";
import { toast } from "@/lib/ui/toast";
import { cn } from "@/lib/utils";

const STATUS_META: Record<CheckInStatus, { labelKey: string; dot: string; text: string }> = {
  ok: { labelKey: "checkIns.statusOk", dot: "bg-wallet-incoming", text: "text-muted-foreground" },
  "due-soon": {
    labelKey: "checkIns.statusDueSoon",
    dot: "bg-wallet-amber",
    text: "text-wallet-amber",
  },
  overdue: {
    labelKey: "checkIns.statusOverdue",
    dot: "bg-wallet-outgoing",
    text: "text-wallet-outgoing",
  },
  waiting: {
    labelKey: "checkIns.statusWaiting",
    dot: "bg-muted-foreground",
    text: "text-muted-foreground",
  },
  paused: {
    labelKey: "checkIns.statusPaused",
    dot: "bg-muted-foreground/50",
    text: "text-muted-foreground",
  },
};

const SNOOZE_DAYS = 7;

export default function CheckInsPage() {
  const { t } = useI18n();
  const addressBook = useAddressBook();
  const messages = useMessages();
  const synced = useWalletSynced();
  const viewOnly = useWalletViewOnly();
  const sendMessage = useSendMessage();
  const [watchers, setWatchers] = useState<WatchedContact[]>(() => listWatchers());
  const [contactId, setContactId] = useState("");
  const [interval, setInterval] = useState("14");
  const [grace, setGrace] = useState("7");
  // The sidebar "+" quick-create deep-links here with ?new=1 — scroll to + focus the add form.
  useCreateDeepLink(() => focusCreateField("ci-contact"));
  // Fresh each render (not memoized) so statuses stay accurate if the page is
  // left open. Cheap — a handful of watchers over an in-memory message list.
  const nowISO = new Date().toISOString();

  const contacts = addressBook.data ?? [];
  const canAdd = contactId !== "" && Number(interval) > 0 && Number(grace) >= 0;

  function add() {
    // The address comes from a saved address-book entry — no re-validation needed;
    // it's only used to match incoming messages.
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) {
      return toast.error(t("checkIns.errPickContact"));
    }
    const intervalDays = Number(interval);
    const graceDays = Number(grace);
    if (!(intervalDays > 0)) return toast.error(t("checkIns.errIntervalMin"));
    if (!(graceDays >= 0)) return toast.error(t("checkIns.errGraceNegative"));
    if (watchers.some((w) => w.address === contact.address)) {
      return toast.error(t("checkIns.errAlreadyWatching"));
    }
    try {
      setWatchers(
        saveWatcher({
          id: crypto.randomUUID(),
          address: contact.address,
          label: contact.label,
          intervalDays,
          graceDays,
          paymentId: contact.paymentId,
        }),
      );
      setContactId("");
      toast.success(t("checkIns.watching", { label: contact.label }));
    } catch {
      toast.error(t("checkIns.errSaveFailed"));
    }
  }

  function patch(id: string, p: Partial<WatchedContact>, msg?: string) {
    try {
      setWatchers(updateWatcher(id, p));
      if (msg) toast.success(msg);
    } catch {
      toast.error(t("checkIns.errUpdateFailed"));
    }
  }

  function sendCheckIn(w: WatchedContact) {
    if (viewOnly || sendMessage.isPending) return;
    sendMessage.mutate(
      { recipientAddress: w.address, body: formatCheckIn("alive"), paymentId: w.paymentId },
      {
        onSuccess: () => toast.success(t("checkIns.sentTo", { label: w.label })),
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : t("checkIns.errSendFailed")),
      },
    );
  }

  const msgs = messages.data ?? [];
  const evaluated = watchers.map((w) => {
    const lastHeard = lastReceivedForWatcher(msgs, w);
    return {
      w,
      lastHeard,
      status: checkInStatus(w, lastHeard, nowISO),
      checkedIn: synced && hasFreshCheckIn(w, msgs, nowISO),
    };
  });
  const overdue = synced ? evaluated.filter((e) => e.status === "overdue") : [];

  return (
    <>
      <PageHeader title={t("nav.checkIns")} subtitle={t("checkIns.subtitle")} />

      <div className="space-y-6">
        {overdue.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-wallet-outgoing/40 bg-wallet-outgoing/10 px-4 py-3 text-sm text-wallet-outgoing"
          >
            {t("checkIns.overdueAlert", {
              count: overdue.length,
              names: overdue.map((e) => e.w.label).join(", "),
            })}
          </div>
        )}

        <SectionCard title={t("checkIns.watchTitle")} description={t("checkIns.watchDescription")}>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="ci-contact">{t("checkIns.contactLabel")}</Label>
              <select
                id="ci-contact"
                className="h-10 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
              >
                <option value="">{t("checkIns.selectPlaceholder")}</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-interval">{t("checkIns.everyLabel")}</Label>
              <Input
                id="ci-interval"
                type="number"
                inputMode="numeric"
                min="1"
                step="1"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-grace">{t("checkIns.graceLabel")}</Label>
              <Input
                id="ci-grace"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
              />
            </div>
            <Button type="button" onClick={add} disabled={!canAdd}>
              {t("checkIns.watch")}
            </Button>
          </div>
          {contacts.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">{t("checkIns.emptyContacts")}</p>
          )}
        </SectionCard>

        <SectionCard
          title={t("checkIns.watchingTitle")}
          description={t("checkIns.watchingDescription")}
        >
          {!synced && watchers.length > 0 && (
            <p className="mb-3 text-sm text-muted-foreground">{t("checkIns.syncing")}</p>
          )}
          {watchers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("checkIns.notWatching")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {evaluated.map(({ w, lastHeard, status, checkedIn }) => {
                const meta = STATUS_META[status];
                const detail =
                  status === "waiting"
                    ? t("checkIns.detailWaiting", { interval: w.intervalDays })
                    : lastHeard
                      ? t("checkIns.detailLastHeard", {
                          days: daysSince(lastHeard, nowISO),
                          interval: w.intervalDays,
                        })
                      : t("checkIns.detailEvery", { interval: w.intervalDays });
                return (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      {checkedIn ? (
                        <Heart
                          className="size-3.5 shrink-0 fill-wallet-incoming text-wallet-incoming"
                          aria-hidden="true"
                        />
                      ) : (
                        <span
                          className={cn("size-2.5 shrink-0 rounded-full", meta.dot)}
                          aria-hidden="true"
                        />
                      )}
                      <div className="min-w-0">
                        <span className="font-semibold">{w.label}</span>
                        <p className={cn("text-sm", meta.text)}>
                          {checkedIn ? (
                            <span className="sr-only">{t("checkIns.checkedInSr")}</span>
                          ) : null}
                          {t(meta.labelKey)} · {detail}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={viewOnly || sendMessage.isPending}
                        title={t("checkIns.sendCheckInTitle")}
                        onClick={() => sendCheckIn(w)}
                      >
                        {t("checkIns.sendCheckIn")}
                      </Button>
                      {w.paused ||
                      (w.snoozedUntil && new Date(nowISO) < new Date(w.snoozedUntil)) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            patch(
                              w.id,
                              { paused: false, snoozedUntil: undefined },
                              t("checkIns.resumed", { label: w.label }),
                            )
                          }
                        >
                          {t("checkIns.resume")}
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              patch(
                                w.id,
                                {
                                  snoozedUntil: new Date(
                                    Date.now() + SNOOZE_DAYS * 86_400_000,
                                  ).toISOString(),
                                },
                                t("checkIns.snoozed", { label: w.label, days: SNOOZE_DAYS }),
                              )
                            }
                          >
                            {t("checkIns.snooze")}
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() =>
                              patch(
                                w.id,
                                { paused: true },
                                t("checkIns.paused", { label: w.label }),
                              )
                            }
                          >
                            {t("checkIns.pause")}
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t("checkIns.stopWatching", { label: w.label })}
                        onClick={() => {
                          try {
                            setWatchers(removeWatcher(w.id));
                          } catch {
                            toast.error(t("checkIns.errUpdateFailed"));
                          }
                        }}
                      >
                        {t("checkIns.remove")}
                      </Button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
