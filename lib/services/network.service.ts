import type { NodeStatus } from "@/lib/types"

export interface NetworkService {
  getNodeStatus(): Promise<NodeStatus>
}
