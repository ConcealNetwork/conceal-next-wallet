"use client";

import { ArrowDownLeft, ArrowUpRight, PiggyBank, TrendingUp } from "lucide-react";
import { useMemo } from "react";
import { PageHeader, SectionCard, StatCard } from "@/components/wallet/common";
import { useDeposits, useMarketData, useTransactions } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import type { TransactionType } from "@/lib/types";
import { deriveInsights, type MonthlyFlow } from "@/lib/ui/wallet-insights";
import { ccxToNumber, formatCcx, usdSubline } from "@/lib/utils";

const TYPE_LABELS: Record<TransactionType, string> = {
  receive: "Received",
  send: "Sent",
  deposit: "Deposits",
  withdrawal: "Withdrawals",
  fusion: "Optimizations",
  miner: "Mined",
  message: "Messages",
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
      <PageHeader
        title={t("nav.insights")}
        subtitle="Your activity, computed privately on this device"
      />

      {loading ? (
        <p className="text-muted-foreground">Loading…</p>
      ) : insights.txCount === 0 ? (
        <SectionCard title="No activity yet">
          <p className="text-muted-foreground">
            Once you send or receive CCX, this page summarizes your activity — entirely on this
            device. Nothing is ever sent to a server.
          </p>
        </SectionCard>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              label="Total received"
              value={ccx(insights.totalReceivedAtomic)}
              detail={sub(insights.totalReceivedAtomic)}
              icon={<ArrowDownLeft />}
              tone="incoming"
            />
            <StatCard
              label="Total sent"
              value={ccx(insights.totalSentAtomic)}
              detail={sub(insights.totalSentAtomic)}
              icon={<ArrowUpRight />}
              tone="outgoing"
            />
            <StatCard
              label="Net flow"
              value={ccx(insights.netFlowAtomic)}
              detail="Received − sent"
              icon={<TrendingUp />}
              tone={insights.netFlowAtomic >= 0 ? "incoming" : "outgoing"}
            />
            <StatCard
              label="Interest earned"
              value={ccx(insights.interestEarnedAtomic)}
              detail={sub(insights.interestEarnedAtomic)}
              icon={<PiggyBank />}
              tone="deposit"
            />
          </div>

          <SectionCard
            title="Monthly flow"
            description="Received vs sent per month — derived from your transaction history"
          >
            <MonthlyFlowChart months={insights.monthly} />
          </SectionCard>

          <SectionCard title="Activity breakdown" description="Transactions by type">
            <ul className="grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {(Object.keys(TYPE_LABELS) as TransactionType[])
                .filter((type) => insights.countByType[type] > 0)
                .map((type) => (
                  <li key={type} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{TYPE_LABELS[type]}</span>
                    <span className="font-semibold tabular-nums">{insights.countByType[type]}</span>
                  </li>
                ))}
            </ul>
          </SectionCard>

          <p className="text-xs text-muted-foreground">
            These figures are computed on your device from your local wallet history. No analytics
            or tracking — nothing here leaves your browser.
          </p>
        </div>
      )}
    </>
  );
}

/** Dependency-free SVG bar chart: paired in/out bars per month. */
function MonthlyFlowChart({ months }: { months: MonthlyFlow[] }) {
  if (months.length === 0) {
    return <p className="text-sm text-muted-foreground">Not enough history yet.</p>;
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
