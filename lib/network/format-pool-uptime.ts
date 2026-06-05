import { findPoolNodeForUrl } from "@/lib/network/smart-nodes";
import type { SmartNode } from "@/lib/types";

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

/** Uptime for one pool entry: now − status.startTime, else status.uptime %. */
export function formatSmartNodeUptime(node: SmartNode | undefined): string {
  if (!node) return "—";

  if (node.poolStartTime) {
    const startMs = Date.parse(node.poolStartTime);
    if (Number.isFinite(startMs)) {
      const seconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
      return formatDuration(seconds);
    }
  }

  if (node.poolUptimePercent !== undefined) {
    return `${Math.round(node.poolUptimePercent)}%`;
  }

  return "—";
}

/** Match pool list row where url.host equals the connected node URL host. */
export function formatPoolUptimeForNodeUrl(nodes: SmartNode[] | undefined, nodeUrl: string): string {
  if (!nodes?.length || !nodeUrl.trim()) return "—";
  return formatSmartNodeUptime(findPoolNodeForUrl(nodes, nodeUrl));
}
