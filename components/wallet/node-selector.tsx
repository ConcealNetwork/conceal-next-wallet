"use client";

import { Check, RefreshCw, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useSmartNodes } from "@/lib/hooks";
import { useI18n } from "@/lib/i18n/i18n-provider";
import { fastestNodeUrl, type NodeProbe, probeNodes } from "@/lib/network/node-probe";
import { nodeUrlToPoolHost } from "@/lib/network/smart-nodes";
import { cn } from "@/lib/utils";

/**
 * Node selector (sync-speed work): lists the curated public-node pool with a live LATENCY
 * probe per node so the user can pick a fast one, switch to a specific node, or jump to the
 * fastest healthy one. Switching reuses the settings page's `onUseNode` (custom-node connect).
 * Probing is best-effort + client-side (times `getheight`); it never blocks the list.
 */
export function NodeSelector({
  activeNodeUrl,
  onUseNode,
  onUseFastest,
  busy = false,
}: {
  activeNodeUrl: string;
  /** Connect to a specific node URL. */
  onUseNode: (url: string) => void;
  /** Probe + connect to the fastest healthy node (null → none reachable). */
  onUseFastest: (url: string | null) => void;
  busy?: boolean;
}) {
  const { t } = useI18n();
  const { data: nodes } = useSmartNodes(activeNodeUrl);
  const [probes, setProbes] = useState<Record<string, NodeProbe>>({});
  const [probing, setProbing] = useState(false);
  const probeNonce = useRef(0);
  const activeHost = nodeUrlToPoolHost(activeNodeUrl);

  // Probe `urls` and RETURN the fresh results (also committing them to state for the latest
  // generation). Returning lets "Use fastest" rank a fresh probe rather than stale cache.
  const runProbe = useCallback(async (urls: string[]): Promise<NodeProbe[]> => {
    if (urls.length === 0) return [];
    // Discard a slower in-flight probe if a newer one supersedes it (#174 review).
    const nonce = (probeNonce.current += 1);
    setProbing(true);
    try {
      const results = await probeNodes(urls);
      if (probeNonce.current === nonce) {
        setProbes(Object.fromEntries(results.map((p) => [p.url, p])));
      }
      return results;
    } catch {
      return []; // probeNodes never throws in practice; swallow so probing always resets
    } finally {
      if (probeNonce.current === nonce) setProbing(false);
    }
  }, []);

  // "Use fastest" RE-PROBES on click, then picks from the fresh result — never from a cached
  // probe that may have gone stale/unreachable since (#174 review — Codex).
  const handleUseFastest = useCallback(async () => {
    const fresh = await runProbe((nodes ?? []).map((n) => n.url));
    onUseFastest(fastestNodeUrl(fresh));
  }, [nodes, runProbe, onUseFastest]);

  // Probe once the pool loads, and whenever its membership changes.
  const urlsKey = (nodes ?? []).map((n) => n.url).join("|");
  const probedKey = useRef("");
  useEffect(() => {
    if (urlsKey && urlsKey !== probedKey.current) {
      probedKey.current = urlsKey;
      void runProbe(urlsKey.split("|"));
    }
  }, [urlsKey, runProbe]);

  if (!nodes || nodes.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-foreground">{t("nodeSelector.title")}</span>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={probing}
            onClick={() => void runProbe((nodes ?? []).map((n) => n.url))}
            className="gap-1.5"
          >
            <RefreshCw
              className={cn("size-3.5", probing && "animate-spin motion-reduce:animate-none")}
              aria-hidden="true"
            />
            {probing ? t("nodeSelector.probing") : t("nodeSelector.refresh")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy || probing}
            onClick={() => void handleUseFastest()}
            className="gap-1.5"
          >
            <Zap className="size-3.5" aria-hidden="true" />
            {t("nodeSelector.useFastest")}
          </Button>
        </div>
      </div>

      <ul className="divide-y divide-border/70 rounded-xl border border-border/70">
        {nodes.map((node) => {
          const probe = probes[node.url];
          const isActive = nodeUrlToPoolHost(node.url) === activeHost;
          return (
            <li key={node.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-[13.5px] font-medium text-foreground">
                  <span className="truncate">{node.name}</span>
                  {isActive ? (
                    <Badge variant="outline" className="shrink-0 gap-1 text-primary">
                      <Check className="size-3" aria-hidden="true" />
                      {t("nodeSelector.active")}
                    </Badge>
                  ) : null}
                </p>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <LatencyLabel probe={probe} probing={probing} />
                  {typeof node.poolUptimePercent === "number" ? (
                    <span>
                      · {t("nodeSelector.uptime", { pct: Math.round(node.poolUptimePercent) })}
                    </span>
                  ) : null}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                // Don't let the user pin to a node the latest probe found unreachable — the
                // apply path only checks URL format, so it'd silently switch + toast success
                // (#174 review — GLM/Codex).
                disabled={busy || isActive || probe?.reachable === false}
                onClick={() => onUseNode(node.url)}
              >
                {t("nodeSelector.use")}
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function LatencyLabel({ probe, probing }: { probe?: NodeProbe; probing: boolean }) {
  const { t } = useI18n();
  if (!probe) return <span>{probing ? t("nodeSelector.probing") : "—"}</span>;
  if (!probe.reachable || probe.latencyMs === null) {
    return <span className="text-destructive">{t("nodeSelector.unreachable")}</span>;
  }
  const ms = Math.round(probe.latencyMs);
  const tone =
    ms < 250 ? "text-wallet-incoming" : ms < 800 ? "text-wallet-amber" : "text-muted-foreground";
  return <span className={tone}>{t("nodeSelector.latencyMs", { ms })}</span>;
}
