"use client";

import { ArrowDownLeft, PiggyBank } from "lucide-react";
import Link from "next/link";
import { RailMarketSection, RailSectionHeading } from "@/components/layout/rails/rail-parts";
import { RightRailHeader } from "@/components/layout/right-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { CcxAmount } from "@/components/wallet/ccx";
import { useDeposits, useTransactions } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { cn, truncateAddress } from "@/lib/utils";

// Receive-page contextual rail (#122). The page is the address/QR/payment-link
// form; this rail carries the history that used to sit beside it — recently
// received transfers, deposit history, and a market reference. Fetches its own
// data so it stays live without re-registration.
export function ReceiveRail({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { formatCcx, timeAgo } = useFormatters();
  const txs = useTransactions().data;
  const received = txs ? txs.filter((tx) => tx.type === "receive").slice(0, 5) : null;
  const deposits = useDeposits().data;
  const depositHistory = deposits ? deposits.slice(0, 5) : null;

  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title={t("nav.receive")} />}

      {/* Recently received */}
      <section>
        <RailSectionHeading icon={ArrowDownLeft} first>
          {t("receive.recentlyReceived")}
        </RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 px-5">
          {received === null ? (
            <RailRowSkeletons />
          ) : received.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              {t("receive.noIncoming")}
            </p>
          ) : (
            received.map((transaction, index) => (
              <div
                key={transaction.id}
                className={cn(
                  "flex items-center gap-3 py-3",
                  index > 0 && "border-t border-border/70",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[12px] text-foreground">
                    {truncateAddress(transaction.address, 6, 4)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {timeAgo(transaction.timestamp)}
                  </p>
                </div>
                <p className="shrink-0 font-mono text-[13.5px] font-semibold text-wallet-incoming">
                  +<CcxAmount>{formatCcx(transaction.amount)}</CcxAmount>
                </p>
              </div>
            ))
          )}
        </div>
        <Link
          href="/wallet/transactions"
          className="mt-2.5 inline-flex w-fit items-center gap-1 rounded-sm px-1 text-[11.5px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t("receive.viewAllTransactions")} →
        </Link>
      </section>

      {/* Deposit history */}
      <section>
        <RailSectionHeading icon={PiggyBank}>{t("receive.depositHistory")}</RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 px-5">
          {depositHistory === null ? (
            <RailRowSkeletons />
          ) : depositHistory.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              {t("receive.noDeposits")}
            </p>
          ) : (
            depositHistory.map((deposit, index) => (
              <div
                key={deposit.id}
                className={cn(
                  "flex items-center justify-between gap-3 py-3",
                  index > 0 && "border-t border-border/70",
                )}
              >
                <span className="text-[13px] text-muted-foreground">
                  {t("receive.durationMonths", { count: deposit.durationMonths })}
                </span>
                <span className="shrink-0 font-mono text-[13.5px] font-semibold text-wallet-deposit">
                  +<CcxAmount>{formatCcx(deposit.amount)}</CcxAmount>
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      <RailMarketSection first={false} />
    </div>
  );
}

function RailRowSkeletons() {
  return (
    <div className="space-y-4 py-3">
      {Array.from({ length: 3 }).map((_, index) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: static fixed-length placeholder list
        <div key={index} className="flex items-center justify-between gap-3">
          <Skeleton className="h-3.5 w-24" />
          <Skeleton className="h-3.5 w-12" />
        </div>
      ))}
    </div>
  );
}
