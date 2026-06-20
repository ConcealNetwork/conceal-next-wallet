"use client";

import { ChartColumn } from "lucide-react";
import { useMemo } from "react";
import { RailSectionHeading, RailStatRow } from "@/components/layout/rails/rail-parts";
import { RightRailHeader } from "@/components/layout/right-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeposits, useMarketData, useTransactions } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { deriveInsights } from "@/lib/ui/wallet-insights";
import { ccxToNumber, usdSubline } from "@/lib/utils";

// Insights-page contextual rail (#122): the headline totals, computed locally
// from the same transactions/deposits the page uses. Fetches its own data.
export function InsightsRail({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { formatCcx } = useFormatters();
  const transactions = useTransactions().data;
  const deposits = useDeposits().data;
  const priceUsd = useMarketData().data?.price.value ?? 0;

  const insights = useMemo(
    () => (transactions && deposits ? deriveInsights(transactions, deposits) : null),
    [transactions, deposits],
  );

  const ccx = (atomic: number) => formatCcx({ atomic });
  const sub = (atomic: number) => usdSubline(ccxToNumber({ atomic }), priceUsd);

  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title={t("nav.insights")} />}
      <section>
        <RailSectionHeading icon={ChartColumn} first>
          {t("nav.insights")}
        </RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 px-5">
          {insights ? (
            <>
              <RailStatRow
                first
                label={t("insights.totalReceived")}
                value={ccx(insights.totalReceivedAtomic)}
                sub={sub(insights.totalReceivedAtomic)}
              />
              <RailStatRow
                label={t("insights.totalSent")}
                value={ccx(insights.totalSentAtomic)}
                sub={sub(insights.totalSentAtomic)}
              />
              <RailStatRow
                label={t("insights.netFlow")}
                value={ccx(insights.netFlowAtomic)}
                sub={t("insights.netFlowDetail")}
              />
              <RailStatRow
                label={t("insights.interestEarned")}
                value={ccx(insights.interestEarnedAtomic)}
                sub={sub(insights.interestEarnedAtomic)}
              />
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
    </div>
  );
}
