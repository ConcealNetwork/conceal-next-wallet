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
import { computeDepositInterest, getDepositTierIndex } from "@/lib/deposits/interest-calc";
import { useFormatters } from "@/lib/i18n/use-formatters";

const TIER_META = [
  { label: "Tier 1", threshold: "< 10,000 CCX", color: "text-primary" },
  { label: "Tier 2", threshold: "10,000 – 19,999 CCX", color: "text-wallet-deposit" },
  { label: "Tier 3", threshold: "≥ 20,000 CCX", color: "text-wallet-incoming" },
] as const;

const TIER_ANNUALISED = DEPOSIT_RATE_V3.map((base) => base + 11 * 0.001);

export function InterestCalculatorDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { formatCcx } = useFormatters();
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
            Deposit Calculator
          </DialogTitle>
          <DialogDescription>Estimate earnings -- based on interest model V3.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-secondary/60 p-4">
            <p className="text-sm font-medium text-muted-foreground">Interest Tiers</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Base APR from <code className="text-foreground">depositRateV3</code> — annualised at
              max term (12 months)
            </p>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="pb-2 pr-3 font-medium">Tier</th>
                    <th className="pb-2 pr-3 font-medium">Threshold</th>
                    <th className="pb-2 pr-3 font-medium text-right">Base APR</th>
                    <th className="pb-2 font-medium text-right">Annualised</th>
                  </tr>
                </thead>
                <tbody>
                  {TIER_META.map((tier, idx) => (
                    <tr
                      key={tier.label}
                      className={
                        tierIdx === idx ? "font-semibold text-foreground" : "text-muted-foreground"
                      }
                    >
                      <td className={`py-1.5 pr-3 ${tier.color}`}>{tier.label}</td>
                      <td className="py-1.5 pr-3">{tier.threshold}</td>
                      <td className="py-1.5 pr-3 text-right font-mono">
                        {(DEPOSIT_RATE_V3[idx] * 100).toFixed(1)}%
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {(TIER_ANNUALISED[idx] * 100).toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              For {amountIsValid ? formatCcx(ccx) : "0"} CCX →{" "}
              <span className={TIER_META[tierIdx].color}>{TIER_META[tierIdx].label}</span>
            </p>
          </div>

          <div className="rounded-xl border border-border bg-secondary/60 p-4">
            <p className="text-sm font-medium text-muted-foreground">Try it out</p>

            <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_170px]">
              <div className="space-y-2">
                <Label htmlFor="calc-amount">Amount (CCX)</Label>
                <Input
                  id="calc-amount"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, ""))}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  placeholder="Enter amount"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="calc-term">Term</Label>
                <Select value={term} onValueChange={setTerm}>
                  <SelectTrigger id="calc-term" aria-label="Deposit term">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: DEPOSIT_MAX_TERM_MONTH }, (_, i) => i + 1).map((m) => (
                      <SelectItem key={m} value={String(m)}>
                        {m} month{m === 1 ? "" : "s"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <dl className="mt-4 grid gap-3 sm:grid-cols-2">
              <CalcResult
                label="Effective APR"
                value={amountIsValid ? `${earPct.toFixed(2)}%` : "—"}
                tone="amber"
              />
              <CalcResult
                label="Period Rate"
                value={amountIsValid ? `${eirPct.toFixed(2)}%` : "—"}
                tone="amber"
              />
              <CalcResult
                label="Est. Interest"
                value={amountIsValid ? formatCcx(interestCcx, COIN_UNIT_PLACES, true) : "—"}
                tone="incoming"
              />
              <CalcResult
                label="Value at Maturity"
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
