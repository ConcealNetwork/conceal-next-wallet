import { AVG_BLOCK_TIME_SECONDS } from "conceal-wallet-sdk";
import { fetchDaemonGetInfo } from "@/lib/network/fetch-getinfo";
import { trackTipBlockAge } from "@/lib/network/tip-block-age";
import type { NetworkService } from "@/lib/services/network.service";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { getRuntime } from "@/lib/services/real-sdk/runtime";
import type { NodeStatus } from "@/lib/types";

/**
 * Node status from one daemon `getinfo` fetch. Parses Conceal-only fields
 * (`last_block_timestamp`, `tx_pool_size`) the SDK client drops.
 */
export const realSdkNetworkService: NetworkService = {
  async getNodeStatus(): Promise<NodeStatus> {
    await ensureSdkReady();
    const rt = getRuntime();
    if (rt === null) {
      throw new Error("Wallet is not open. Unlock the wallet to view node status.");
    }

    const info = await fetchDaemonGetInfo(rt.daemon.nodeUrl);
    const networkHeight = info.height;
    const walletHeight = Math.max(0, rt.state.scannedHeight);
    const peers = info.whitePeerlistSize + info.greyPeerlistSize;
    const hashrate = info.difficulty > 0 ? Math.round(info.difficulty / AVG_BLOCK_TIME_SECONDS) : 0;
    const now = Math.floor(Date.now() / 1000);
    const tipBlockAgeSeconds =
      info.lastBlockTimestamp > 0
        ? Math.max(0, now - info.lastBlockTimestamp)
        : trackTipBlockAge(networkHeight, now, rt.daemon.nodeUrl);
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
      tipBlockTimestamp: info.lastBlockTimestamp > 0 ? info.lastBlockTimestamp : 0,
      tipBlockAgeSeconds,
      heightHistory: [networkHeight],
      hashrateHistory: [hashrate],
      peersHistory: [peers],
      tipBlockAgeHistory: [tipBlockAgeSeconds],
    };
  },
};
