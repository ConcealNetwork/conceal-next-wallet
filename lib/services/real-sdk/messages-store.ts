/**
 * Persisted message records carried inside the encrypted `"wallet"` blob, plus the
 * scan-time reconstruction of INBOUND messages.
 *
 * The SDK's `WalletState` does not retain tx `extra`, so message bodies can't be
 * recovered from state alone. Two record arrays live on the blob:
 *   - `raw.sentMessages`     — sender copies, written at send time (we know the body).
 *   - `raw.receivedMessages` — inbound copies, reconstructed during the sync scan via
 *     the SDK's `readMessageFromTransaction` (decrypts the `0x04` record with our
 *     SPEND secret). Both are deduped by tx hash and survive reload / re-sync.
 *
 * Kept in its own module so `runtime.ts` (writes inbound during sync) and
 * `message.service.ts` (reads / merges / markRead) share one type + read/write
 * surface without a circular import.
 */
import {
  type RawWalletV1,
  transactions as txns,
  type WalletKeys,
  type WalletState,
} from "conceal-wallet-sdk";
import { buildMessageThreadKey } from "@/lib/messages/thread-key";
import type { Message } from "@/lib/types";
import { normalizePaymentId } from "@/lib/validation/ccx";

/** One persisted message (sent or received) in the blob. */
export interface SdkMessageRecord {
  id: string;
  direction: "received" | "sent";
  counterpartyAddress: string;
  counterpartyName: string;
  body: string;
  hasBody: boolean;
  sentTo?: string | null;
  paymentIdFrom: string | null;
  paymentIdTo: string | null;
  timestamp: string;
  unread: boolean;
  blockHeight: number;
  threadKey: string;
  ttlExpiresAt?: number;
}

const SENT_FIELD = "sentMessages";
const RECEIVED_FIELD = "receivedMessages";

function isRecord(value: unknown): value is SdkMessageRecord {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as SdkMessageRecord).id === "string"
  );
}

/** Read the persisted SENT records from a blob (typed, defensive). */
export function readSentRecords(raw: RawWalletV1): SdkMessageRecord[] {
  const list = raw[SENT_FIELD];
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

/** Read the persisted RECEIVED records from a blob (typed, defensive). */
export function readReceivedRecords(raw: RawWalletV1): SdkMessageRecord[] {
  const list = raw[RECEIVED_FIELD];
  return Array.isArray(list) ? list.filter(isRecord) : [];
}

/** Hash-indexed sent/received records for joining onto transaction history. */
export type MessageRecordsByHash = {
  sentByHash: ReadonlyMap<string, SdkMessageRecord>;
  receivedByHash: ReadonlyMap<string, SdkMessageRecord>;
};

/** Build hash lookups from a wallet blob (used by {@link mapTransactions}). */
export function indexMessageRecords(raw: RawWalletV1): MessageRecordsByHash {
  const sentByHash = new Map<string, SdkMessageRecord>();
  for (const record of readSentRecords(raw)) {
    sentByHash.set(record.id, record);
  }
  const receivedByHash = new Map<string, SdkMessageRecord>();
  for (const record of readReceivedRecords(raw)) {
    receivedByHash.set(record.id, record);
  }
  return { sentByHash, receivedByHash };
}

/** Return a NEW blob with the SENT records replaced. */
export function withSentRecords(raw: RawWalletV1, records: SdkMessageRecord[]): RawWalletV1 {
  return { ...raw, [SENT_FIELD]: records };
}

/** Return a NEW blob with the RECEIVED records replaced. */
export function withReceivedRecords(raw: RawWalletV1, records: SdkMessageRecord[]): RawWalletV1 {
  return { ...raw, [RECEIVED_FIELD]: records };
}

/** Clear persisted inbound message copies (used when resetting scan height). */
export function clearReceivedRecords(raw: RawWalletV1): RawWalletV1 {
  return withReceivedRecords(raw, []);
}

/** Merge a fresh scan reconstruction onto a persisted row (keep read-state). */
export function mergeReceivedRecord(
  existing: SdkMessageRecord | undefined,
  inbound: SdkMessageRecord,
): SdkMessageRecord {
  if (!existing) return inbound;
  return {
    ...inbound,
    unread: existing.unread,
    timestamp: existing.timestamp,
  };
}

function receivedRecordChanged(before: SdkMessageRecord, after: SdkMessageRecord): boolean {
  return (
    before.paymentIdFrom !== after.paymentIdFrom ||
    before.threadKey !== after.threadKey ||
    before.counterpartyAddress !== after.counterpartyAddress ||
    before.counterpartyName !== after.counterpartyName ||
    before.body !== after.body ||
    before.blockHeight !== after.blockHeight
  );
}

export function applyInboundScanToReceived(
  received: Map<string, SdkMessageRecord>,
  txHash: string,
  inbound: SdkMessageRecord,
): boolean {
  const existing = received.get(txHash);
  const merged = mergeReceivedRecord(existing, inbound);
  if (!existing || receivedRecordChanged(existing, merged)) {
    received.set(txHash, merged);
    return true;
  }
  return false;
}

/** Map mined tx hashes → block heights from scanned wallet state. */
export function minedHeightsFromState(state: WalletState): ReadonlyMap<string, number> {
  const map = new Map<string, number>();
  for (const tx of state.transactions) {
    if (tx.hash && tx.height > 0) map.set(tx.hash, tx.height);
  }
  return map;
}

/**
 * Sent copies are written at broadcast with `blockHeight: 0`. Patch from mined state so
 * the UI stops showing "Pending" once the tx is in `WalletState`.
 */
export function patchSentMessageBlockHeights(
  records: SdkMessageRecord[],
  minedHeights: ReadonlyMap<string, number>,
): { records: SdkMessageRecord[]; changed: boolean } {
  let changed = false;
  const next = records.map((record) => {
    if (record.direction !== "sent" || record.blockHeight > 0) return record;
    const height = minedHeights.get(record.id);
    if (typeof height === "number" && height > 0) {
      changed = true;
      return { ...record, blockHeight: height };
    }
    return record;
  });
  return { records: changed ? next : records, changed };
}

/**
 * Drop 0-conf received copies whose tx left the mempool without mining (TTL / evicted).
 * Mined rows (blockHeight > 0) and active mempool hashes are kept.
 */
export function pruneStaleMempoolReceived(
  records: SdkMessageRecord[],
  activeMempoolHashes: ReadonlySet<string>,
  minedHashes: ReadonlySet<string>,
): SdkMessageRecord[] {
  return records.filter((record) => {
    if (record.blockHeight !== 0) return true;
    if (minedHashes.has(record.id)) return true;
    return activeMempoolHashes.has(record.id);
  });
}

/** A short display name for an address with no saved contact. */
export function shortName(address: string): string {
  return address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

/**
 * Build a SENT message record from a just-broadcast tx. Shared by the dedicated
 * message flow (`message.service`) and a transfer that carries a message
 * (`transaction.service`) so both persist an identical sender copy.
 */
export function createSentMessageRecord(input: {
  hash: string;
  recipientAddress: string;
  body: string;
  paymentId?: string;
  timestampIso: string;
  ttlExpiresAt?: number;
}): SdkMessageRecord {
  return {
    id: input.hash,
    direction: "sent",
    counterpartyAddress: input.recipientAddress,
    counterpartyName: shortName(input.recipientAddress),
    body: input.body,
    hasBody: true,
    sentTo: input.recipientAddress,
    paymentIdFrom: null,
    paymentIdTo: input.paymentId ?? null,
    timestamp: input.timestampIso,
    unread: false,
    blockHeight: 0,
    threadKey: buildMessageThreadKey(input.recipientAddress, input.paymentId),
    ...(input.ttlExpiresAt && input.ttlExpiresAt > 0 ? { ttlExpiresAt: input.ttlExpiresAt } : {}),
  };
}

/** Map a persisted record to the UI {@link Message}. */
export function toMessage(record: SdkMessageRecord): Message {
  return {
    id: record.id,
    direction: record.direction,
    counterpartyName: record.counterpartyName,
    counterpartyAddress: record.counterpartyAddress,
    body: record.body,
    hasBody: record.hasBody,
    sentTo: record.sentTo ?? null,
    timestamp: record.timestamp,
    unread: record.unread,
    paymentIdFrom: record.paymentIdFrom,
    paymentIdTo: record.paymentIdTo,
    blockHeight: record.blockHeight,
    threadKey: record.threadKey,
    ...(typeof record.ttlExpiresAt === "number" ? { ttlExpiresAt: record.ttlExpiresAt } : {}),
  };
}

/**
 * Reconstruct an INBOUND message record from a scanned transaction, or `null` when
 * the tx carries no message we can read as a received message.
 *
 * Classification: the tx must carry a `0x04` message record that DECRYPTS with our
 * spend secret (`readMessageFromTransaction.body !== null`) AND we must own at least
 * one output in it. Decryption succeeds only when the sender encrypted to our spend
 * key (ECDH), so a successful `body` already proves the message is addressed to us —
 * this surfaces messages on BOTH a dedicated message tx (the 100-atomic marker) AND a
 * regular transfer that carries a message (legacy `Transaction.hasMessage` was
 * amount-agnostic; gating on an exact 100-atomic marker was stricter than legacy and
 * dropped messages attached to real payments). A normal payment with no `0x04` record,
 * or a `0x04` meant for someone else, never decrypts, so it is not surfaced. Our OWN
 * outbound message txs are excluded by the caller via `sentHashes` (their hash is
 * already in `raw.sentMessages`), so a self-send isn't double-counted.
 */
export function reconstructReceivedMessage(
  scanTx: txns.RawTransaction,
  keys: WalletKeys,
  options: { sentHashes: ReadonlySet<string>; timestamp?: number },
): SdkMessageRecord | null {
  const txHash = typeof scanTx.hash === "string" ? scanTx.hash : "";
  if (!txHash || options.sentHashes.has(txHash)) {
    // No hash to dedupe on, or this is one of our own outbound messages.
    return null;
  }

  const result = txns.readMessageFromTransaction(scanTx, keys);
  if (result === null) return null;
  // Inbound when the message decrypts for us (ECDH proves we are the recipient) AND we
  // own an output in the tx — covers a dedicated message (100-atomic marker) and a
  // regular transfer carrying a message alike. Decryption failure (body === null) means
  // it isn't ours; no owned output means we received nothing in it.
  if (result.body === null || result.owned.length === 0) return null;

  const blockHeight = typeof scanTx.height === "number" ? scanTx.height : 0;
  const timestampMs =
    typeof options.timestamp === "number" && options.timestamp > 0
      ? options.timestamp * 1000
      : Date.now();

  const paymentIdFrom = result.paymentId?.trim() ? normalizePaymentId(result.paymentId) : null;
  const counterpartyAddress = paymentIdFrom ? `recv:${paymentIdFrom}` : "";
  const counterpartyName = paymentIdFrom ? `PID ${paymentIdFrom.slice(0, 8)}…` : shortName(txHash);

  return {
    id: txHash,
    direction: "received",
    counterpartyAddress,
    counterpartyName,
    body: result.body,
    hasBody: true,
    sentTo: null,
    paymentIdFrom,
    paymentIdTo: null,
    timestamp: new Date(timestampMs).toISOString(),
    unread: true,
    blockHeight,
    threadKey: paymentIdFrom ? buildMessageThreadKey(counterpartyAddress, paymentIdFrom) : txHash,
    ...(result.ttlUnixSeconds > 0 ? { ttlExpiresAt: result.ttlUnixSeconds } : {}),
  };
}
