"use client";

import { Activity } from "lucide-react";
import { RailSectionHeading, RailStatRow } from "@/components/layout/rails/rail-parts";
import { RightRailHeader } from "@/components/layout/right-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketData } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { ccxToNumber, cn } from "@/lib/utils";

// Market-page contextual rail (#122): an at-a-glance stat summary that
// complements the page's chart. Stat labels share the market.* i18n keys with
// the page's MarketStatsGrid; fetches its own data so it stays live.
export function MarketRail({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { formatUsd, formatCcx } = useFormatters();
  const market = useMarketData().data;

  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title={t("nav.market")} />}
      <section>
        <RailSectionHeading icon={Activity} first>
          {t("nav.market")}
        </RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 px-5">
          {market ? (
            <>
              <RailStatRow
                first
                label={t("market.price")}
                value={formatUsd(market.price.value, 4)}
              />
              <RailStatRow
                label={t("market.change24h")}
                value={<ChangeValue pct={market.change24hPct} />}
              />
              <RailStatRow label={t("market.high24h")} value={formatUsd(market.high24h.value, 4)} />
              <RailStatRow label={t("market.low24h")} value={formatUsd(market.low24h.value, 4)} />
              <RailStatRow
                label={t("market.volume24h")}
                value={formatUsd(market.volume24h.value, 0)}
              />
              <RailStatRow
                label={t("market.marketCap")}
                value={formatUsd(market.marketCap.value, 0)}
              />
              <RailStatRow
                label={t("market.circulatingSupply")}
                value={formatCcx(ccxToNumber(market.circulatingSupply), 0)}
              />
              {market.ath ? (
                <RailStatRow
                  label={t("market.allTimeHigh")}
                  value={formatUsd(market.ath.value, 4)}
                />
              ) : null}
            </>
          ) : (
            <div className="space-y-4 py-3">
              {Array.from({ length: 6 }).map((_, index) => (
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

function ChangeValue({ pct }: { pct: number }) {
  const up = pct >= 0;
  return (
    <span className={cn(up ? "text-wallet-incoming" : "text-wallet-outgoing")}>
      {up ? "▲" : "▼"} {Math.abs(pct).toFixed(2)}%
    </span>
  );
}
