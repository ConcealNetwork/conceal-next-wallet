"use client";

import { Radio } from "lucide-react";
import { RailSectionHeading, RailStatRow } from "@/components/layout/rails/rail-parts";
import { RightRailHeader } from "@/components/layout/right-rail";
import { Skeleton } from "@/components/ui/skeleton";
import { useNetworkStatus } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";

// Network-page contextual rail (#122): a compact node/chain telemetry summary
// beside the page's fuller telemetry. Fetches its own data so it stays live.
export function NetworkRail({ embedded = false }: { embedded?: boolean }) {
  const { t } = useI18n();
  const status = useNetworkStatus().data;

  return (
    <div className="flex flex-col gap-1">
      {embedded ? null : <RightRailHeader title={t("nav.network")} />}
      <section>
        <RailSectionHeading icon={Radio} first>
          {t("nav.network")}
        </RailSectionHeading>
        <div className="mt-3.5 rounded-xl border border-border/70 px-5">
          {status ? (
            <>
              <RailStatRow
                first
                label={t("network.blockHeight")}
                value={status.height.toLocaleString()}
              />
              <RailStatRow
                label={t("network.connectedPeers")}
                value={status.peers.toLocaleString()}
                sub={t("network.peersShort", { out: status.peersOut, in: status.peersIn })}
              />
              <RailStatRow label={t("network.hashrate")} value={formatHashrate(status.hashrate)} />
              <RailStatRow
                label={t("network.difficulty")}
                value={status.difficulty.toLocaleString()}
              />
              <RailStatRow
                label={t("network.avgBlockTime")}
                value={`${status.avgBlockTimeSeconds.toFixed(0)} s`}
              />
              <RailStatRow
                label={t("network.version")}
                value={status.version}
                sub={status.isCustom ? t("network.customNode") : t("network.defaultNode")}
              />
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

// Mirrors the network page's formatHashrate (kept local — the page's is private).
function formatHashrate(hps: number): string {
  if (hps >= 1e9) return `${(hps / 1e9).toFixed(2)} GH/s`;
  if (hps >= 1e6) return `${(hps / 1e6).toFixed(2)} MH/s`;
  if (hps >= 1e3) return `${(hps / 1e3).toFixed(2)} kH/s`;
  return `${Math.round(hps)} H/s`;
}
