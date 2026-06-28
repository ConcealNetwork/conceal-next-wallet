import { buildConversationThreadKey } from "@/lib/messages/thread-key";
import { sortMessagesByHeight } from "@/lib/messages/thread-mappers";
import type { AddressEntry, Message } from "@/lib/types";
import { addressIsValid, normalizePaymentId, paymentIdsMatch } from "@/lib/validation/ccx";

export type ConversationPair = {
  /** Matches received `paymentIdFrom` (contact inbound PID or observed on chain). */
  paymentIdFrom: string | null;
  /** Matches sent `paymentIdTo` (handshake PID — reused on reply, not on the contact). */
  paymentIdTo: string | null;
  /** Counterparty CCX address when known. */
  address: string | null;
};

export type MessageConversation = {
  threadKey: string;
  /** CCX address used for replies; empty when unknown. */
  address: string;
  /** Inbound half — matches received `paymentIdFrom`. */
  paymentIdFrom?: string;
  /** Outbound half — matches sent `paymentIdTo`; used by the reply composer. */
  paymentIdTo?: string;
  /** Both PID halves are known — full bilateral thread. */
  established: boolean;
  name: string;
  avatar?: string;
  messages: Message[];
  last: Message;
  unread: number;
};

export type EstablishedConversationPair = ConversationPair & {
  paymentIdFrom: string;
  paymentIdTo: string;
};

export function isEstablishedConversation(
  pair: ConversationPair,
): pair is EstablishedConversationPair {
  return !!(pair.paymentIdFrom && pair.paymentIdTo);
}

function findContactForMessage(
  addressBook: AddressEntry[],
  message: Message,
): AddressEntry | undefined {
  return findContactForMessages(addressBook, [message]);
}

/** Address book row for message list avatars — received: inbound PID; sent: recipient address. */
export function buildMessageListContactEntry(
  message: Message,
  addressBook: AddressEntry[],
): AddressEntry {
  const contact = findContactForMessage(addressBook, message);
  return {
    id: contact?.id ?? message.id,
    label: contact?.label ?? message.counterpartyName,
    address: contact?.address ?? message.counterpartyAddress,
    paymentId: contact?.paymentId ?? message.paymentIdFrom ?? undefined,
    avatar: contact?.avatar,
  };
}

function findContactByInboundPaymentId(
  addressBook: AddressEntry[],
  paymentId: string | null | undefined,
): AddressEntry | undefined {
  const pid = normalizePaymentId(paymentId ?? undefined);
  if (!pid) return undefined;
  return addressBook.find((entry) => paymentIdsMatch(entry.paymentId, pid));
}

export function findContactForMessages(
  addressBook: AddressEntry[],
  messages: Message[],
): AddressEntry | undefined {
  for (const message of messages) {
    if (message.direction !== "received") continue;
    const byPid = findContactByInboundPaymentId(addressBook, message.paymentIdFrom);
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

function resolveCounterpartyAddress(
  selected: Message,
  contact: AddressEntry | undefined,
  address: string | null,
  all: Message[],
): string | null {
  if (address) return address;
  if (contact?.address) return contact.address;
  if (selected.direction === "sent") {
    const to = selected.sentTo ?? selected.counterpartyAddress;
    if (to && addressIsValid(to)) return to;
  }
  for (const message of all) {
    if (message.direction !== "sent") continue;
    const to = message.sentTo ?? message.counterpartyAddress;
    if (to && addressIsValid(to)) return to;
  }
  return null;
}

/** Derive the bilateral `{ paymentIdFrom, paymentIdTo }` pair for a selected message. */
export function resolveConversationPair(
  selected: Message,
  all: Message[],
  addressBook: AddressEntry[],
): ConversationPair {
  const contact = findContactForMessages(addressBook, [selected]);

  let address: string | null = null;
  if (contact?.address) address = contact.address;
  else if (selected.direction === "sent") {
    const to = selected.sentTo ?? selected.counterpartyAddress;
    if (addressIsValid(to)) address = to;
  }

  let paymentIdFrom: string | null = null;
  if (contact?.paymentId) {
    paymentIdFrom = normalizePaymentId(contact.paymentId) || null;
  }
  if (selected.direction === "received" && selected.paymentIdFrom) {
    paymentIdFrom = normalizePaymentId(selected.paymentIdFrom) || paymentIdFrom;
  }

  let paymentIdTo: string | null = null;
  if (selected.direction === "sent" && selected.paymentIdTo) {
    paymentIdTo = normalizePaymentId(selected.paymentIdTo) || null;
  } else if (selected.direction === "received") {
    for (const message of all) {
      if (message.direction !== "sent" || !message.paymentIdTo) continue;
      const to = message.sentTo ?? message.counterpartyAddress;
      if (address && to !== address) continue;
      paymentIdTo = normalizePaymentId(message.paymentIdTo) || null;
      if (paymentIdTo) break;
    }
  }

  for (const message of all) {
    const to = message.sentTo ?? message.counterpartyAddress;
    const sameAddress = !!(address && message.direction === "sent" && to === address);
    const sameInbound =
      !!(
        paymentIdFrom &&
        message.direction === "received" &&
        paymentIdsMatch(message.paymentIdFrom, paymentIdFrom)
      ) ||
      !!(
        message.direction === "received" &&
        selected.direction === "received" &&
        paymentIdsMatch(message.paymentIdFrom, selected.paymentIdFrom)
      );

    if (!sameAddress && !sameInbound && message.id !== selected.id) continue;

    if (message.direction === "received" && message.paymentIdFrom) {
      const from = normalizePaymentId(message.paymentIdFrom);
      if (!paymentIdFrom) paymentIdFrom = from || null;
    }
    if (!address && message.direction === "sent" && addressIsValid(to)) {
      address = to;
    }
  }

  address = resolveCounterpartyAddress(selected, contact, address, all);

  return { paymentIdFrom, paymentIdTo, address };
}

export function messageMatchesConversationPair(message: Message, pair: ConversationPair): boolean {
  if (!isEstablishedConversation(pair)) return false;

  if (message.direction === "received") {
    return paymentIdsMatch(message.paymentIdFrom ?? undefined, pair.paymentIdFrom);
  }

  const to = message.sentTo ?? message.counterpartyAddress;
  if (pair.address && to !== pair.address) return false;
  return paymentIdsMatch(message.paymentIdTo ?? undefined, pair.paymentIdTo);
}

function filterConversationMessages(
  selected: Message,
  all: Message[],
  addressBook: AddressEntry[],
): Message[] {
  const pair = resolveConversationPair(selected, all, addressBook);
  if (!isEstablishedConversation(pair)) {
    return [selected];
  }
  return all.filter((message) => messageMatchesConversationPair(message, pair));
}

export function conversationThreadKeyForMessage(
  message: Message,
  all: Message[],
  addressBook: AddressEntry[],
): string {
  const pair = resolveConversationPair(message, all, addressBook);
  if (isEstablishedConversation(pair)) {
    return buildConversationThreadKey(pair.paymentIdFrom, pair.paymentIdTo);
  }
  return `msg:${message.id}`;
}

export function buildConversationFromMessage(
  selected: Message,
  all: Message[],
  addressBook: AddressEntry[],
  readThreads: Set<string>,
): MessageConversation {
  const pair = resolveConversationPair(selected, all, addressBook);
  const matched = sortMessagesByHeight(filterConversationMessages(selected, all, addressBook));
  const last = matched[matched.length - 1] ?? selected;
  const contact = findContactForMessages(addressBook, matched.length > 0 ? matched : [selected]);
  const address =
    pair.address ??
    contact?.address ??
    (selected.direction === "sent"
      ? (selected.sentTo ?? selected.counterpartyAddress)
      : (matched.find((m) => m.sentTo)?.sentTo ?? ""));
  const paymentIdFrom = pair.paymentIdFrom ?? undefined;
  const paymentIdTo = pair.paymentIdTo ?? undefined;
  let threadKey: string;
  let established: boolean;
  if (isEstablishedConversation(pair)) {
    established = true;
    threadKey = buildConversationThreadKey(pair.paymentIdFrom, pair.paymentIdTo);
  } else {
    established = false;
    threadKey = `msg:${selected.id}`;
  }
  const name = contact?.label ?? selected.counterpartyName;
  const unread = readThreads.has(threadKey)
    ? 0
    : matched.filter((message) => message.unread && message.direction === "received").length;

  return {
    threadKey,
    address: address && !address.startsWith("recv:") && !address.startsWith("pid:") ? address : "",
    paymentIdFrom,
    paymentIdTo,
    established,
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
    const conversation = buildConversationFromMessage(message, messages, addressBook, readThreads);
    if (!conversation.established) {
      seenMessageIds.add(message.id);
      continue;
    }
    if (seenThreadKeys.has(conversation.threadKey)) {
      seenMessageIds.add(message.id);
      continue;
    }
    seenThreadKeys.add(conversation.threadKey);
    for (const row of conversation.messages) seenMessageIds.add(row.id);
    conversations.push(conversation);
  }

  return conversations.sort(
    (a, b) => new Date(b.last.timestamp).getTime() - new Date(a.last.timestamp).getTime(),
  );
}

/** @deprecated Prefer {@link conversationThreadKeyForMessage}. */
export function resolveThreadKey(
  message: Message,
  addressBook: AddressEntry[],
  all: Message[] = [message],
): string {
  return conversationThreadKeyForMessage(message, all, addressBook);
}

export function canReplyToConversation(conversation: MessageConversation): boolean {
  return addressIsValid(conversation.address) && !!conversation.paymentIdTo;
}

export function countReceivedMessages(messages: readonly Message[]): number {
  return messages.filter((message) => message.direction === "received").length;
}

/** Flat inbox list: newest row first (timestamp primary, block height tie-break). */
export function sortMessagesNewestFirst(messages: Message[]): Message[] {
  return [...messages].sort((a, b) => {
    const timeDiff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
    if (timeDiff !== 0) return timeDiff;
    return b.blockHeight - a.blockHeight;
  });
}
