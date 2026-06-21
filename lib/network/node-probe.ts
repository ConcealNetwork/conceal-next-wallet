/**
 * Node latency probing + ranking for smart node selection (sync-speed work). Times each
 * node's `getheight` round-trip (via {@link testNodeUrlReachability}) so the UI can show
 * per-node latency and the wallet can pick the FASTEST healthy node. Ranking is pure +
 * dependency-light so it unit-tests without the network; the probe itself is DI'd on a clock.
 *
 * "Healthy" = reachable AND not stale (its tip within {@link NODE_LAG_WARN_BLOCKS} of the
 * best height seen) — a fast node that's behind the chain is useless for sync. This selects a
 * single home node; sharing fetch load across several nodes mid-sync is a separate phase.
 */
import { NODE_LAG_WARN_BLOCKS } from "@/lib/network/node-lag";
import { testNodeUrlReachability } from "@/lib/validation/node-url";

export type NodeProbe = {
  url: string;
  reachable: boolean;
  /** Round-trip ms for `getheight`, or null when unreachable. */
  latencyMs: number | null;
  /** The node's reported tip, or null when unreachable. */
  height: number | null;
};

/** Probe one node: time its `getheight`. Never throws — an unreachable node returns nulls. */
export async function probeNode(
  url: string,
  now: () => number = () => Date.now(),
): Promise<NodeProbe> {
  const start = now();
  try {
    const height = await testNodeUrlReachability(url);
    return { url, reachable: true, latencyMs: Math.max(0, now() - start), height };
  } catch {
    return { url, reachable: false, latencyMs: null, height: null };
  }
}

/** Probe many nodes concurrently. */
export async function probeNodes(
  urls: readonly string[],
  now: () => number = () => Date.now(),
): Promise<NodeProbe[]> {
  return Promise.all(urls.map((url) => probeNode(url, now)));
}

/**
 * Healthy probes (reachable + tip within `lagThreshold` of the best height), sorted fastest
 * first. Pure. A node with no successful height never ranks. Empty when none qualify.
 */
export function rankNodes(
  probes: readonly NodeProbe[],
  lagThreshold: number = NODE_LAG_WARN_BLOCKS,
): NodeProbe[] {
  const bestHeight = Math.max(0, ...probes.map((p) => p.height ?? 0));
  return probes
    .filter(
      (p): p is NodeProbe & { latencyMs: number; height: number } =>
        p.reachable && p.latencyMs !== null && p.height !== null,
    )
    .filter((p) => p.height >= bestHeight - lagThreshold)
    .sort((a, b) => a.latencyMs - b.latencyMs);
}

/** The fastest healthy non-stale node URL, or null when none qualify. */
export function fastestNodeUrl(
  probes: readonly NodeProbe[],
  lagThreshold: number = NODE_LAG_WARN_BLOCKS,
): string | null {
  return rankNodes(probes, lagThreshold)[0]?.url ?? null;
}
