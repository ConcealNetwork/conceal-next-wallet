"use client";

import { PiggyBank, QrCode, Repeat, Send } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { RailMarketSection, RailSectionHeading } from "@/components/layout/rails/rail-parts";
import { RightRailHeader } from "@/components/layout/right-rail";
import { CcxAmount } from "@/components/wallet/ccx";
import { Skeleton } from "@/components/ui/skeleton";
import { useWalletInfo } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { useFormatters } from "@/lib/i18n/use-formatters";
import { ccxToNumber, cn, stripTickerSuffix } from "@/lib/utils";

// Issue #122, stage 2 — the Account-page contextual rail. Compact Market +
// Holdings + Quick actions summary that complements (not duplicates) the dense
// main content. Section labels and action labels are localized via i18n (#84).

// `embedded` renders the same sections WITHOUT the panel header, for the
// small-screen body fallback (< 1200px, where the rail column is hidden) so
// narrow viewports never lose the market/holdings summary. Above the rail
// breakpoint the body fallback is CSS-hidden and the registered rail shows instead.
export function AccountRail({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title={t("nav.account")} />}
      <RailMarketSection />
      <HoldingsSection />
      <QuickActionsSection />
    </div>
  );
}

type Holding = {
  label: string;
  value: number;
  note: string;
  barClassName: string;
};

function HoldingsSection() {
  const wallet = useWalletInfo();
  const { formatCcx } = useFormatters();
  const { t } = useI18n();
  const info = wallet.data;

  const holdings: Holding[] = info
    ? [
        {
          label: t("rail.available"),
          value: ccxToNumber(info.available),
          note: t("rail.availableNote"),
          barClassName: "bg-primary",
        },
        {
          label: t("rail.locked"),
          value: ccxToNumber(info.lockedDeposits),
          note: t("rail.lockedNote"),
          barClassName: "bg-wallet-deposit",
        },
        {
          label: t("rail.pending"),
          value: ccxToNumber(info.pending),
          note: t("rail.pendingNote"),
          barClassName: "bg-wallet-outgoing",
        },
        {
          label: t("rail.withdrawable"),
          value: ccxToNumber(info.withdrawable),
          note: t("rail.withdrawableNote"),
          barClassName: "bg-wallet-incoming",
        },
      ]
    : [];

  return (
    <section>
      <RailSectionHeading>{t("rail.holdings")}</RailSectionHeading>
      <div className="mt-3.5 rounded-xl border border-border/70 px-5">
        {info ? (
          holdings.map((holding, index) => (
            <div
              key={holding.label}
              className={cn(
                "flex items-center gap-3.5 py-3",
                index > 0 && "border-t border-border/70",
              )}
            >
              <span
                className={cn("h-9 w-1 shrink-0 rounded-full", holding.barClassName)}
                aria-hidden="true"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-medium text-foreground">{holding.label}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{holding.note}</p>
              </div>
              <p className="shrink-0 text-right font-mono text-[14.5px] font-semibold text-foreground">
                <CcxAmount>{stripTickerSuffix(formatCcx(holding.value))}</CcxAmount>
              </p>
            </div>
          ))
        ) : (
          <div className="space-y-4 py-3">
            {Array.from({ length: 4 }).map((_, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: static fixed-length placeholder list, never reordered
              <div key={index} className="flex items-center gap-3.5">
                <Skeleton className="h-9 w-1 rounded-full" />
                <div className="flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-20" />
                  <Skeleton className="h-3 w-28" />
                </div>
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

type QuickAction = { href: string; labelKey: string; ariaKey: string; icon: LucideIcon };

// `aria` is intentionally MORE specific than the bare nav-link labels ("Send", etc.):
// it makes these rail shortcuts distinct in the accessibility tree so they don't collide
// with the sidebar nav links (which the e2e selects by exact name), and reads better aloud.
const QUICK_ACTIONS: QuickAction[] = [
  { href: "/wallet/send", labelKey: "nav.send", ariaKey: "rail.sendAria", icon: Send },
  { href: "/wallet/receive", labelKey: "nav.receive", ariaKey: "rail.receiveAria", icon: QrCode },
  {
    href: "/wallet/deposits",
    labelKey: "rail.deposit",
    ariaKey: "rail.depositAria",
    icon: PiggyBank,
  },
  {
    href: "/wallet/settings",
    labelKey: "rail.optimize",
    ariaKey: "rail.optimizeAria",
    icon: Repeat,
  },
];

function QuickActionsSection() {
  const { t } = useI18n();
  return (
    <section>
      <RailSectionHeading>{t("rail.quickActions")}</RailSectionHeading>
      <div className="mt-3.5 grid grid-cols-2 gap-3">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon;
          return (
            <Link
              key={action.href}
              href={action.href}
              aria-label={t(action.ariaKey)}
              className="flex flex-col items-center gap-2.5 rounded-xl border border-border/70 px-3 py-4 text-center text-[13px] font-semibold text-foreground transition-[border-color,background-color,transform] duration-150 hover:-translate-y-px hover:bg-secondary hover:text-foreground focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transform-none motion-reduce:transition-none"
            >
              <Icon className="size-[18px] text-muted-foreground" aria-hidden="true" />
              {t(action.labelKey)}
            </Link>
          );
        })}
      </div>
    </section>
  );
}
