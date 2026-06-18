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
import { type RawWalletV1, transactions as txns, type WalletKeys } from "conceal-wallet-sdk";
import { MESSAGE_TX_AMOUNT_ATOMIC } from "@/lib/config/config";
import type { Message } from "@/lib/types";

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

/** Return a NEW blob with the SENT records replaced. */
export function withSentRecords(raw: RawWalletV1, records: SdkMessageRecord[]): RawWalletV1 {
  return { ...raw, [SENT_FIELD]: records };
}

/** Return a NEW blob with the RECEIVED records replaced. */
export function withReceivedRecords(raw: RawWalletV1, records: SdkMessageRecord[]): RawWalletV1 {
  return { ...raw, [RECEIVED_FIELD]: records };
}

/** A short display name for an address with no saved contact. */
export function shortName(address: string): string {
  return address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
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
 * Classification (matching the legacy mapper): the tx must carry a `0x04` message
 * record decryptable with our spend secret (`readMessageFromTransaction.body !==
 * null`) AND we must own the message-marker output — an output of EXACTLY
 * `MESSAGE_TX_AMOUNT_ATOMIC` (100), the tiny self-output the sender pays us to mark
 * the tx as a message (matching the legacy mapper). A normal payment that happens to
 * carry a stray `0x04` tag is therefore NOT surfaced as a message. Our OWN outbound
 * message txs are excluded by the caller via `sentHashes` (their hash is already in
 * `raw.sentMessages`), so a self-send isn't double-counted.
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
  // Inbound only when the body decrypts AND we own the 100-atomic message marker
  // output (legacy classification) — a normal payment with a stray tag is excluded.
  const ownsMessageMarker = result.owned.some(
    (output) => output.amount === MESSAGE_TX_AMOUNT_ATOMIC,
  );
  if (!ownsMessageMarker || result.body === null) return null;

  const blockHeight = typeof scanTx.height === "number" ? scanTx.height : 0;
  const timestampMs =
    typeof options.timestamp === "number" && options.timestamp > 0
      ? options.timestamp * 1000
      : Date.now();

  return {
    id: txHash,
    direction: "received",
    // The sender's address is not recoverable from the tx alone (CryptoNote hides
    // it); use a stable placeholder name keyed off the tx hash.
    counterpartyAddress: "",
    counterpartyName: shortName(txHash),
    body: result.body,
    hasBody: true,
    sentTo: null,
    paymentIdFrom: null,
    paymentIdTo: null,
    timestamp: new Date(timestampMs).toISOString(),
    unread: true,
    blockHeight,
    threadKey: txHash,
    ...(result.ttlUnixSeconds > 0 ? { ttlExpiresAt: result.ttlUnixSeconds } : {}),
  };
}
