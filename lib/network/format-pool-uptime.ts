import { poolStartSec } from "@/lib/network/pool-node-uptime";
import { findPoolNodeForUrl } from "@/lib/network/smart-nodes";
import type { SmartNode } from "@/lib/types";

/** Human-readable uptime from elapsed seconds. */
export function formatUptimeSeconds(seconds: number): string {
  if (seconds <= 0) return "—";
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

/** Uptime for one pool entry: now − status.startTime, else status.uptime %. */
export function formatSmartNodeUptime(node: SmartNode | undefined): string {
  if (!node) return "—";

  const startSec = poolStartSec(node);
  if (startSec > 0) {
    return formatUptimeSeconds(Math.max(0, Math.floor(Date.now() / 1000) - startSec));
  }

  if (node.poolUptimePercent !== undefined) {
    return `${Math.round(node.poolUptimePercent)}%`;
  }

  return "—";
}

/** Match pool list row where url.host equals the connected node URL host. */
export function formatPoolUptimeForNodeUrl(
  nodes: SmartNode[] | undefined,
  nodeUrl: string,
): string {
  if (!nodes?.length || !nodeUrl.trim()) return "—";
  return formatSmartNodeUptime(findPoolNodeForUrl(nodes, nodeUrl));
}
