/**
 * Optimistic INCOMING pending transactions (#109) — the recipient-side analogue of
 * {@link ./pending-store}. The SDK `WalletState` only advances from scanned MINED
 * blocks, so a payment addressed to us still sitting in the daemon mempool is
 * invisible until it mines (~1 block). We poll the pool (`getTransactionsPool`),
 * scan each tx for owned outputs, and record the owned amount here so the UI shows
 * an incoming 0-conf row + a "pending in" balance bucket, then:
 *   - reconcile (drop the entry) once the real tx is scanned into state, and
 *   - expire stale entries (a tx that never mined) after {@link PENDING_TTL_MS}.
 *
 * Unlike outbound pending there is NO input/key-image lock — we don't own the
 * inputs, only (some of) the outputs. Pure read/write helpers over
 * `raw.incomingPendingTransactions`; no runtime/network imports.
 */
import type { RawWalletV1, WalletState } from "conceal-wallet-sdk";
import { PENDING_TTL_MS } from "@/lib/services/real-sdk/pending-store";

/** An owned, unconfirmed incoming tx detected in the mempool. */
export interface IncomingPendingRecord {
  /** Transaction hash (matches the scanned tx once mined → reconcile key). */
  hash: string;
  /** Atomic amount received by THIS wallet (sum of owned outputs in the tx). */
  amountAtomic: number;
  /** ISO timestamp the pool entry was first observed. */
  timestampIso: string;
  /** Integrated/explicit payment id, when present. */
  paymentId?: string;
}

const INCOMING_FIELD = "incomingPendingTransactions";

function isIncomingRecord(value: unknown): value is IncomingPendingRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as IncomingPendingRecord).hash === "string" &&
    typeof (value as IncomingPendingRecord).amountAtomic === "number" &&
    (value as IncomingPendingRecord).amountAtomic > 0
  );
}

/** Read the persisted incoming-pending records from a blob (typed, defensive). */
export function readIncomingPendingRecords(raw: RawWalletV1): IncomingPendingRecord[] {
  const list = (raw as Record<string, unknown>)[INCOMING_FIELD];
  return Array.isArray(list) ? list.filter(isIncomingRecord) : [];
}

/** Return a NEW blob with the incoming-pending records replaced. */
export function withIncomingPendingRecords(
  raw: RawWalletV1,
  records: IncomingPendingRecord[],
): RawWalletV1 {
  return { ...raw, [INCOMING_FIELD]: records };
}

/** Total atomic amount currently pending-incoming (for the "pending in" display). */
export function incomingPendingAtomic(raw: RawWalletV1): number {
  return readIncomingPendingRecords(raw).reduce(
    (sum, record) => sum + Math.max(0, record.amountAtomic),
    0,
  );
}

/**
 * Merge freshly-scanned pool records with the persisted ones, then drop any that have
 * RECONCILED (their hash now appears in the scanned `state.transactions` — mined) or
 * EXPIRED past {@link PENDING_TTL_MS}. The fresh scan is authoritative for what's still
 * in the pool, but we keep the earliest `timestampIso` per hash (stable "seen at").
 * Returns the same array reference when nothing changed (so callers can skip a persist).
 */
export function reconcileIncomingPending(
  current: IncomingPendingRecord[],
  scanned: IncomingPendingRecord[],
  state: WalletState,
  nowMs: number,
): IncomingPendingRecord[] {
  const minedHashes = new Set(state.transactions.map((tx) => tx.hash));
  const previousByHash = new Map(current.map((record) => [record.hash, record]));

  const next: IncomingPendingRecord[] = [];
  for (const record of scanned) {
    if (minedHashes.has(record.hash)) continue; // already mined → reconciled
    const prior = previousByHash.get(record.hash);
    next.push(prior ? { ...record, timestampIso: prior.timestampIso } : record);
  }
  // Keep not-yet-rescanned survivors only if still fresh + still unmined (the pool
  // fetch may transiently miss a tx; TTL bounds how long a stale entry lingers).
  const scannedHashes = new Set(scanned.map((r) => r.hash));
  for (const record of current) {
    if (scannedHashes.has(record.hash) || minedHashes.has(record.hash)) continue;
    const ageMs = nowMs - Date.parse(record.timestampIso);
    if (Number.isFinite(ageMs) && ageMs > PENDING_TTL_MS) continue;
    next.push(record);
  }

  if (
    next.length === current.length &&
    next.every(
      (record, i) =>
        current[i]?.hash === record.hash && current[i]?.amountAtomic === record.amountAtomic,
    )
  ) {
    return current;
  }
  return next;
}
