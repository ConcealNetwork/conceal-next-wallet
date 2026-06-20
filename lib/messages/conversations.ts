import type { AddressEntry, Message } from "@/lib/types";
import { resolveThreadKeyFromMeta, sortMessagesByHeight } from "@/lib/messages/thread-mappers";
import { addressIsValid, normalizePaymentId } from "@/lib/validation/ccx";

export type MessageConversation = {
  threadKey: string;
  /** CCX address used for replies; empty when unknown. */
  address: string;
  /** Inbound PID for this thread (matches received paymentIdFrom). */
  paymentId?: string;
  name: string;
  avatar?: string;
  messages: Message[];
  last: Message;
  unread: number;
};

/** PID that identifies inbound messages in a thread (paymentIdFrom / sent paymentIdTo). */
export function inboundPaymentId(
  message: Pick<Message, "direction" | "paymentIdFrom" | "paymentIdTo">,
): string | null {
  if (message.direction === "received") {
    return normalizePaymentId(message.paymentIdFrom ?? undefined) || null;
  }
  return normalizePaymentId(message.paymentIdTo ?? undefined) || null;
}

export function findContactForMessage(
  addressBook: AddressEntry[],
  message: Message,
): AddressEntry | undefined {
  return findContactForMessages(addressBook, [message]);
}

/** Address book row for message list avatars — received: PID only; sent: PID then recipient address. */
export function buildMessageListContactEntry(
  message: Message,
  addressBook: AddressEntry[],
): AddressEntry {
  const contact = findContactForMessage(addressBook, message);
  return {
    id: contact?.id ?? message.id,
    label: contact?.label ?? message.counterpartyName,
    address: contact?.address ?? message.counterpartyAddress,
    paymentId: contact?.paymentId ?? message.paymentIdFrom ?? message.paymentIdTo ?? undefined,
    avatar: contact?.avatar,
  };
}

function findContactByPaymentId(
  addressBook: AddressEntry[],
  paymentId: string | null | undefined,
): AddressEntry | undefined {
  const pid = normalizePaymentId(paymentId ?? undefined);
  if (!pid) return undefined;
  return addressBook.find((entry) => normalizePaymentId(entry.paymentId) === pid);
}

export function findContactForMessages(
  addressBook: AddressEntry[],
  messages: Message[],
): AddressEntry | undefined {
  for (const message of messages) {
    const byPid = findContactByPaymentId(addressBook, inboundPaymentId(message));
    if (byPid) return byPid;
  }
  for (const message of messages) {
    if (message.direction !== "sent") continue;
    const sentTo = message.sentTo ?? message.counterpartyAddress;
    if (
      sentTo &&
      !sentTo.startsWith("recv:") &&
      !sentTo.startsWith("pid:") &&
      !sentTo.startsWith("sent:")
    ) {
      const byAddress = addressBook.find((entry) => entry.address === sentTo);
      if (byAddress) return byAddress;
    }
  }
  return undefined;
}

export function resolveConversationMatchFromMessage(
  selected: Message,
  addressBook: AddressEntry[],
): { sentToAddress: string | null; receivePaymentId: string | null } {
  const contact = findContactForMessages(addressBook, [selected]);
  const pid = normalizePaymentId(contact?.paymentId) || inboundPaymentId(selected) || null;

  let sentToAddress: string | null = null;
  if (contact?.address) {
    sentToAddress = contact.address;
  } else if (selected.direction === "sent") {
    const to = selected.sentTo ?? selected.counterpartyAddress;
    if (to && !to.startsWith("recv:") && !to.startsWith("pid:") && !to.startsWith("sent:")) {
      sentToAddress = to;
    }
  }

  return { sentToAddress, receivePaymentId: pid || null };
}

/** Messages in the same thread as `selected` (sent→address + received→paymentIdFrom). */
export function filterConversationMessages(
  selected: Message,
  all: Message[],
  addressBook: AddressEntry[],
): Message[] {
  const { sentToAddress, receivePaymentId } = resolveConversationMatchFromMessage(
    selected,
    addressBook,
  );

  return all.filter((message) => {
    if (message.direction === "sent") {
      if (sentToAddress) {
        const to = message.sentTo ?? message.counterpartyAddress;
        if (to === sentToAddress) return true;
      }
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

export function buildConversationFromMessage(
  selected: Message,
  all: Message[],
  addressBook: AddressEntry[],
  readThreads: Set<string>,
): MessageConversation {
  const matched = sortMessagesByHeight(filterConversationMessages(selected, all, addressBook));
  const last = matched[matched.length - 1] ?? selected;
  const contact = findContactForMessages(addressBook, matched.length > 0 ? matched : [selected]);
  const address =
    contact?.address ??
    (selected.direction === "sent"
      ? (selected.sentTo ?? selected.counterpartyAddress)
      : (matched.find((m) => m.sentTo)?.sentTo ?? ""));
  const paymentId = contact?.paymentId ?? inboundPaymentId(selected) ?? undefined;
  const threadKey = resolveThreadKey(selected, addressBook);
  const name = contact?.label ?? selected.counterpartyName;
  const unread = readThreads.has(threadKey)
    ? 0
    : matched.filter((message) => message.unread && message.direction === "received").length;

  return {
    threadKey,
    address: address && !address.startsWith("recv:") && !address.startsWith("pid:") ? address : "",
    paymentId: paymentId ?? undefined,
    name,
    avatar: contact?.avatar,
    messages: matched.length > 0 ? matched : [selected],
    last,
    unread,
  };
}

export function buildMessageConversations(
  messages: Message[],
  addressBook: AddressEntry[],
  readThreads: Set<string>,
): MessageConversation[] {
  const seenMessageIds = new Set<string>();
  const seenThreadKeys = new Set<string>();
  const conversations: MessageConversation[] = [];

  for (const message of messages) {
    if (seenMessageIds.has(message.id)) continue;
    const canonicalKey = resolveThreadKey(message, addressBook);
    if (seenThreadKeys.has(canonicalKey)) {
      seenMessageIds.add(message.id);
      continue;
    }
    const conversation = buildConversationFromMessage(message, messages, addressBook, readThreads);
    seenThreadKeys.add(canonicalKey);
    for (const row of conversation.messages) seenMessageIds.add(row.id);
    conversations.push({ ...conversation, threadKey: canonicalKey });
  }

  return conversations.sort((a, b) => {
    if (a.last.blockHeight !== b.last.blockHeight) {
      return b.last.blockHeight - a.last.blockHeight;
    }
    return new Date(b.last.timestamp).getTime() - new Date(a.last.timestamp).getTime();
  });
}

export function resolveThreadKey(message: Message, addressBook: AddressEntry[]): string {
  return resolveThreadKeyFromMeta(
    addressBook,
    message.sentTo ?? message.counterpartyAddress,
    message.paymentIdFrom ?? message.paymentIdTo ?? undefined,
  );
}

export function canReplyToConversation(conversation: MessageConversation): boolean {
  return addressIsValid(conversation.address);
}

export function countReceivedMessages(messages: readonly Message[]): number {
  return messages.filter((message) => message.direction === "received").length;
}

/** Mempool/pending messages (blockHeight === 0) sort to the top as the newest. */
function listSortHeight(blockHeight: number): number {
  return blockHeight > 0 ? blockHeight : Number.MAX_SAFE_INTEGER;
}

export function sortMessagesNewestFirst(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const ha = listSortHeight(a.blockHeight);
    const hb = listSortHeight(b.blockHeight);
    if (ha !== hb) return hb - ha;
    return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
  });
}
