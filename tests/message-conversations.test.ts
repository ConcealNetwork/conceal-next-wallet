import { describe, expect, it } from "vitest";
import {
  buildMessageConversations,
  buildMessageListContactEntry,
  countReceivedMessages,
  resolveThreadKey,
} from "@/lib/messages/conversations";
import type { AddressEntry, Message } from "@/lib/types";

const CONTACT_ADDRESS =
  "ccx7Exch7J9PpM5rK2sL8nV4xA1zC6eT3wY9uD2fG5hJ8kL1mN4pQ7rS9tV2wX5yZ8aB1cD4eF7gH0jK3mNo";
const PID = "a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7ef099";

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
  it("merges sent and received into one thread via address book + payment id", () => {
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

    const threads = buildMessageConversations([received, sent], addressBook, new Set());
    expect(threads).toHaveLength(1);
    expect(threads[0].name).toBe("Kraken Exchange");
    expect(threads[0].avatar).toBe("kraken");
    expect(threads[0].messages).toHaveLength(2);
    expect(threads[0].messages[0].body).toBe("Hello");
    expect(threads[0].messages[1].body).toBe("Hi back");
    expect(threads[0].address).toBe(CONTACT_ADDRESS);
  });

  it("normalizes recv thread key when contact exists", () => {
    const received = msg({
      id: "r1",
      direction: "received",
      paymentIdFrom: PID,
      paymentIdTo: null,
      counterpartyAddress: `recv:${PID}`,
      threadKey: `recv:${PID}:${PID}`,
      body: "x",
    });
    expect(resolveThreadKey(received, addressBook)).toBe(`${CONTACT_ADDRESS}:${PID}`);
  });

  it("counts only received messages for nav badge", () => {
    const messages = [
      msg({ id: "r1", direction: "received", body: "a" }),
      msg({ id: "s1", direction: "sent", body: "b" }),
      msg({ id: "r2", direction: "received", body: "c" }),
    ];
    expect(countReceivedMessages(messages)).toBe(2);
  });

  it("resolves received list contact by payment id for avatar and label", () => {
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
    const aliceAddress =
      "ccx7AliceWalletAddr2eZ9waDXgsLS7Uc11e2CpNSCWVdxEqSRFAm6P6NQhSb7XMG1D6VAZKmJeaJP37WYQ";
    const aliceBook: AddressEntry[] = [
      { id: "addr-2", label: "Alice", address: aliceAddress, avatar: "alice" },
    ];
    const received = msg({
      id: "r1",
      direction: "received",
      body: "hi",
      paymentIdFrom: null,
      counterpartyName: "From abc12345…",
      counterpartyAddress: aliceAddress,
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
});
