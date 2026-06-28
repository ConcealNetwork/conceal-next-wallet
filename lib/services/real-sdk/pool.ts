/**
 * Mempool scan: owned incoming amounts (#109) + 0-conf inbound message bodies.
 * Scan fns are injected to avoid a circular import with `runtime.ts`.
 */
import type { DaemonClient, OwnedOutput, RawTransaction, WalletKeys } from "conceal-wallet-sdk";
import type { IncomingPendingRecord } from "@/lib/services/real-sdk/incoming-pending-store";
import {
  reconstructReceivedMessage,
  type SdkMessageRecord,
} from "@/lib/services/real-sdk/messages-store";

/** The daemon raw-tx shape (not exported by name); derived from the client method. */
type DaemonRawTransaction = Awaited<ReturnType<DaemonClient["getTransactionsPool"]>>[number];

/** Cap the per-poll scan so a mempool spike can't stall the sync (each tx = one WASM scan). */
const MAX_POOL_SCAN = 200;

export type PoolInboundScan = {
  incoming: IncomingPendingRecord[];
  receivedMessages: SdkMessageRecord[];
};

export function scanPoolForInbound(
  poolTxs: DaemonRawTransaction[],
  toScanTransaction: (raw: DaemonRawTransaction) => RawTransaction | null,
  scanOutputs: (scanTx: RawTransaction, keys: WalletKeys) => OwnedOutput[],
  keys: WalletKeys,
  nowMs: number,
  sentHashes: ReadonlySet<string>,
  options: { maxScan?: number } = {},
): PoolInboundScan {
  const max = options.maxScan ?? MAX_POOL_SCAN;
  const incoming: IncomingPendingRecord[] = [];
  const receivedMessages: SdkMessageRecord[] = [];
  const seen = new Set<string>();

  for (const raw of poolTxs.slice(0, max)) {
    if (!raw.hash || seen.has(raw.hash)) continue;

    let scanTx: RawTransaction | null = null;
    let owned: OwnedOutput[];
    try {
      scanTx = toScanTransaction(raw);
      if (!scanTx) continue;
      owned = scanOutputs(scanTx, keys);
    } catch {
      continue;
    }
    if (owned.length === 0) continue;

    const amountAtomic = owned.reduce((sum, output) => sum + Number(output.amount ?? 0), 0);
    if (!Number.isFinite(amountAtomic) || amountAtomic <= 0) continue;

    const tsMs = Number.isFinite(raw.timestamp) && raw.timestamp > 0 ? raw.timestamp * 1000 : nowMs;
    seen.add(raw.hash);
    incoming.push({
      hash: raw.hash,
      amountAtomic,
      timestampIso: new Date(tsMs).toISOString(),
    });

    const inbound = reconstructReceivedMessage(scanTx, keys, {
      sentHashes,
      timestamp: typeof raw.timestamp === "number" ? raw.timestamp : undefined,
    });
    if (inbound) {
      receivedMessages.push(inbound);
    }
  }

  return { incoming, receivedMessages };
}

/** @deprecated Prefer {@link scanPoolForInbound}; kept for tests that only need amounts. */
export function scanPoolForOwned(
  poolTxs: DaemonRawTransaction[],
  toScanTransaction: (raw: DaemonRawTransaction) => RawTransaction | null,
  scanOutputs: (scanTx: RawTransaction, keys: WalletKeys) => OwnedOutput[],
  keys: WalletKeys,
  nowMs: number,
  options: { maxScan?: number } = {},
): IncomingPendingRecord[] {
  return scanPoolForInbound(
    poolTxs,
    toScanTransaction,
    scanOutputs,
    keys,
    nowMs,
    new Set(),
    options,
  ).incoming;
}
