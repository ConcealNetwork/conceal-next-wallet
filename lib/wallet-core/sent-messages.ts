/*
 * Copyright (c) 2018 Gnock
 * Copyright (c) 2018-2019 The Masari Project
 * Copyright (c) 2018-2020 The Karbo developers
 * Copyright (c) 2018-2026 Conceal Community, Conceal.Network & Conceal Devs
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

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
