"use client";

import { Heart, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader, SectionCard } from "@/components/wallet/common";
import { ContactAvatar } from "@/components/wallet/contact-avatar";
import { useAddressBook, useMessages, useSendMessage, useWalletViewOnly } from "@/lib/hooks";
import { useWalletSynced } from "@/lib/hooks/use-check-ins";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { buildPulseRows } from "@/lib/messages/pulse-rows";
import { hasRelationship } from "@/lib/messages/relationship";
import { defaultUntilDate, formatStatusPulse, type PulseKind } from "@/lib/messages/status-pulse";
import { dismissPulse, listDismissed } from "@/lib/storage/pulse-dismiss-store";
import type { AddressEntry } from "@/lib/types";
import { toast } from "@/lib/ui/toast";
import { cn } from "@/lib/utils";

const PULSE_KINDS: PulseKind[] = ["alive", "sos", "sick", "dnd"];

const KIND_LABEL: Record<PulseKind, string> = {
  alive: "pulse.statusAlive",
  sos: "pulse.statusSos",
  sick: "pulse.statusSick",
  dnd: "pulse.statusDnd",
};

function PulseDot({ kind, phase }: { kind: PulseKind; phase: "ok" | "grace" | "overdue" }) {
  if (phase === "ok" && kind === "alive") {
    return <Heart className="size-3.5 shrink-0 fill-wallet-incoming text-wallet-incoming" />;
  }
  const color =
    phase === "ok"
      ? kind === "sos"
        ? "bg-wallet-outgoing"
        : "bg-wallet-incoming"
      : phase === "grace"
        ? "bg-wallet-amber"
        : "bg-wallet-outgoing";
  return <span className={cn("size-2.5 shrink-0 rounded-full", color)} aria-hidden="true" />;
}

export default function PulsePage() {
  const { t } = useI18n();
  const addressBook = useAddressBook();
  const messages = useMessages();
  const synced = useWalletSynced();
  const viewOnly = useWalletViewOnly();
  const sendMessage = useSendMessage();

  const contacts = addressBook.data ?? [];
  const connected = contacts.filter(hasRelationship);

  const [sendContactId, setSendContactId] = useState("");
  const [kind, setKind] = useState<PulseKind>("alive");
  const [until, setUntil] = useState(() => defaultUntilDate(14));
  const [grace, setGrace] = useState("2");
  const [dismissed, setDismissed] = useState(() => listDismissed());

  const nowMs = Date.now();
  const msgs = messages.data ?? [];
  const received = useMemo(
    () => buildPulseRows(msgs, contacts, dismissed, nowMs),
    [msgs, contacts, dismissed, nowMs],
  );

  function broadcast() {
    if (viewOnly || sendMessage.isPending) return;
    const contact = contacts.find((c) => c.id === sendContactId);
    const paymentIdTo = contact?.paymentIdTo?.trim();
    if (!contact || !hasRelationship(contact) || !paymentIdTo) {
      return toast.error(t("checkIns.errNoOutboundPid"));
    }
    const graceDays = Number(grace);
    if (!(graceDays >= 0)) return toast.error(t("pulse.errGrace"));
    const body = formatStatusPulse(kind, until, graceDays);
    sendMessage.mutate(
      { recipientAddress: contact.address, body, paymentId: paymentIdTo },
      {
        onSuccess: () => toast.success(t("pulse.sentTo", { label: contact.label })),
        onError: (error: unknown) =>
          toast.error(error instanceof Error ? error.message : t("pulse.errSend")),
      },
    );
  }

  function removeRow(messageId: string) {
    setDismissed(dismissPulse(messageId));
  }

  const canSend = sendContactId !== "" && until !== "";

  return (
    <>
      <PageHeader title={t("nav.checkIns")} subtitle={t("pulse.subtitle")} />

      <div className="space-y-6">
        <SectionCard title={t("pulse.sendTitle")} description={t("pulse.sendDescription")}>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr_auto] sm:items-end">
            <div className="space-y-2">
              <Label htmlFor="pulse-contact">{t("pulse.contactLabel")}</Label>
              <select
                id="pulse-contact"
                className="h-10 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground"
                value={sendContactId}
                onChange={(e) => setSendContactId(e.target.value)}
              >
                <option value="">{t("checkIns.selectPlaceholder")}</option>
                {connected.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pulse-kind">{t("pulse.statusLabel")}</Label>
              <select
                id="pulse-kind"
                className="h-10 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground"
                value={kind}
                onChange={(e) => setKind(e.target.value as PulseKind)}
              >
                {PULSE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(KIND_LABEL[k])}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="pulse-until">{t("pulse.untilLabel")}</Label>
              <Input
                id="pulse-until"
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="pulse-grace">{t("pulse.flexLabel")}</Label>
              <Input
                id="pulse-grace"
                type="number"
                inputMode="numeric"
                min="0"
                step="1"
                value={grace}
                onChange={(e) => setGrace(e.target.value)}
              />
            </div>
            <Button type="button" onClick={broadcast} disabled={!canSend || viewOnly}>
              {t("pulse.broadcast")}
            </Button>
          </div>
          {connected.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {t("checkIns.noConnectedContacts")}
            </p>
          ) : null}
        </SectionCard>

        <SectionCard title={t("pulse.receivedTitle")}>
          {!synced && received.length > 0 ? (
            <p className="mb-3 text-sm text-muted-foreground">{t("pulse.syncing")}</p>
          ) : null}
          {received.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("pulse.noReceived")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {received.map((row) => (
                <li
                  key={row.messageId}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <PulseDot kind={row.pulse.kind} phase={row.phase} />
                    <ContactAvatar
                      entry={
                        {
                          id: row.contactId,
                          label: row.label,
                          address: "",
                          avatar: row.avatar,
                        } satisfies AddressEntry
                      }
                      className="size-8 shrink-0 rounded-full text-xs"
                    />
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">{row.label}</p>
                      <p className="text-muted-foreground">
                        {t(KIND_LABEL[row.pulse.kind])}
                        {row.pulse.until ? ` · ${row.pulse.until}` : ""}
                        {row.pulse.graceDays > 0 ? ` · +${row.pulse.graceDays}d` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                    <span className="hidden sm:inline">{row.pulse.until ?? "—"}</span>
                    <span className="tabular-nums">{row.pulse.graceDays}</span>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      aria-label={t("pulse.dismiss", { label: row.label })}
                      onClick={() => removeRow(row.messageId)}
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </div>
    </>
  );
}
