"use client";

import { useId, useMemo } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { PageHeader } from "@/components/wallet/common";
import { useNetworkStatus } from "@/lib/hooks";
import { useCountUp, usePrefersReducedMotion } from "@/lib/hooks/use-count-up";
import { cn } from "@/lib/utils";

const BLOCK_TARGET_SECONDS = 120;
const TELEMETRY_SKELETON_KEYS = ["height", "hashrate", "peers", "block-time"] as const;

export default function NetworkPage() {
  const { data, isLoading } = useNetworkStatus();
  const prefersReducedMotion = usePrefersReducedMotion();
  const animate = !prefersReducedMotion;
  const heightLabel = useCountUp(data?.height ?? 0, {
    formatter: (value) => Math.round(value).toLocaleString(),
  });
  const peersLabel = useCountUp(data?.peers ?? 0, {
    formatter: (value) => String(Math.round(value)),
  });

  if (isLoading || !data) {
    return (
      <>
        <PageHeader title="Network" subtitle="Node connection and network status" />
        <div className="space-y-6">
          <Skeleton className="h-24 w-full rounded-xl" />
          <div className="grid gap-4 lg:grid-cols-[1.05fr_1fr]">
            <Skeleton className="h-56 rounded-xl" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {TELEMETRY_SKELETON_KEYS.map((key) => (
              <Skeleton key={key} className="h-40 rounded-xl" />
            ))}
          </div>
        </div>
      </>
    );
  }

  const host = data.url.replace(/^https?:\/\//, "").replace(/\/$/, "");
  const syncPct =
    data.networkHeight > 0 ? Math.min((data.height / data.networkHeight) * 100, 100) : 0;

  return (
    <>
      <PageHeader title="Network" subtitle="Node connection and network status" />

      {/* Connection identity */}
      <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100">
        <div className="wallet-card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <PulseDot />
            <div>
              <p className="text-lg font-semibold">Connected &amp; synced</p>
              <p className="font-mono text-sm text-muted-foreground">{host}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <Meta label="Ping" value={`${data.latencyMs} ms`} tone="incoming" />
            <Meta label="Uptime" value={formatUptime(data.uptimeSeconds)} />
            <Meta label="Version" value={data.version.replace(/^Conceal Core\s*/, "v")} mono />
            <span
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
                data.isCustom ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground",
              )}
            >
              {data.isCustom ? "Custom node" : "Default node"}
            </span>
          </div>
        </div>
      </div>

      {/* Sync ring + peer constellation */}
      <div className="mt-6 grid gap-4 lg:grid-cols-[1.05fr_1fr]">
        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 wallet-card flex flex-col items-center justify-center gap-4 p-6 [animation-delay:70ms]">
          <SyncRing pct={syncPct} />
          <div className="text-center">
            <p className="font-mono text-sm text-foreground">
              {data.height.toLocaleString()}{" "}
              <span className="text-muted-foreground">/ {data.networkHeight.toLocaleString()}</span>
            </p>
            <p className="mt-1 text-xs text-muted-foreground">block height · network tip</p>
          </div>
        </div>

        <div className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 wallet-card flex flex-col items-center justify-center gap-4 p-6 [animation-delay:140ms]">
          <PeerGraph animate={animate} />
          <div className="text-center">
            <p className="text-sm text-muted-foreground">Connected Peers</p>
            <p className="mt-1 font-mono text-3xl font-bold tracking-tight">{peersLabel}</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {data.peersOut} outgoing · {data.peersIn} incoming
            </p>
          </div>
        </div>
      </div>

      {/* Telemetry */}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <ChartCard
          label="Block Height"
          value={heightLabel}
          detail={`+1 block · ${formatRelative(data.lastBlockSecondsAgo)}`}
          tone="amber"
          delay={210}
          chart={<BlockChainStrip blocks={data.heightHistory.length} animate={animate} />}
        />
        <ChartCard
          label="Network Hashrate"
          value={formatHashrate(data.hashrate)}
          detail={`difficulty ${formatDifficulty(data.difficulty)}`}
          delay={260}
          chart={<MiniArea values={data.hashrateHistory} color="hsl(var(--chart-1))" />}
        />
        <ChartCard
          label="Connected Peers"
          value={String(data.peers)}
          detail={`${data.peersOut} out · ${data.peersIn} in`}
          delay={310}
          chart={<MiniBars values={data.peersHistory} color="hsl(var(--chart-1))" />}
        />
        <ChartCard
          label="Avg Block Time"
          value={`${Math.round(data.avgBlockTimeSeconds)} s`}
          detail={`target ${BLOCK_TARGET_SECONDS} s`}
          tone="incoming"
          delay={360}
          chart={
            <Sparkline
              values={data.blockTimeHistory}
              color="hsl(var(--chart-2))"
              baseline={BLOCK_TARGET_SECONDS}
            />
          }
        />
      </div>
    </>
  );
}

function PulseDot() {
  return (
    <span className="relative flex size-3" aria-hidden="true">
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-wallet-incoming opacity-60 motion-reduce:animate-none" />
      <span className="relative inline-flex size-3 rounded-full bg-wallet-incoming" />
    </span>
  );
}

function Meta({
  label,
  value,
  tone,
  mono,
}: {
  label: string;
  value: string;
  tone?: "incoming";
  mono?: boolean;
}) {
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={cn(
          "text-sm font-semibold",
          mono && "font-mono",
          tone === "incoming" && "text-wallet-incoming",
        )}
      >
        {value}
      </span>
    </span>
  );
}

function SyncRing({ pct }: { pct: number }) {
  const clamped = Math.min(Math.max(pct, 0), 100);
  const radius = 68;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - clamped / 100);
  return (
    <svg
      viewBox="0 0 170 170"
      className="h-[168px] w-[168px]"
      role="img"
      aria-label={`${Math.round(clamped)} percent synced`}
    >
      <circle
        cx="85"
        cy="85"
        r={radius}
        fill="none"
        stroke="hsl(var(--secondary))"
        strokeWidth="12"
      />
      <circle
        cx="85"
        cy="85"
        r={radius}
        fill="none"
        stroke="hsl(var(--chart-2))"
        strokeWidth="12"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        transform="rotate(-90 85 85)"
      />
      <text
        x="85"
        y="82"
        textAnchor="middle"
        className="fill-foreground font-mono text-[34px] font-bold"
      >
        {Math.round(clamped)}%
      </text>
      <text x="85" y="104" textAnchor="middle" className="fill-muted-foreground text-xs">
        synced
      </text>
    </svg>
  );
}

// Live P2P node graph: peers stream packets into the central node, which pulses.
function PeerGraph({ animate }: { animate: boolean }) {
  // Six peers evenly placed on a circle (radius 60) around the central node at (85,85).
  const peers = [
    [85, 25],
    [137, 55],
    [137, 115],
    [85, 145],
    [33, 115],
    [33, 55],
  ] as const;
  return (
    <svg viewBox="0 0 170 170" className="h-40 w-40" aria-hidden="true">
      <g stroke="hsl(var(--border))" strokeWidth="1.2">
        {peers.map(([x, y]) => (
          <line key={`l-${x}-${y}`} x1="85" y1="85" x2={x} y2={y} />
        ))}
      </g>
      <g fill="hsl(var(--chart-1))">
        {peers.map(([x, y]) => (
          <circle key={`d-${x}-${y}`} cx={x} cy={y} r="5.5" />
        ))}
      </g>
      {animate ? (
        <>
          {peers.map(([x, y], index) => {
            const begin = `${(index * 0.32).toFixed(2)}s`;
            return (
              <circle key={`pkt-${x}-${y}`} r="2.6" fill="hsl(var(--chart-1))">
                <animateMotion
                  dur="1.9s"
                  begin={begin}
                  repeatCount="indefinite"
                  path={`M${x},${y} L85,85`}
                />
                <animate
                  attributeName="opacity"
                  values="0;1;1;0"
                  keyTimes="0;0.15;0.8;1"
                  dur="1.9s"
                  begin={begin}
                  repeatCount="indefinite"
                />
              </circle>
            );
          })}
          <circle cx="85" cy="85" r="13" fill="none" stroke="hsl(var(--primary))" strokeWidth="1.5">
            <animate attributeName="r" values="13;26" dur="2.4s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0" dur="2.4s" repeatCount="indefinite" />
          </circle>
        </>
      ) : null}
      <circle cx="85" cy="85" r="13" fill="hsl(var(--primary))" />
    </svg>
  );
}

// Recent blocks as a chain — each bar is a block, the newest is highlighted (and pulses).
function BlockChainStrip({ blocks, animate }: { blocks: number; animate: boolean }) {
  const count = Math.max(blocks, 1);
  const barKeys = useMemo(() => Array.from({ length: count }, () => crypto.randomUUID()), [count]);
  return (
    <div className="flex h-12 items-stretch gap-1.5" aria-hidden="true">
      {barKeys.map((barKey, index) => {
        const isNewest = index === count - 1;
        return (
          <div
            key={barKey}
            className={cn(
              "flex-1 rounded-[4px]",
              isNewest ? "bg-primary" : "bg-secondary",
              isNewest && animate && "animate-pulse",
            )}
          />
        );
      })}
    </div>
  );
}

function ChartCard({
  label,
  value,
  detail,
  tone = "default",
  chart,
  delay,
}: {
  label: string;
  value: string | number;
  detail: string;
  tone?: "default" | "amber" | "incoming";
  chart: React.ReactNode;
  delay: number;
}) {
  const toneClass =
    tone === "amber"
      ? "text-primary"
      : tone === "incoming"
        ? "text-wallet-incoming"
        : "text-foreground";
  return (
    <div
      className="animate-rise-in motion-reduce:animate-none motion-reduce:translate-y-0 motion-reduce:opacity-100 wallet-card flex min-h-[150px] flex-col p-5"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-sm text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 wrap-break-word font-mono text-2xl font-bold tracking-tight",
          toneClass,
        )}
      >
        {value}
      </p>
      <div className="mt-auto pt-4">{chart}</div>
      <p className="mt-2 text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}

function chartPoints(values: number[]) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = 100 / (values.length - 1);
  return values.map((value, index) => [index * stepX, 36 - ((value - min) / span) * 32] as const);
}

function Sparkline({
  values,
  color,
  baseline,
}: {
  values: number[];
  color: string;
  baseline?: number;
}) {
  if (values.length < 2) return <div className="h-12" />;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const line = chartPoints(values)
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const baselineY = baseline !== undefined ? 36 - ((baseline - min) / span) * 32 : null;
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-12 w-full" aria-hidden="true">
      {baselineY !== null ? (
        <line
          x1="0"
          y1={baselineY}
          x2="100"
          y2={baselineY}
          stroke="hsl(var(--border))"
          strokeDasharray="3 4"
        />
      ) : null}
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MiniArea({ values, color }: { values: number[]; color: string }) {
  const gradientId = useId();
  if (values.length < 2) return <div className="h-12" />;
  const line = chartPoints(values)
    .map(([x, y], index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  return (
    <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-12 w-full" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.4} />
          <stop offset="100%" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L100,40 L0,40 Z`} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={1.6}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function MiniBars({ values, color }: { values: number[]; color: string }) {
  const max = Math.max(...values, 1);
  const barKeys = useMemo(() => values.map(() => crypto.randomUUID()), [values]);
  return (
    <div className="flex h-12 items-end gap-1" aria-hidden="true">
      {values.map((value, index) => (
        <div
          key={barKeys[index]}
          className="min-h-[4px] flex-1 rounded-sm"
          style={{ height: `${Math.max((value / max) * 100, 10)}%`, backgroundColor: color }}
        />
      ))}
    </div>
  );
}

function formatHashrate(hps: number) {
  if (hps >= 1e9) return `${(hps / 1e9).toFixed(2)} GH/s`;
  if (hps >= 1e6) return `${(hps / 1e6).toFixed(2)} MH/s`;
  if (hps >= 1e3) return `${(hps / 1e3).toFixed(2)} kH/s`;
  return `${Math.round(hps)} H/s`;
}

function formatDifficulty(difficulty: number) {
  if (difficulty >= 1e9) return `${(difficulty / 1e9).toFixed(2)} G`;
  if (difficulty >= 1e6) return `${(difficulty / 1e6).toFixed(2)} M`;
  return difficulty.toLocaleString();
}

function formatUptime(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours === 0) return `${minutes}m`;
  return `${hours}h ${minutes}m`;
}

function formatRelative(seconds: number) {
  if (seconds < 60) return `${Math.round(seconds)}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}
