/**
 * Mempool scan for INCOMING pending funds (#109). Pure + dependency-injected so it
 * unit-tests without the runtime: given the daemon's pool transactions plus the
 * runtime's daemon→scan bridge and the SDK output scanner, it returns the owned
 * (incoming) amount per pool tx as {@link IncomingPendingRecord}s.
 *
 * The scan fns are injected (rather than imported from `runtime.ts`) to avoid a
 * circular import — `runtime.ts` calls this with its own `toScanTransaction` +
 * `scanTransactionOutputs`, the same path block-sync uses.
 */
import type { DaemonClient, OwnedOutput, RawTransaction, WalletKeys } from "conceal-wallet-sdk";
import type { IncomingPendingRecord } from "@/lib/services/real-sdk/incoming-pending-store";

/** The daemon raw-tx shape (not exported by name); derived from the client method. */
type DaemonRawTransaction = Awaited<ReturnType<DaemonClient["getTransactionsPool"]>>[number];

/** Cap the per-poll scan so a mempool spike can't stall the sync (each tx = one WASM scan). */
const MAX_POOL_SCAN = 200;

export function scanPoolForOwned(
  poolTxs: DaemonRawTransaction[],
  toScanTransaction: (raw: DaemonRawTransaction) => RawTransaction | null,
  scanOutputs: (scanTx: RawTransaction, keys: WalletKeys) => OwnedOutput[],
  keys: WalletKeys,
  nowMs: number,
  options: { maxScan?: number } = {},
): IncomingPendingRecord[] {
  const max = options.maxScan ?? MAX_POOL_SCAN;
  const records: IncomingPendingRecord[] = [];
  const seen = new Set<string>();

  for (const raw of poolTxs.slice(0, max)) {
    if (!raw.hash || seen.has(raw.hash)) continue; // skip no-hash + duplicate pool entries

    let owned: OwnedOutput[];
    try {
      // BOTH the daemon→scan bridge and the scan run inside the try: a malformed pool tx
      // that crashes `toScanTransaction` must skip only that tx, not abort the whole poll.
      const scanTx = toScanTransaction(raw);
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
    records.push({
      hash: raw.hash,
      amountAtomic,
      timestampIso: new Date(tsMs).toISOString(),
    });
  }

  return records;
}
