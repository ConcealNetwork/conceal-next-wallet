import { AVG_BLOCK_TIME_SECONDS } from "@/lib/config/config";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { getRuntime } from "@/lib/services/real-sdk/runtime";
import type { NetworkService } from "@/lib/services/network.service";
import type { NodeStatus } from "@/lib/types";

/**
 * Node status from the SDK daemon client. Telemetry (difficulty / peer counts /
 * mempool / version) comes from `daemon.getInfo()` (the daemon `getinfo`
 * endpoint), mapped exactly as the legacy `getNodeStatusOperation` did:
 * `peers = white + grey peerlist`, `hashrate = difficulty / avgBlockTime`,
 * `mempool = transactions_pool_size`. Wallet height is the locally-scanned height.
 */
export const realSdkNetworkService: NetworkService = {
  async getNodeStatus(): Promise<NodeStatus> {
    await ensureSdkReady();
    const rt = getRuntime();
    if (rt === null) {
      throw new Error("Wallet is not open. Unlock the wallet to view node status.");
    }

    const info = await rt.daemon.getInfo();
    const networkHeight = info.height;
    const walletHeight = Math.max(0, rt.state.scannedHeight);
    const peers = info.whitePeerlistSize + info.greyPeerlistSize;
    const hashrate = info.difficulty > 0 ? Math.round(info.difficulty / AVG_BLOCK_TIME_SECONDS) : 0;
    const now = Math.floor(Date.now() / 1000);
    const lastBlockSecondsAgo =
      info.startTime > 0 ? Math.max(0, now - info.startTime) : AVG_BLOCK_TIME_SECONDS;
    const version =
      info.version.trim().length > 0
        ? info.version.trim()
        : info.status === "OK"
          ? ""
          : info.status;

    return {
      url: rt.daemon.nodeUrl,
      height: walletHeight,
      networkHeight,
      peers,
      peersOut: info.outgoingConnections,
      peersIn: info.incomingConnections,
      isCustom: Boolean(rt.raw.options?.customNode),
      version,
      difficulty: info.difficulty,
      hashrate,
      mempool: info.txPoolSize,
      lastBlockSecondsAgo,
      avgBlockTimeSeconds: AVG_BLOCK_TIME_SECONDS,
      heightHistory: [networkHeight],
      hashrateHistory: [hashrate],
      peersHistory: [peers],
      blockTimeHistory: [lastBlockSecondsAgo],
    };
  },
};
