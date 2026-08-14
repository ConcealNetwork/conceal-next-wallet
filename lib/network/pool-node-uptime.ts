import { findPoolNodeForUrl } from "@/lib/network/smart-nodes";
import type { SmartNode } from "@/lib/types";

/** Pool registry `status.startTime` as unix seconds (0 when unknown). */
export function poolStartSec(node: SmartNode | undefined): number {
  if (!node?.poolStartTime) return 0;
  const ms = Date.parse(node.poolStartTime);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : 0;
}

export function poolStartSecForUrl(nodes: SmartNode[] | undefined, nodeUrl: string): number {
  if (!nodeUrl.trim()) return 0;
  return poolStartSec(findPoolNodeForUrl(nodes ?? [], nodeUrl));
}
