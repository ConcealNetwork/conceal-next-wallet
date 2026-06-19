"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { PageHeader, SectionCard } from "@/components/wallet/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/lib/i18n/i18n-provider";
import {
  listSchedules,
  markSchedulePaid,
  removeSchedule,
  saveSchedule,
} from "@/lib/storage/scheduled-payments-store";
import {
  CADENCES,
  type Cadence,
  computeNextDue,
  isDue,
  type ScheduledPayment,
} from "@/lib/ui/scheduled-payments";
import { addressIsValid } from "@/lib/validation/ccx";

const EMPTY_FORM = {
  label: "",
  address: "",
  amount: "",
  cadence: "monthly" as Cadence,
  anchorDate: "",
};

const CADENCE_LABEL_KEYS: Record<Cadence, string> = {
  weekly: "scheduled.cadenceWeekly",
  monthly: "scheduled.cadenceMonthly",
  quarterly: "scheduled.cadenceQuarterly",
  yearly: "scheduled.cadenceYearly",
};

export default function ScheduledPage() {
  const { t } = useI18n();
  const router = useRouter();
  const [schedules, setSchedules] = useState<ScheduledPayment[]>(() => listSchedules());
  const [form, setForm] = useState(EMPTY_FORM);
  const nowISO = useMemo(() => new Date().toISOString(), []);

  function add() {
    if (!form.label.trim()) return toast.error(t("scheduled.errNameRequired"));
    if (!addressIsValid(form.address.trim())) return toast.error(t("scheduled.errAddressInvalid"));
    if (!(Number(form.amount) > 0)) return toast.error(t("scheduled.errAmountInvalid"));
    if (!form.anchorDate) return toast.error(t("scheduled.errDateRequired"));

    const schedule: ScheduledPayment = {
      id: crypto.randomUUID(),
      label: form.label.trim(),
      address: form.address.trim(),
      amount: form.amount.trim(),
      cadence: form.cadence,
      // Normalize the date input to an ISO instant (UTC midnight).
      anchorDate: new Date(`${form.anchorDate}T00:00:00.000Z`).toISOString(),
    };
    try {
      setSchedules(saveSchedule(schedule));
      setForm(EMPTY_FORM);
      toast.success(t("scheduled.added"));
    } catch {
      toast.error(t("scheduled.errSaveFailed"));
    }
  }

  function sendNow(schedule: ScheduledPayment) {
    const params = new URLSearchParams({ address: schedule.address, amount: schedule.amount });
    if (schedule.paymentId) params.set("paymentId", schedule.paymentId);
    router.push(`/wallet/send?${params.toString()}`);
  }

  function markPaid(id: string) {
    try {
      setSchedules(markSchedulePaid(id, new Date().toISOString()));
      toast.success(t("scheduled.markedPaid"));
    } catch {
      toast.error(t("scheduled.errUpdateFailed"));
    }
  }

  function remove(id: string) {
    try {
      setSchedules(removeSchedule(id));
    } catch {
      toast.error(t("scheduled.errRemoveFailed"));
    }
  }

  const sorted = [...schedules].sort((a, b) => computeNextDue(a).localeCompare(computeNextDue(b)));

  return (
    <>
      <PageHeader title={t("nav.scheduled")} subtitle={t("scheduled.subtitle")} />

      <div className="space-y-6">
        <SectionCard
          title={t("scheduled.addTitle")}
          description={t("scheduled.addDescription")}
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="sched-label">{t("scheduled.nameLabel")}</Label>
              <Input
                id="sched-label"
                placeholder={t("scheduled.namePlaceholder")}
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-amount">{t("scheduled.amountLabel")}</Label>
              <Input
                id="sched-amount"
                type="number"
                inputMode="decimal"
                placeholder={t("scheduled.amountPlaceholder")}
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="sched-address">{t("scheduled.addressLabel")}</Label>
              <Input
                id="sched-address"
                placeholder={t("addressBook.addressPlaceholder")}
                autoComplete="off"
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-cadence">{t("scheduled.repeatsLabel")}</Label>
              <select
                id="sched-cadence"
                className="h-10 w-full cursor-pointer rounded-xl border border-input bg-background px-3 text-sm text-foreground"
                value={form.cadence}
                onChange={(e) => setForm({ ...form, cadence: e.target.value as Cadence })}
              >
                {CADENCES.map((c) => (
                  <option key={c} value={c}>
                    {t(CADENCE_LABEL_KEYS[c])}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="sched-date">{t("scheduled.firstDueLabel")}</Label>
              <Input
                id="sched-date"
                type="date"
                value={form.anchorDate}
                onChange={(e) => setForm({ ...form, anchorDate: e.target.value })}
              />
            </div>
          </div>
          <div className="mt-4">
            <Button type="button" onClick={add}>
              {t("scheduled.addReminder")}
            </Button>
          </div>
        </SectionCard>

        <SectionCard title={t("scheduled.listTitle")} description={t("scheduled.listDescription")}>
          {sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("scheduled.empty")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {sorted.map((s) => {
                const due = isDue(s, nowISO);
                const next = computeNextDue(s).slice(0, 10);
                return (
                  <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{s.label}</span>
                        {due && (
                          <span className="rounded-full bg-wallet-amber/15 px-2 py-0.5 text-xs font-semibold text-wallet-amber">
                            {t("scheduled.due")}
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {t("scheduled.itemDetail", {
                          amount: s.amount,
                          cadence: t(CADENCE_LABEL_KEYS[s.cadence]),
                          next,
                        })}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" size="sm" onClick={() => sendNow(s)}>
                        {t("scheduled.sendNow")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => markPaid(s.id)}
                      >
                        {t("scheduled.markPaid")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t("scheduled.deleteAria", { label: s.label })}
                        onClick={() => remove(s.id)}
                      >
                        {t("scheduled.delete")}
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
