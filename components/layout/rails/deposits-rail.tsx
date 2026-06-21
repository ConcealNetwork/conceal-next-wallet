"use client";

import { Calculator, PiggyBank } from "lucide-react";
import { useState } from "react";
import {
  RailMarketSection,
  RailSectionHeading,
  RailStatRow,
} from "@/components/layout/rails/rail-parts";
import { RightRailHeader } from "@/components/layout/right-rail";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { CcxAmount } from "@/components/wallet/ccx";
import { COIN_UNIT_PLACES, DEPOSIT_MAX_TERM_MONTH } from "@/lib/config/config";
import { computeDepositInterest } from "@/lib/deposits/interest-calc";
import { useDeposits } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import type { Deposit } from "@/lib/types";
import { ccxToNumber, cn } from "@/lib/utils";

// Deposits-page contextual rail (#122): the earnings summary (total locked,
// blended APR, projected interest, next maturity) pulled out of the dense main
// content so it stays visible while you scroll the list or fill the create form.
export function DepositsRail({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { formatCcx } = useFormatters();
  const deposits = useDeposits().data;
  const active = (deposits ?? []).filter((deposit) => deposit.status === "active");

  const totalLocked = active.reduce((sum, d) => sum + ccxToNumber(d.amount), 0);
  const totalInterest = active.reduce((sum, d) => sum + ccxToNumber(d.interest), 0);
  const weightedApr =
    totalLocked > 0
      ? active.reduce((sum, d) => sum + ccxToNumber(d.amount) * d.apr, 0) / totalLocked
      : 0;
  const nextUnlock = active.reduce<Deposit | null>(
    (soonest, d) => (!soonest || d.unlocksInDays < soonest.unlocksInDays ? d : soonest),
    null,
  );
  const nextUnlockLabel = nextUnlock
    ? t(nextUnlock.unlocksInDays === 1 ? "deposits.inDaysOne" : "deposits.inDaysOther", {
        count: nextUnlock.unlocksInDays,
      })
    : "—";

  // Inline deposit calculator (same V3 estimator as the full dialog).
  const [calcAmount, setCalcAmount] = useState("1000");
  const [calcTerm, setCalcTerm] = useState("12");
  const calcCcx = Math.floor(Number(calcAmount));
  const calcValid = Number.isFinite(calcCcx) && calcCcx >= 1;
  const calcMonths = Number(calcTerm) || 1;
  const { interestCcx, earPct, eirPct } = computeDepositInterest(
    calcValid ? calcCcx : 0,
    calcMonths,
  );

  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title={t("nav.deposits")} />}
      <section>
        <RailSectionHeading icon={PiggyBank} first>
          {t("deposits.activeDeposits")}
        </RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 px-5">
          {deposits ? (
            <>
              <RailStatRow
                first
                label={t("deposits.totalLocked")}
                value={<CcxAmount>{formatCcx(totalLocked)}</CcxAmount>}
              />
              <RailStatRow
                label={t("deposits.weightedAvgApr")}
                value={`${weightedApr.toFixed(2)}%`}
              />
              <RailStatRow
                label={t("deposits.totalEstInterest")}
                value={<CcxAmount>{formatCcx(totalInterest)}</CcxAmount>}
              />
              <RailStatRow label={t("deposits.nextUnlock")} value={nextUnlockLabel} />
            </>
          ) : (
            <div className="space-y-4 py-3">
              {Array.from({ length: 4 }).map((_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static fixed-length placeholder list
                <div key={index} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-16" />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section>
        <RailSectionHeading icon={Calculator}>{t("deposits.calculatorTitle")}</RailSectionHeading>
        <div className="mt-3.5 space-y-4 rounded-xl border border-border/70 p-5">
          <div className="space-y-1.5">
            <Label htmlFor="rail-calc-amount" className="text-xs text-muted-foreground">
              {t("deposits.amountCcx")}
            </Label>
            <Input
              id="rail-calc-amount"
              value={calcAmount}
              onChange={(event) => setCalcAmount(event.target.value.replace(/[^\d]/g, ""))}
              inputMode="numeric"
              pattern="[0-9]*"
              placeholder={t("deposits.enterAmountPlaceholder")}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rail-calc-term" className="text-xs text-muted-foreground">
              {t("deposits.term")}
            </Label>
            <Select value={calcTerm} onValueChange={setCalcTerm}>
              <SelectTrigger id="rail-calc-term" aria-label={t("deposits.depositTermAria")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: DEPOSIT_MAX_TERM_MONTH }, (_, i) => i + 1).map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {t(m === 1 ? "deposits.monthsValueOne" : "deposits.monthsValue", { count: m })}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t border-border/70 pt-4">
            <CalcCell
              label={t("deposits.effectiveApr")}
              value={calcValid ? `${earPct.toFixed(2)}%` : "—"}
              tone="amber"
            />
            <CalcCell
              label={t("deposits.periodRate")}
              value={calcValid ? `${eirPct.toFixed(2)}%` : "—"}
              tone="amber"
            />
            <CalcCell
              label={t("deposits.estInterest")}
              value={calcValid ? formatCcx(interestCcx, COIN_UNIT_PLACES, true) : "—"}
              tone="incoming"
              ccx
            />
            <CalcCell
              label={t("deposits.atMaturity")}
              value={calcValid ? formatCcx(calcCcx + interestCcx, COIN_UNIT_PLACES, true) : "—"}
              tone="deposit"
              ccx
            />
          </dl>
        </div>
      </section>

      <RailMarketSection first={false} />
    </div>
  );
}

function CalcCell({
  label,
  value,
  tone,
  ccx = false,
}: {
  label: string;
  value: string;
  tone: "amber" | "incoming" | "deposit";
  ccx?: boolean;
}) {
  const toneClass = {
    amber: "text-primary",
    incoming: "text-wallet-incoming",
    deposit: "text-wallet-deposit",
  }[tone];
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-1 truncate font-mono text-[13px] font-semibold", toneClass)}>
        {ccx ? <CcxAmount>{value}</CcxAmount> : value}
      </dd>
    </div>
  );
}
