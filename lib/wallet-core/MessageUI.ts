import type { Message as ApiMessage } from "@/lib/types";
import {
  MESSAGE_TX_AMOUNT_ATOMIC,
  SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC,
  SENT_MESSAGE_AMOUNT_SELF_ATOMIC,
} from "@/lib/config/config";
import { addressIsValid, normalizePaymentId } from "@/lib/validation/ccx";
import type { RawSentMessageRecord } from "./sent-messages";
import { buildConversationTrackingId } from "./sent-messages";
import type { Transaction } from "./Transaction";
import type { RawAddressEntry, Wallet } from "./Wallet";

export type MessageUIType = "sent" | "received";

/** UI-facing message row derived from chain tx + optional local sent copy. */
export class MessageUI {
  txHash: string = "";
  type: MessageUIType = "received";
  /** Recipient CCX address when type is sent; null for received. */
  sentTo: string | null = null;
  /** PID on an incoming message (sender → us). Null on sent. */
  paymentIdFrom: string | null = null;
  /** PID embedded in an outgoing tx (us → recipient). Null on received. Topic threads later. */
  paymentIdTo: string | null = null;
  timestamp: number = 0;
  blockHeight: number = 0;
  /** Null when body is unknown (e.g. sent tx after rescan without local copy). */
  messageBody: string | null = null;
  messageViewed: boolean = false;
  /** Absolute unix seconds; mempool TTL only. */
  ttl: number = 0;

  get hasBody(): boolean {
    return !!this.messageBody?.trim();
  }

  isExpired(nowSeconds = Math.floor(Date.now() / 1000)): boolean {
    return this.ttl > 0 && this.blockHeight === 0 && nowSeconds >= this.ttl;
  }

  static fromRaw(raw: {
    txHash: string;
    type: MessageUIType;
    sentTo?: string | null;
    paymentIdFrom?: string | null;
    paymentIdTo?: string | null;
    timestamp?: number;
    blockHeight?: number;
    messageBody?: string | null;
    messageViewed?: boolean;
    ttl?: number;
  }): MessageUI {
    const message = new MessageUI();
    message.txHash = raw.txHash;
    message.type = raw.type;
    message.sentTo = raw.sentTo ?? null;
    message.paymentIdFrom = raw.paymentIdFrom?.trim() ? raw.paymentIdFrom.trim() : null;
    message.paymentIdTo = raw.paymentIdTo?.trim() ? raw.paymentIdTo.trim() : null;
    message.timestamp = raw.timestamp ?? 0;
    message.blockHeight = raw.blockHeight ?? 0;
    message.messageBody = raw.messageBody ?? null;
    message.messageViewed = raw.messageViewed ?? false;
    message.ttl = raw.ttl ?? 0;
    return message;
  }
}

function getTxAmount(tx: Transaction): number {
  return Math.abs(tx.getAmount());
}

function isSentMessageAmount(amount: number): boolean {
  return amount === SENT_MESSAGE_AMOUNT_SELF_ATOMIC || amount === SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC;
}

export function isMessageTransactionSent(
  tx: Transaction,
  sentRecord?: RawSentMessageRecord,
): boolean {
  const hasBody = !!(tx.message?.trim() || sentRecord?.messageBody?.trim());
  if (!hasBody) return false;
  return isSentMessageAmount(getTxAmount(tx));
}

export function isMessageTransactionReceived(tx: Transaction): boolean {
  if (!tx.message) return false;
  return getTxAmount(tx) === MESSAGE_TX_AMOUNT_ATOMIC;
}

export function isMessageTransaction(tx: Transaction): boolean {
  return isMessageTransactionSent(tx) || isMessageTransactionReceived(tx);
}

function readTxPaymentId(tx: Transaction, sentRecord?: RawSentMessageRecord): string | null {
  const pid =
    tx.paymentId?.trim() ||
    sentRecord?.paymentIdTo?.trim() ||
    sentRecord?.paymentId?.trim() ||
    null;
  return pid || null;
}

/** PID used to match received messages in a conversation thread. */
export function conversationReceivePaymentId(
  message: Pick<MessageUI, "type" | "paymentIdFrom" | "paymentIdTo">,
): string | null {
  if (message.type === "received") {
    return normalizePaymentId(message.paymentIdFrom ?? undefined) || null;
  }
  return normalizePaymentId(message.paymentIdTo ?? undefined) || null;
}

export function mapTransactionToMessageUI(
  tx: Transaction,
  sentRecord?: RawSentMessageRecord,
): MessageUI | null {
  const sent = isMessageTransactionSent(tx, sentRecord);
  const received = isMessageTransactionReceived(tx);
  if (!sent && !received) return null;

  const message = new MessageUI();
  message.txHash = tx.hash;
  message.type = sent ? "sent" : "received";
  message.timestamp = tx.timestamp;
  message.blockHeight = tx.blockHeight;
  message.ttl = tx.ttl;
  message.messageViewed = tx.messageViewed;

  const txPaymentId = readTxPaymentId(tx, sentRecord);
  if (sent) {
    message.paymentIdFrom = null;
    message.paymentIdTo = txPaymentId;
    const receiver = sentRecord?.receiver?.trim() || tx.remoteAddress?.trim() || null;
    message.sentTo = receiver;
    message.messageBody = tx.message?.trim() || sentRecord?.messageBody?.trim() || null;
  } else {
    message.sentTo = null;
    message.paymentIdFrom = txPaymentId;
    message.paymentIdTo = null;
    message.messageBody = tx.message?.trim() || null;
  }

  if (message.isExpired()) return null;

  if (received && !message.hasBody) return null;
  if (sent && !message.hasBody) {
    return message;
  }

  return message;
}

export function resolveMessageUIThreadKey(
  message: MessageUI,
  addressBook: RawAddressEntry[] = [],
): string {
  const pid =
    conversationReceivePaymentId(message) ||
    normalizePaymentId(message.paymentIdFrom ?? undefined) ||
    normalizePaymentId(message.paymentIdTo ?? undefined);
  const sentTo = message.sentTo?.trim() || null;

  if (message.type === "sent" && sentTo && !sentTo.startsWith("sent:")) {
    const contact = addressBook.find((entry) => entry.address === sentTo);
    if (contact?.paymentId) {
      return buildConversationTrackingId(contact.address, contact.paymentId);
    }
    return buildConversationTrackingId(sentTo, pid || undefined);
  }

  if (pid) {
    const contact = addressBook.find((entry) => normalizePaymentId(entry.paymentId) === pid);
    if (contact) {
      return buildConversationTrackingId(contact.address, contact.paymentId);
    }
    if (message.type === "received") {
      return buildConversationTrackingId(`recv:${pid}`, pid);
    }
    if (sentTo && !sentTo.startsWith("recv:") && !sentTo.startsWith("pid:")) {
      return buildConversationTrackingId(sentTo, pid);
    }
    return buildConversationTrackingId(`pid:${pid}`, pid);
  }

  if (sentTo && !sentTo.startsWith("recv:") && !sentTo.startsWith("pid:")) {
    return buildConversationTrackingId(sentTo, undefined);
  }

  return buildConversationTrackingId(
    message.type === "sent" ? `sent:${message.txHash}` : `recv:${message.txHash}`,
    undefined,
  );
}

export function listWalletMessageUIs(wallet: Wallet): MessageUI[] {
  const seen = new Set<string>();
  const rows: MessageUI[] = [];

  for (const tx of wallet.txsMem.concat(wallet.getTransactionsCopy().reverse())) {
    const key = tx.hash || tx.txPubKey;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    wallet.hydrateSentMessageBody(tx);
    const mapped = mapTransactionToMessageUI(tx, wallet.getSentMessageRecord(tx.hash));
    if (mapped) rows.push(mapped);
  }

  return sortMessageUIsByHeight(rows);
}

export function sortMessageUIsByHeight(messages: MessageUI[]): MessageUI[] {
  return [...messages].sort((a, b) => {
    if (a.blockHeight !== b.blockHeight) return b.blockHeight - a.blockHeight;
    if (a.timestamp !== b.timestamp) return b.timestamp - a.timestamp;
    return b.txHash.localeCompare(a.txHash);
  });
}

export function findAddressBookContactForMessageUI(
  message: MessageUI,
  addressBook: RawAddressEntry[],
): RawAddressEntry | undefined {
  const pid = conversationReceivePaymentId(message);
  if (pid) {
    const byPid = addressBook.find((entry) => normalizePaymentId(entry.paymentId) === pid);
    if (byPid) return byPid;
  }
  if (message.sentTo && addressIsValid(message.sentTo)) {
    return addressBook.find((entry) => entry.address === message.sentTo);
  }
  return undefined;
}

export function resolveConversationMatch(
  selected: MessageUI,
  addressBook: RawAddressEntry[],
): { sentToAddress: string | null; receivePaymentId: string | null } {
  const contact = findAddressBookContactForMessageUI(selected, addressBook);
  const pid =
    normalizePaymentId(contact?.paymentId) || conversationReceivePaymentId(selected) || null;

  let sentToAddress: string | null = null;
  if (contact?.address) {
    sentToAddress = contact.address;
  } else if (selected.type === "sent") {
    const to = selected.sentTo;
    if (to && !to.startsWith("sent:")) sentToAddress = to;
  }

  return { sentToAddress, receivePaymentId: pid || null };
}

export function filterConversationMessages(
  selected: MessageUI,
  all: MessageUI[],
  addressBook: RawAddressEntry[],
): MessageUI[] {
  const { sentToAddress, receivePaymentId } = resolveConversationMatch(selected, addressBook);

  return all.filter((message) => {
    if (message.type === "sent") {
      if (sentToAddress && message.sentTo === sentToAddress) return true;
      if (
        receivePaymentId &&
        normalizePaymentId(message.paymentIdTo ?? undefined) === receivePaymentId
      ) {
        return true;
      }
      return false;
    }

    if (receivePaymentId) {
      return normalizePaymentId(message.paymentIdFrom ?? undefined) === receivePaymentId;
    }
    return false;
  });
}

export function resolveMessageUICounterpartyName(
  message: MessageUI,
  addressBook: RawAddressEntry[],
): string {
  const contact = findAddressBookContactForMessageUI(message, addressBook);
  if (contact) return contact.label;

  if (message.type === "sent" && message.sentTo && addressIsValid(message.sentTo)) {
    return truncateAddress(message.sentTo);
  }

  const pid = message.paymentIdFrom ?? message.paymentIdTo;
  if (pid) return `PID ${pid.slice(0, 8)}…`;

  return message.type === "sent"
    ? `To ${message.txHash.slice(0, 8)}…`
    : `From ${message.txHash.slice(0, 8)}…`;
}

function truncateAddress(address: string): string {
  return address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export function messageUIToApiMessage(
  message: MessageUI,
  addressBook: RawAddressEntry[] = [],
): ApiMessage {
  const counterpartyName = resolveMessageUICounterpartyName(message, addressBook);
  const contact = findAddressBookContactForMessageUI(message, addressBook);
  const counterpartyAddress =
    message.type === "sent"
      ? message.sentTo || contact?.address || `sent:${message.txHash}`
      : contact?.address ||
        (message.paymentIdFrom ? `recv:${message.paymentIdFrom}` : `recv:${message.txHash}`);

  const pendingTtl = message.blockHeight === 0 && message.ttl > 0;

  return {
    id: message.txHash,
    direction: message.type,
    counterpartyName,
    counterpartyAddress,
    body: message.messageBody ?? "",
    hasBody: message.hasBody,
    sentTo: message.sentTo,
    timestamp: message.timestamp
      ? new Date(message.timestamp * 1000).toISOString()
      : new Date().toISOString(),
    unread: message.type === "received" ? !message.messageViewed : false,
    paymentIdFrom: message.paymentIdFrom,
    paymentIdTo: message.paymentIdTo,
    blockHeight: message.blockHeight,
    threadKey: resolveMessageUIThreadKey(message, addressBook),
    ttlExpiresAt: pendingTtl ? message.ttl : undefined,
  };
}

export function listWalletMessagesFromUI(wallet: Wallet): ApiMessage[] {
  const addressBook = wallet.listAddressBook();
  return listWalletMessageUIs(wallet).map((row) => messageUIToApiMessage(row, addressBook));
}
