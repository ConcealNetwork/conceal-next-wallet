"use client";

import { ArrowUpRight, QrCode, Wallet } from "lucide-react";
import { RailSectionHeading } from "@/components/layout/rails/rail-parts";
import { RightRailHeader } from "@/components/layout/right-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { CcxAmount } from "@/components/wallet/ccx";
import { CopyButton, WalletQrCode } from "@/components/wallet/common";
import { SEND_FEE_CCX as SEND_FEE } from "@/lib/config/config";
import { useMarketData, useTransactions, useWalletInfo } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { ccxToNumber, cn, truncateAddress, usdSubline } from "@/lib/utils";

// Send-page contextual rail (#122). The Send page is just the form now; this rail
// carries the supporting context that used to crowd the page: spendable balance,
// your receive address (copy + QR), recently-sent history, and the network fee.

export function SendRail({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const { formatCcx, timeAgo } = useFormatters();
  const info = useWalletInfo().data;
  const price = useMarketData().data?.price.value ?? 0;
  const available = info ? ccxToNumber(info.available) : 0;
  const usd = info ? usdSubline(available, price) : undefined;
  const address = info?.address;

  const txs = useTransactions().data;
  const recentSent = txs ? txs.filter((tx) => tx.type === "send").slice(0, 5) : null;

  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title={t("nav.send")} />}

      {/* Spendable balance */}
      <section>
        <RailSectionHeading icon={Wallet} first>
          {t("rail.available")}
        </RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 p-5">
          {info ? (
            <>
              <p className="font-mono text-2xl font-semibold leading-none tracking-tight text-foreground">
                <CcxAmount>{formatCcx(available)}</CcxAmount>
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                {t("send.readyToSpend")}
                {usd ? ` · ${usd}` : ""}
              </p>
            </>
          ) : (
            <div className="space-y-3">
              <Skeleton className="h-7 w-32" />
              <Skeleton className="h-3 w-24" />
            </div>
          )}
        </div>
      </section>

      {/* Your receive address + QR */}
      <section>
        <RailSectionHeading icon={QrCode}>{t("nav.receive")}</RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 p-5">
          {address ? (
            <>
              <div className="flex items-center gap-2 rounded-lg bg-secondary p-2 pl-3">
                <span className="min-w-0 flex-1 break-all font-mono text-[11px] leading-relaxed text-muted-foreground">
                  {address}
                </span>
                <CopyButton value={address} label={t("send.copyAddress")} iconOnly />
              </div>
              <div className="mt-4">
                <WalletQrCode value={address} fullWidth />
              </div>
            </>
          ) : (
            <Skeleton className="h-[150px] w-full" />
          )}
        </div>
      </section>

      {/* Recently sent */}
      <section>
        <RailSectionHeading icon={ArrowUpRight}>{t("send.recentlySent")}</RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 px-5">
          {recentSent === null ? (
            <div className="space-y-4 py-3">
              {Array.from({ length: 3 }).map((_, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: static fixed-length placeholder list
                <div key={index} className="flex items-center justify-between gap-3">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3.5 w-12" />
                </div>
              ))}
            </div>
          ) : recentSent.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-muted-foreground">
              {t("send.noOutgoing")}
            </p>
          ) : (
            recentSent.map((tx, index) => (
              <div
                key={tx.id}
                className={cn(
                  "flex items-center gap-3 py-3",
                  index > 0 && "border-t border-border/70",
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-mono text-[12px] text-foreground">
                    {truncateAddress(tx.address, 6, 4)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{timeAgo(tx.timestamp)}</p>
                </div>
                <p className="shrink-0 font-mono text-[13.5px] font-semibold text-wallet-outgoing">
                  −<CcxAmount>{formatCcx(tx.amount)}</CcxAmount>
                </p>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Network fee */}
      <section>
        <RailSectionHeading>{t("send.networkFee")}</RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 p-5">
          <p className="font-mono text-xl font-semibold leading-none text-foreground">
            <CcxAmount>{formatCcx(SEND_FEE, 6)}</CcxAmount>
          </p>
        </div>
      </section>
    </div>
  );
}
