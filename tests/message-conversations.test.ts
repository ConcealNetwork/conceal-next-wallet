import { describe, expect, it } from "vitest";
import {
  buildConversationFromMessage,
  buildMessageConversations,
  buildMessageListContactEntry,
  canReplyToConversation,
  countReceivedMessages,
  resolveConversationPair,
  resolveThreadKey,
} from "@/lib/messages/conversations";
import { buildConversationThreadKey } from "@/lib/messages/thread-key";
import type { AddressEntry, Message } from "@/lib/types";

const CCX_ADDR = (suffix: string) => `ccx7${suffix.padEnd(94, "0").slice(0, 94)}`;

const CONTACT_ADDRESS = CCX_ADDR(
  "ExchKrakenDepositRef000000000000000000000000000000000000000000000000",
);
const ALICE_ADDRESS = CCX_ADDR("AliceWallet000000000000000000000000000000000000000000000000000000");
const BOB_ADDRESS = CCX_ADDR("BobWallet00000000000000000000000000000000000000000000000000000000");
const PID = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7ef099";
const PID_ALICE_FOR_BOB = "1111111111111111111111111111111111111111111111111111111111111111";
const PID_BOB_FOR_ALICE = "2222222222222222222222222222222222222222222222222222222222222222";

const addressBook: AddressEntry[] = [
  {
    id: "addr-1",
    label: "Kraken Exchange",
    address: CONTACT_ADDRESS,
    paymentId: PID,
    avatar: "kraken",
  },
];

function msg(partial: Partial<Message> & Pick<Message, "id" | "direction" | "body">): Message {
  return {
    counterpartyName: "Unknown",
    counterpartyAddress: "recv:abc",
    timestamp: "2026-05-22T00:00:00.000Z",
    unread: false,
    blockHeight: 100,
    threadKey: "recv:abc:",
    hasBody: true,
    paymentIdFrom: null,
    paymentIdTo: null,
    ...partial,
  };
}

describe("message conversations", () => {
  it("merges sent and received into one thread via bilateral PID pair (symmetric exchange)", () => {
    const received = msg({
      id: "r1",
      direction: "received",
      body: "Hello",
      paymentIdFrom: PID,
      paymentIdTo: null,
      counterpartyAddress: `recv:${PID}`,
      threadKey: `recv:${PID}:${PID}`,
      blockHeight: 100,
    });
    const sent = msg({
      id: "s1",
      direction: "sent",
      body: "Hi back",
      hasBody: true,
      sentTo: CONTACT_ADDRESS,
      paymentIdFrom: null,
      paymentIdTo: PID,
      counterpartyAddress: CONTACT_ADDRESS,
      threadKey: `${CONTACT_ADDRESS}:${PID}`,
      blockHeight: 105,
    });

    const all = [received, sent];
    const threads = buildMessageConversations(all, addressBook, new Set());
    expect(threads).toHaveLength(1);
    expect(threads[0].name).toBe("Kraken Exchange");
    expect(threads[0].avatar).toBe("kraken");
    expect(threads[0].established).toBe(true);
    expect(threads[0].paymentIdFrom).toBe(PID);
    expect(threads[0].paymentIdTo).toBe(PID);
    expect(threads[0].messages).toHaveLength(2);
    expect(threads[0].messages[0].body).toBe("Hello");
    expect(threads[0].messages[1].body).toBe("Hi back");
    expect(threads[0].address).toBe(CONTACT_ADDRESS);
    expect(canReplyToConversation(threads[0])).toBe(true);
  });

  it("merges asymmetric P2P threads by { paymentIdFrom, paymentIdTo }", () => {
    const aliceBook: AddressEntry[] = [
      { id: "bob", label: "Bob", address: BOB_ADDRESS, paymentId: PID_ALICE_FOR_BOB },
    ];
    const received = msg({
      id: "r1",
      direction: "received",
      body: "Hi Alice",
      paymentIdFrom: PID_ALICE_FOR_BOB,
      counterpartyAddress: `recv:${PID_ALICE_FOR_BOB}`,
      blockHeight: 100,
    });
    const sent = msg({
      id: "s1",
      direction: "sent",
      body: "Hi Bob",
      sentTo: BOB_ADDRESS,
      counterpartyAddress: BOB_ADDRESS,
      paymentIdTo: PID_BOB_FOR_ALICE,
      blockHeight: 105,
    });

    const all = [received, sent];
    const conversation = buildConversationFromMessage(received, all, aliceBook, new Set());
    expect(conversation.established).toBe(true);
    expect(conversation.paymentIdFrom).toBe(PID_ALICE_FOR_BOB);
    expect(conversation.paymentIdTo).toBe(PID_BOB_FOR_ALICE);
    expect(conversation.messages).toHaveLength(2);
    expect(conversation.threadKey).toBe(
      buildConversationThreadKey(PID_ALICE_FOR_BOB, PID_BOB_FOR_ALICE),
    );
    expect(canReplyToConversation(conversation)).toBe(true);
  });

  it("reply uses paymentIdTo, not contact inbound PID", () => {
    const aliceBook: AddressEntry[] = [
      { id: "bob", label: "Bob", address: BOB_ADDRESS, paymentId: PID_ALICE_FOR_BOB },
    ];
    const received = msg({
      id: "r1",
      direction: "received",
      body: "ping",
      paymentIdFrom: PID_ALICE_FOR_BOB,
      counterpartyAddress: `recv:${PID_ALICE_FOR_BOB}`,
    });
    const sent = msg({
      id: "s1",
      direction: "sent",
      body: "pong",
      sentTo: BOB_ADDRESS,
      paymentIdTo: PID_BOB_FOR_ALICE,
    });

    const conversation = buildConversationFromMessage(
      received,
      [received, sent],
      aliceBook,
      new Set(),
    );
    expect(conversation.paymentIdTo).toBe(PID_BOB_FOR_ALICE);
    expect(conversation.paymentIdFrom).toBe(PID_ALICE_FOR_BOB);
    expect(conversation.paymentIdTo).not.toBe(conversation.paymentIdFrom);
  });

  it("received-only message is a singleton until outbound PID is known", () => {
    const aliceBook: AddressEntry[] = [
      { id: "bob", label: "Bob", address: BOB_ADDRESS, paymentId: PID_ALICE_FOR_BOB },
    ];
    const received = msg({
      id: "r1",
      direction: "received",
      body: "first",
      paymentIdFrom: PID_ALICE_FOR_BOB,
      counterpartyAddress: `recv:${PID_ALICE_FOR_BOB}`,
    });

    const conversation = buildConversationFromMessage(received, [received], aliceBook, new Set());
    expect(conversation.established).toBe(false);
    expect(conversation.messages).toHaveLength(1);
    expect(canReplyToConversation(conversation)).toBe(false);

    const threads = buildMessageConversations([received], aliceBook, new Set());
    expect(threads).toHaveLength(0);
  });

  it("sent-only singleton does not join an established thread", () => {
    const aliceBook: AddressEntry[] = [
      { id: "bob", label: "Bob", address: BOB_ADDRESS, paymentId: PID_ALICE_FOR_BOB },
    ];
    const establishedSent = msg({
      id: "s1",
      direction: "sent",
      body: "thread",
      sentTo: BOB_ADDRESS,
      paymentIdTo: PID_BOB_FOR_ALICE,
      blockHeight: 100,
    });
    const establishedReceived = msg({
      id: "r1",
      direction: "received",
      body: "thread reply",
      paymentIdFrom: PID_ALICE_FOR_BOB,
      blockHeight: 101,
    });
    const singleton = msg({
      id: "s2",
      direction: "sent",
      body: "one-off",
      sentTo: BOB_ADDRESS,
      paymentIdTo: null,
      blockHeight: 102,
    });

    const conversation = buildConversationFromMessage(
      singleton,
      [establishedSent, establishedReceived, singleton],
      aliceBook,
      new Set(),
    );
    expect(conversation.established).toBe(false);
    expect(conversation.messages).toHaveLength(1);
    expect(conversation.messages[0].id).toBe("s2");
  });

  it("uses bilateral pair thread key when established", () => {
    const received = msg({
      id: "r1",
      direction: "received",
      paymentIdFrom: PID,
      body: "x",
    });
    const sent = msg({
      id: "s1",
      direction: "sent",
      paymentIdTo: PID,
      sentTo: CONTACT_ADDRESS,
      body: "y",
    });
    expect(resolveThreadKey(received, addressBook, [received, sent])).toBe(
      buildConversationThreadKey(PID, PID),
    );
  });

  it("counts only received messages for nav badge", () => {
    const messages = [
      msg({ id: "r1", direction: "received", body: "a" }),
      msg({ id: "s1", direction: "sent", body: "b" }),
      msg({ id: "r2", direction: "received", body: "c" }),
    ];
    expect(countReceivedMessages(messages)).toBe(2);
  });

  it("resolves received list contact by inbound payment id for avatar and label", () => {
    const received = msg({
      id: "r1",
      direction: "received",
      body: "Deposit ref",
      paymentIdFrom: PID,
      paymentIdTo: null,
      counterpartyName: `PID ${PID.slice(0, 8)}…`,
      counterpartyAddress: `recv:${PID}`,
      threadKey: `recv:${PID}:${PID}`,
    });

    const entry = buildMessageListContactEntry(received, addressBook);
    expect(entry.label).toBe("Kraken Exchange");
    expect(entry.avatar).toBe("kraken");
    expect(entry.address).toBe(CONTACT_ADDRESS);
  });

  it("does not match received sender by counterparty address (stealth)", () => {
    const aliceBook: AddressEntry[] = [
      { id: "addr-2", label: "Alice", address: ALICE_ADDRESS, avatar: "alice" },
    ];
    const received = msg({
      id: "r1",
      direction: "received",
      body: "hi",
      paymentIdFrom: null,
      counterpartyName: "From abc12345…",
      counterpartyAddress: ALICE_ADDRESS,
    });

    const entry = buildMessageListContactEntry(received, aliceBook);
    expect(entry.label).toBe("From abc12345…");
    expect(entry.avatar).toBeUndefined();
  });

  it("resolves sent list contact by recipient address when pid is absent", () => {
    const sent = msg({
      id: "s1",
      direction: "sent",
      body: "ping",
      sentTo: CONTACT_ADDRESS,
      counterpartyAddress: CONTACT_ADDRESS,
      paymentIdFrom: null,
      paymentIdTo: null,
    });

    const entry = buildMessageListContactEntry(sent, addressBook);
    expect(entry.label).toBe("Kraken Exchange");
    expect(entry.avatar).toBe("kraken");
  });

  it("resolveConversationPair picks up outbound PID from prior sent messages", () => {
    const aliceBook: AddressEntry[] = [
      { id: "bob", label: "Bob", address: BOB_ADDRESS, paymentId: PID_ALICE_FOR_BOB },
    ];
    const sent = msg({
      id: "s1",
      direction: "sent",
      body: "handshake",
      sentTo: BOB_ADDRESS,
      paymentIdTo: PID_BOB_FOR_ALICE,
    });
    const received = msg({
      id: "r1",
      direction: "received",
      body: "reply",
      paymentIdFrom: PID_ALICE_FOR_BOB,
    });

    const pair = resolveConversationPair(received, [sent, received], aliceBook);
    expect(pair.paymentIdFrom).toBe(PID_ALICE_FOR_BOB);
    expect(pair.paymentIdTo).toBe(PID_BOB_FOR_ALICE);
  });
});
