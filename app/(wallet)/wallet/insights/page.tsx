"use client";

import { ArrowDownLeft, ArrowUpRight, PiggyBank, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { PageHeader, SectionCard, StatCard } from "@/components/wallet/common";
import { useDeposits, useMarketData, useTransactions } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { TransactionType } from "@/lib/types";
import { deriveInsights, type MonthlyFlow } from "@/lib/ui/wallet-insights";
import { ccxToNumber, formatCcx, usdSubline } from "@/lib/utils";

const TYPE_LABEL_KEYS: Record<TransactionType, string> = {
  receive: "insights.typeReceive",
  send: "insights.typeSend",
  deposit: "insights.typeDeposit",
  withdrawal: "insights.typeWithdrawal",
  fusion: "insights.typeFusion",
  miner: "insights.typeMiner",
  message: "insights.typeMessage",
};

export default function InsightsPage() {
  const { t } = useI18n();
  const transactions = useTransactions();
  const deposits = useDeposits();
  const market = useMarketData();
  const priceUsd = market.data?.price.value ?? 0;

  const insights = useMemo(
    () => deriveInsights(transactions.data ?? [], deposits.data ?? []),
    [transactions.data, deposits.data],
  );

  const ccx = (atomic: number) => formatCcx({ atomic });
  const sub = (atomic: number) => usdSubline(ccxToNumber({ atomic }), priceUsd) ?? "";

  const loading = transactions.isLoading || deposits.isLoading;

  return (
    <>
      <PageHeader title={t("nav.insights")} subtitle={t("insights.subtitle")} />

      {loading ? (
        <p className="text-muted-foreground">{t("insights.loading")}</p>
      ) : insights.txCount === 0 ? (
        <SectionCard title={t("insights.noActivityTitle")}>
          <p className="text-muted-foreground">{t("insights.noActivityBody")}</p>
        </SectionCard>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label={t("insights.totalReceived")}
              value={ccx(insights.totalReceivedAtomic)}
              detail={sub(insights.totalReceivedAtomic)}
              icon={<ArrowDownLeft />}
              tone="incoming"
            />
            <StatCard
              label={t("insights.totalSent")}
              value={ccx(insights.totalSentAtomic)}
              detail={sub(insights.totalSentAtomic)}
              icon={<ArrowUpRight />}
              tone="outgoing"
            />
            <StatCard
              label={t("insights.netFlow")}
              value={ccx(insights.netFlowAtomic)}
              detail={t("insights.netFlowDetail")}
              icon={<TrendingUp />}
              tone={insights.netFlowAtomic >= 0 ? "incoming" : "outgoing"}
            />
            <StatCard
              label={t("insights.interestEarned")}
              value={ccx(insights.interestEarnedAtomic)}
              detail={sub(insights.interestEarnedAtomic)}
              icon={<PiggyBank />}
              tone="deposit"
            />
          </div>

          <SectionCard
            title={t("insights.monthlyFlow")}
            description={t("insights.monthlyFlowDescription")}
          >
            <MonthlyFlowChart months={insights.monthly} />
          </SectionCard>

          <SectionCard
            title={t("insights.activityBreakdown")}
            description={t("insights.activityBreakdownDescription")}
          >
            <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {(Object.keys(TYPE_LABEL_KEYS) as TransactionType[])
                .filter((type) => insights.countByType[type] > 0)
                .map((type) => (
                  <li key={type} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t(TYPE_LABEL_KEYS[type])}</span>
                    <span className="font-semibold tabular-nums">{insights.countByType[type]}</span>
                  </li>
                ))}
            </ul>
          </SectionCard>

          <p className="text-xs text-muted-foreground">{t("insights.privacyNote")}</p>
        </div>
      )}
    </>
  );
}

/** Dependency-free SVG bar chart: paired in/out bars per month. */
function MonthlyFlowChart({ months }: { months: MonthlyFlow[] }) {
  const { t } = useI18n();
  if (months.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("insights.notEnoughHistory")}</p>;
  }
  const max = Math.max(1, ...months.map((m) => Math.max(m.inAtomic, m.outAtomic)));
  return (
    <div className="flex items-end gap-3 overflow-x-auto pb-2" aria-hidden="true">
      {months.map((m) => (
        <div key={m.month} className="flex min-w-[2.5rem] flex-1 flex-col items-center gap-1">
          <div className="flex h-32 w-full items-end justify-center gap-1">
            <div
              className="w-2.5 rounded-t bg-wallet-incoming/80"
              style={{ height: `${(m.inAtomic / max) * 100}%` }}
            />
            <div
              className="w-2.5 rounded-t bg-wallet-outgoing/80"
              style={{ height: `${(m.outAtomic / max) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground">{m.month.slice(2)}</span>
        </div>
      ))}
    </div>
  );
}
