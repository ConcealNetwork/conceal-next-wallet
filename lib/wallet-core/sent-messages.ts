import { normalizePaymentId } from "@/lib/validation/ccx";

/** Sender-only outgoing message metadata (not on chain; optional wallet blob field). */
export type RawSentMessageRecord = {
  txHash: string;
  messageBody: string;
  /** CCX address of the recipient. */
  receiver: string;
  /** PID embedded in the sent tx (maps to Message.paymentIdTo). Legacy key: paymentId. */
  paymentIdTo?: string;
  /** @deprecated Legacy alias — use paymentIdTo */
  paymentId?: string;
};

export function buildConversationTrackingId(receiver: string, paymentId?: string): string {
  return `${receiver.trim()}:${normalizePaymentId(paymentId)}`;
}

function normalizeEntry(item: unknown): RawSentMessageRecord | null {
  if (!item || typeof item !== "object") return null;
  const raw = item as Record<string, unknown>;
  const txHash = typeof raw.txHash === "string" ? raw.txHash.trim() : "";
  const messageBody = typeof raw.messageBody === "string" ? raw.messageBody : "";
  const receiver = typeof raw.receiver === "string" ? raw.receiver.trim() : "";
  if (!txHash || !messageBody.trim()) return null;

  const record: RawSentMessageRecord = { txHash, messageBody, receiver };
  if (typeof raw.paymentIdTo === "string" && raw.paymentIdTo.trim()) {
    record.paymentIdTo = raw.paymentIdTo.trim();
  } else if (typeof raw.paymentId === "string" && raw.paymentId.trim()) {
    record.paymentIdTo = raw.paymentId.trim();
  }
  return record;
}

/** Accepts v2 array records or legacy v2 map `{ [txHash]: body }`. v1 wallets omit this field. */
export function normalizeSentMessagesFromRaw(raw: unknown): RawSentMessageRecord[] {
  if (raw === null || raw === undefined) return [];

  if (Array.isArray(raw)) {
    return raw.map(normalizeEntry).filter((entry): entry is RawSentMessageRecord => entry !== null);
  }

  if (typeof raw === "object") {
    return Object.entries(raw as Record<string, string>)
      .map(([txHash, messageBody]) => ({
        txHash,
        messageBody: String(messageBody),
        receiver: "",
      }))
      .filter((entry) => entry.txHash && entry.messageBody.trim());
  }

  return [];
}

export function indexSentMessageRecords(
  records: RawSentMessageRecord[],
): Map<string, RawSentMessageRecord> {
  const map = new Map<string, RawSentMessageRecord>();
  for (const record of records) {
    map.set(record.txHash, record);
  }
  return map;
}
