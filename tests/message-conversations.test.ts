import { describe, expect, it } from "vitest";
import { buildMessageConversations, resolveThreadKey } from "@/lib/messages/conversations";
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
});
