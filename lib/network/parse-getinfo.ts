export type ParsedGetInfo = {
  height: number;
  difficulty: number;
  txPoolSize: number;
  incomingConnections: number;
  outgoingConnections: number;
  whitePeerlistSize: number;
  greyPeerlistSize: number;
  /** Unix seconds when the daemon booted; omitted on some Conceal nodes. */
  startTime: number;
  /** Unix seconds when the tip block was mined. */
  lastBlockTimestamp: number;
  version: string;
  status: string;
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

/** Map a daemon `getinfo` JSON body (Conceal + CryptoNote field names). */
export function parseGetInfo(body: Record<string, unknown>): ParsedGetInfo {
  if (body.status !== "OK") {
    const status = typeof body.status === "string" ? body.status : "unknown";
    throw new Error(`Daemon getinfo returned a non-OK status (${status}).`);
  }

  return {
    height: num(body.height),
    difficulty: num(body.difficulty),
    txPoolSize: num(body.tx_pool_size) || num(body.transactions_pool_size),
    incomingConnections: num(body.incoming_connections_count),
    outgoingConnections: num(body.outgoing_connections_count),
    whitePeerlistSize: num(body.white_peerlist_size),
    greyPeerlistSize: num(body.grey_peerlist_size),
    startTime: num(body.start_time),
    lastBlockTimestamp: num(body.last_block_timestamp),
    version: typeof body.version === "string" ? body.version : "",
    status: typeof body.status === "string" ? body.status : "",
  };
}
