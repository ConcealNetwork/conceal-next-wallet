"use client";

import { Calculator } from "lucide-react";
import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CcxAmount } from "@/components/wallet/ccx";
import { COIN_UNIT_PLACES, DEPOSIT_MAX_TERM_MONTH, DEPOSIT_RATE_V3 } from "@/lib/config/config";
import { DEPOSIT_DURATION_OPTIONS } from "@/lib/services/deposit.service";
import { computeDepositInterest, getDepositTierIndex } from "@/lib/deposits/interest-calc";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";

// Tier bounds are numeric so thresholds + "Tier N" labels render locale-aware:
// the threshold string (e.g. "< 10,000 CCX") is formatted via formatCcx at render
// so number grouping follows the active locale (de "10.000", not "10,000").
const TIER_META = [
  { kind: "under", a: 10000, color: "text-primary" },
  { kind: "range", a: 10000, b: 19999, color: "text-wallet-deposit" },
  { kind: "atLeast", a: 20000, color: "text-wallet-incoming" },
] as const;

const TIER_ANNUALISED = DEPOSIT_RATE_V3.map((base) => base + 11 * 0.001);

export function InterestCalculatorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useI18n();
  const { formatCcx, formatNumber } = useFormatters();
  const [amount, setAmount] = useState("1000");
  const [term, setTerm] = useState("12");

  const ccx = Math.floor(Number(amount));
  const amountIsValid = Number.isFinite(ccx) && ccx >= 1;
  const months = Number(term) || 1;
  const tierIdx = getDepositTierIndex(amountIsValid ? ccx : 0);
  const { interestCcx, earPct, eirPct } = computeDepositInterest(amountIsValid ? ccx : 0, months);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="size-5 text-primary" aria-hidden="true" />
            {t("deposits.calculatorTitle")}
          </DialogTitle>
          <DialogDescription>{t("deposits.calculatorDescription")}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-secondary/60 p-4">
            <p className="text-sm font-medium text-muted-foreground">
              {t("deposits.interestTiers")}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("deposits.tierBaseAprNote", { months: DEPOSIT_MAX_TERM_MONTH })}
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">{t("deposits.colTier")}</th>
                    <th className="pb-2 pr-3 font-medium">{t("deposits.colThreshold")}</th>
                    <th className="pb-2 pr-3 font-medium text-right">{t("deposits.colBaseApr")}</th>
                    <th className="pb-2 font-medium text-right">{t("deposits.colAnnualised")}</th>
                  </tr>
                </thead>
                <tbody>
                  {TIER_META.map((tier, idx) => {
                    // Plain locale-grouped number (no ticker) — the pattern key
                    // appends " CCX" once; formatCcx would double it.
                    const fmt = (n: number) => formatNumber(n);
                    const threshold =
                      tier.kind === "under"
                        ? t("deposits.tierThresholdUnder", { amount: fmt(tier.a) })
                        : tier.kind === "atLeast"
                          ? t("deposits.tierThresholdAtLeast", { amount: fmt(tier.a) })
                          : t("deposits.tierThresholdRange", {
                              min: fmt(tier.a),
                              max: fmt(tier.b),
                            });
                    return (
                      <tr
                        key={tier.kind}
                        className={
                          tierIdx === idx
                            ? "font-semibold text-foreground"
                            : "text-muted-foreground"
                        }
                      >
                        <td className={`py-1.5 pr-3 ${tier.color}`}>
                          {t("deposits.tierLabel", { n: idx + 1 })}
                        </td>
                        <td className="py-1.5 pr-3">{threshold}</td>
                        <td className="py-1.5 pr-3 text-right font-mono">
                          {(DEPOSIT_RATE_V3[idx] * 100).toFixed(1)}%
                        </td>
                        <td className="py-1.5 text-right font-mono">
                          {(TIER_ANNUALISED[idx] * 100).toFixed(1)}%
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              {t("deposits.forAmountPrefix", { amount: amountIsValid ? formatNumber(ccx) : "0" })}{" "}
              <span className={TIER_META[tierIdx].color}>
                {t("deposits.tierLabel", { n: tierIdx + 1 })}
              </span>
            </p>
          </div>

          <div className="rounded-xl border border-border bg-secondary/60 p-4">
            <p className="text-sm font-medium text-muted-foreground">{t("deposits.tryItOut")}</p>

            <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_170px]">
              <div className="space-y-2">
                <Label htmlFor="calc-amount">{t("deposits.amountCcx")}</Label>
                <Input
                  id="calc-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder={t("deposits.enterAmountPlaceholder")}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calc-term">{t("deposits.term")}</Label>
                <Select value={term} onValueChange={setTerm}>
                  <SelectTrigger id="calc-term" aria-label={t("deposits.depositTermAria")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {DEPOSIT_DURATION_OPTIONS.map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {t(m === 1 ? "deposits.monthsValueOne" : "deposits.monthsValue", {
                          count: m,
                        })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <CalcResult
                label={t("deposits.effectiveApr")}
                value={amountIsValid ? `${earPct.toFixed(2)}%` : "—"}
                tone="amber"
              />
              <CalcResult
                label={t("deposits.periodRate")}
                value={amountIsValid ? `${eirPct.toFixed(2)}%` : "—"}
                tone="amber"
              />
              <CalcResult
                label={t("deposits.estInterest")}
                value={amountIsValid ? formatCcx(interestCcx, COIN_UNIT_PLACES, true) : "—"}
                tone="incoming"
              />
              <CalcResult
                label={t("deposits.valueAtMaturity")}
                value={amountIsValid ? formatCcx(ccx + interestCcx, COIN_UNIT_PLACES, true) : "—"}
                tone="deposit"
              />
            </dl>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CalcResult({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "amber" | "deposit" | "incoming";
}) {
  const toneClass = {
    amber: "text-primary",
    deposit: "text-wallet-deposit",
    incoming: "text-wallet-incoming",
  }[tone];

  return (
    <div className="min-w-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={`mt-1 truncate font-mono text-sm font-semibold ${toneClass}`}>
        {tone === "incoming" || tone === "deposit" ? <CcxAmount>{value}</CcxAmount> : value}
      </dd>
    </div>
  );
}
