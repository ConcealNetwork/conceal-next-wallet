"use client";

import { useState } from "react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/wallet/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAddressBook, useMessages } from "@/lib/hooks";
import { useWalletSynced } from "@/lib/hooks/use-check-ins";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { listWatchers, removeWatcher, saveWatcher, updateWatcher } from "@/lib/storage/check-ins-store";
import {
  checkInStatus,
  type CheckInStatus,
  daysSince,
  lastReceivedFrom,
  type WatchedContact,
} from "@/lib/ui/check-ins";
import { cn } from "@/lib/utils";

const STATUS_META: Record<CheckInStatus, { label: string; dot: string; text: string }> = {
  ok: { label: "OK", dot: "bg-wallet-incoming", text: "text-muted-foreground" },
  "due-soon": { label: "Due soon", dot: "bg-wallet-amber", text: "text-wallet-amber" },
  overdue: { label: "Overdue", dot: "bg-wallet-outgoing", text: "text-wallet-outgoing" },
  waiting: { label: "Waiting", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  paused: { label: "Paused", dot: "bg-muted-foreground/50", text: "text-muted-foreground" },
};

const SNOOZE_DAYS = 7;

export default function CheckInsPage() {
  const { t } = useI18n();
  const addressBook = useAddressBook();
  const messages = useMessages();
  const synced = useWalletSynced();
  const [watchers, setWatchers] = useState<WatchedContact[]>(() => listWatchers());
  const [contactId, setContactId] = useState("");
  const [interval, setInterval] = useState("14");
  const [grace, setGrace] = useState("7");
  // Fresh each render (not memoized) so statuses stay accurate if the page is
  // left open. Cheap — a handful of watchers over an in-memory message list.
  const nowISO = new Date().toISOString();

  const contacts = addressBook.data ?? [];

  function add() {
    // The address comes from a saved address-book entry — no re-validation needed;
    // it's only used to match incoming messages.
    const contact = contacts.find((c) => c.id === contactId);
    if (!contact) {
      return toast.error("Pick a contact from your address book first.");
    }
    const intervalDays = Number(interval);
    const graceDays = Number(grace);
    if (!(intervalDays > 0)) return toast.error("Interval must be at least 1 day.");
    if (!(graceDays >= 0)) return toast.error("Grace days can't be negative.");
    if (watchers.some((w) => w.address === contact.address)) {
      return toast.error("You're already watching that contact.");
    }
    try {
      setWatchers(
        saveWatcher({
          id: crypto.randomUUID(),
          address: contact.address,
          label: contact.label,
          intervalDays,
          graceDays,
        }),
      );
      setContactId("");
      toast.success(`Watching ${contact.label} for check-ins.`);
    } catch {
      toast.error("Couldn't save — device storage may be unavailable.");
    }
  }

  function patch(id: string, p: Partial<WatchedContact>, msg?: string) {
    try {
      setWatchers(updateWatcher(id, p));
      if (msg) toast.success(msg);
    } catch {
      toast.error("Couldn't update — device storage may be unavailable.");
    }
  }

  const evaluated = watchers.map((w) => {
    const lastHeard = lastReceivedFrom(messages.data ?? [], w.address);
    return { w, lastHeard, status: checkInStatus(w, lastHeard, nowISO) };
  });
  const overdue = synced ? evaluated.filter((e) => e.status === "overdue") : [];

  return (
    <>
      <PageHeader title={t("nav.checkIns")} subtitle="Notice when someone you watch goes quiet" />

      <div className="space-y-6">
        {overdue.length > 0 && (
          <div
            role="alert"
            className="rounded-xl border border-wallet-outgoing/40 bg-wallet-outgoing/10 px-4 py-3 text-sm text-wallet-outgoing"
          >
            {overdue.length} overdue: {overdue.map((e) => e.w.label).join(", ")}. They may just be
            busy — consider reaching out.
          </div>
        )}

        <SectionCard
          title="Watch a contact"
          description="A reminder to reconnect — not proof of anything. People miss check-ins for ordinary reasons (lost wallet, no fees, travel). Alerts only appear while the wallet is open and synced."
        >
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="ci-contact">Contact</Label>
              <select
                id="ci-contact"
                className="h-10 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground"
                value={contactId}
                onChange={(e) => setContactId(e.target.value)}
              >
                <option value="">Select…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-interval">Every (days)</Label>
              <Input
                id="ci-interval"
                type="number"
                inputMode="numeric"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ci-grace">Grace (days)</Label>
              <Input
                id="ci-grace"
                type="number"
                inputMode="numeric"
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
              />
            </div>
            <Button type="button" onClick={add}>
              Watch
            </Button>
          </div>
          {contacts.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">
              Add someone to your address book first, then watch them here.
            </p>
          )}
        </SectionCard>

        <SectionCard title="Watching" description="People you expect to hear from">
          {!synced && watchers.length > 0 && (
            <p className="mb-3 text-sm text-muted-foreground">Syncing — statuses update once caught up.</p>
          )}
          {watchers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Not watching anyone yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {evaluated.map(({ w, lastHeard, status }) => {
                const meta = STATUS_META[status];
                const detail =
                  status === "waiting"
                    ? `No message seen yet · every ${w.intervalDays}d`
                    : lastHeard
                      ? `Last heard ${daysSince(lastHeard, nowISO)}d ago · every ${w.intervalDays}d`
                      : `Every ${w.intervalDays}d`;
                return (
                  <li key={w.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn("size-2.5 shrink-0 rounded-full", meta.dot)} aria-hidden="true" />
                      <div className="min-w-0">
                        <span className="font-semibold">{w.label}</span>
                        <p className={cn("text-sm", meta.text)}>
                          {meta.label} · {detail}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {w.paused || (w.snoozedUntil && new Date(nowISO) < new Date(w.snoozedUntil)) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            patch(w.id, { paused: false, snoozedUntil: undefined }, `Resumed ${w.label}.`)
                          }
                        >
                          Resume
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
                                { snoozedUntil: new Date(Date.now() + SNOOZE_DAYS * 86_400_000).toISOString() },
                                `Snoozed ${w.label} ${SNOOZE_DAYS} days.`,
                              )
                            }
                          >
                            Snooze
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => patch(w.id, { paused: true }, `Paused ${w.label}.`)}
                          >
                            Pause
                          </Button>
                        </>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={`Stop watching ${w.label}`}
                        onClick={() => {
                          try {
                            setWatchers(removeWatcher(w.id));
                          } catch {
                            toast.error("Couldn't update — device storage may be unavailable.");
                          }
                        }}
                      >
                        Remove
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
