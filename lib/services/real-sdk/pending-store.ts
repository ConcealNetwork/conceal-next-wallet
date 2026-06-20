/**
 * Optimistic PENDING outbound transactions, carried inside the encrypted `"wallet"`
 * blob (like sent/received messages). The SDK `WalletState` only advances from scanned
 * MINED blocks, so a just-broadcast tx is invisible for ~1 block — the sender sees no
 * balance change and may resend (#96). We record a pending entry immediately after a
 * successful broadcast so the UI shows the outgoing tx + holds the balance, and:
 *   - exclude the inputs it spent from selection (no accidental double-spend pre-mine),
 *   - reconcile (drop the entry) once the real tx is scanned into state,
 *   - expire stale entries (a tx the network never mined) after {@link PENDING_TTL_MS}.
 *
 * Pure read/write helpers over `raw.pendingTransactions`; no runtime/network imports.
 */
import type { RawWalletV1, WalletState } from "conceal-wallet-sdk";
import { walletNetworkScalars } from "@/lib/config/config";
import type { TransactionType } from "@/lib/types";

/** An optimistic outbound tx awaiting its first confirmation. */
export interface PendingTxRecord {
  /** Transaction hash (matches the scanned tx once mined → reconcile key). */
  hash: string;
  /**
   * Transaction kind, so the optimistic entry renders with the right label/sign while
   * pending (a deposit shows as "deposit", not "send"). Defaults to "send" when absent
   * (older records, plain transfers). #110.
   */
  type?: TransactionType;
  /** Atomic amount that left the wallet (destinations + all fees). */
  amountAtomic: number;
  /** ISO timestamp when the tx was broadcast. */
  timestampIso: string;
  /** Recipient address for display (may be empty). */
  address: string;
  /** Integrated/explicit payment id, when present. */
  paymentId?: string;
  /** Key images the tx spent — excluded from input selection until it mines. */
  spentKeyImages: string[];
  /**
   * The deposit a withdrawal spends (identity = txHash + globalIndex), when this record
   * is a withdrawal (#110). Unlike a normal send, a withdraw consumes a deposit output,
   * which isn't covered by {@link pendingSpentKeyImages} (the deposit isn't in the
   * unspent set) — so we hold the deposit identity here to block a second withdraw of
   * the same deposit in the mempool window (see {@link pendingWithdrawnDepositKeys}).
   */
  depositRef?: { txHash: string; globalIndex: number };
}

const PENDING_FIELD = "pendingTransactions";

/**
 * A broadcast tx not mined within this window is treated as dropped and pruned (which
 * releases its input lock). It MUST be ≥ the network mempool tx lifetime: until that
 * elapses the tx can still be mined, so pruning earlier would unlock its inputs while
 * it's live and let a follow-up send double-spend them (daemon-rejected). Tied to the
 * `cryptonoteMemPoolTxLifetimeSeconds` scalar (12h) so it tracks the network.
 */
export const PENDING_TTL_MS = walletNetworkScalars.cryptonoteMemPoolTxLifetimeSeconds * 1000;

function isPendingRecord(value: unknown): value is PendingTxRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as PendingTxRecord).hash === "string" &&
    typeof (value as PendingTxRecord).amountAtomic === "number"
  );
}

/** Read the persisted pending records from a blob (typed, defensive). */
export function readPendingRecords(raw: RawWalletV1): PendingTxRecord[] {
  const list = raw[PENDING_FIELD];
  return Array.isArray(list) ? list.filter(isPendingRecord) : [];
}

/** Return a NEW blob with the pending records replaced. */
export function withPendingRecords(raw: RawWalletV1, records: PendingTxRecord[]): RawWalletV1 {
  return { ...raw, [PENDING_FIELD]: records };
}

/** Append a pending record (immutably), deduped by hash. */
export function addPendingRecord(raw: RawWalletV1, record: PendingTxRecord): RawWalletV1 {
  const existing = readPendingRecords(raw).filter((entry) => entry.hash !== record.hash);
  return withPendingRecords(raw, [...existing, record]);
}

/** Every key image currently held pending — excluded from input selection. */
export function pendingSpentKeyImages(raw: RawWalletV1): Set<string> {
  const images = new Set<string>();
  for (const record of readPendingRecords(raw)) {
    for (const keyImage of record.spentKeyImages) images.add(keyImage);
  }
  return images;
}

/**
 * Deposit identity keys (`"${txHash}:${globalIndex}"`) currently held pending as
 * withdrawals — each blocks re-selection of the same deposit until its withdraw tx mines
 * and prunes. A withdraw spends a deposit output, which sits outside the
 * {@link pendingSpentKeyImages} lock on regular unspent outputs, so it needs its own
 * gate (#110).
 */
export function pendingWithdrawnDepositKeys(raw: RawWalletV1): Set<string> {
  const keys = new Set<string>();
  for (const record of readPendingRecords(raw)) {
    if (record.type === "withdrawal" && record.depositRef) {
      keys.add(`${record.depositRef.txHash}:${record.depositRef.globalIndex}`);
    }
  }
  return keys;
}

/**
 * Total atomic amount held pending-outbound (for the balance hold). Counts ONLY
 * outbound records — `undefined` (legacy/plain send), `"send"`, or `"fusion"`. A
 * pending deposit (#110) is becoming locked, not leaving (handled as locked elsewhere),
 * and a pending withdrawal is incoming, so both are excluded.
 */
export function pendingOutAtomic(raw: RawWalletV1): number {
  return readPendingRecords(raw)
    .filter(
      (record) => record.type === undefined || record.type === "send" || record.type === "fusion",
    )
    .reduce((sum, record) => sum + Math.max(0, record.amountAtomic), 0);
}

/**
 * Drop pending records that have RECONCILED — their hash now appears in the scanned
 * `state.transactions` (mined + applied) — or that have EXPIRED past
 * {@link PENDING_TTL_MS} (a tx the network never mined). Returns the surviving records,
 * or the same array reference when nothing changed (so callers can skip a persist).
 */
export function prunePendingRecords(
  raw: RawWalletV1,
  state: WalletState,
  nowMs: number,
): PendingTxRecord[] {
  const current = readPendingRecords(raw);
  if (current.length === 0) return current;
  const minedHashes = new Set(state.transactions.map((tx) => tx.hash));
  const survivors = current.filter((record) => {
    if (minedHashes.has(record.hash)) return false; // reconciled with the scanned tx
    const ageMs = nowMs - Date.parse(record.timestampIso);
    if (Number.isFinite(ageMs) && ageMs > PENDING_TTL_MS) return false; // never mined
    return true;
  });
  return survivors.length === current.length ? current : survivors;
}
