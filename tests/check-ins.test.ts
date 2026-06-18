import { describe, expect, it } from "vitest";
import type { Message } from "@/lib/types";
import { formatCheckIn } from "@/lib/ui/check-in-message";
import {
  checkInStatus,
  countOverdue,
  daysSince,
  hasFreshCheckIn,
  lastCheckInForWatcher,
  lastReceivedForWatcher,
  lastReceivedFrom,
  messageMatchesWatcher,
  overdueInstanceKeys,
  type WatchedContact,
} from "@/lib/ui/check-ins";

const BOB = "ccx7bob";

function msg(over: Partial<Message>): Message {
  return {
    id: Math.random().toString(36),
    direction: "received",
    counterpartyName: "Bob",
    counterpartyAddress: BOB,
    body: "hi",
    hasBody: true,
    timestamp: "2026-01-01T00:00:00.000Z",
    unread: false,
    paymentIdFrom: null,
    ...over,
  } as Message;
}

function watcher(over: Partial<WatchedContact> = {}): WatchedContact {
  return { id: "w1", address: BOB, label: "Bob", intervalDays: 14, graceDays: 7, ...over };
}

describe("messageMatchesWatcher (PID tightening)", () => {
  it("address-only when the watcher has no PID", () => {
    expect(messageMatchesWatcher(msg({}), watcher())).toBe(true);
    expect(messageMatchesWatcher(msg({ counterpartyAddress: "ccx7other" }), watcher())).toBe(false);
  });
  it("requires BOTH address and PID when the watcher has a PID (anti-spoof)", () => {
    const w = watcher({ paymentId: "abc123" });
    expect(messageMatchesWatcher(msg({ paymentIdFrom: "abc123" }), w)).toBe(true);
    expect(messageMatchesWatcher(msg({ paymentIdFrom: "wrong" }), w)).toBe(false);
    // Right PID but wrong address (a spoof from a different wallet) → no match.
    expect(
      messageMatchesWatcher(msg({ paymentIdFrom: "abc123", counterpartyAddress: "ccx7evil" }), w),
    ).toBe(false);
  });
  it("ignores sent messages", () => {
    expect(messageMatchesWatcher(msg({ direction: "sent" }), watcher())).toBe(false);
  });
});

describe("check-in freshness (indicator)", () => {
  const checkin = formatCheckIn("alive");
  it("lastCheckInForWatcher only counts parseable check-in bodies", () => {
    const messages = [
      msg({ body: "just chatting", timestamp: "2026-02-10T00:00:00.000Z" }),
      msg({ body: checkin, timestamp: "2026-02-05T00:00:00.000Z" }),
    ];
    expect(lastCheckInForWatcher(messages, watcher())).toBe("2026-02-05T00:00:00.000Z");
    // A plain message is still the newest *received* (drives the overdue clock)…
    expect(lastReceivedForWatcher(messages, watcher())).toBe("2026-02-10T00:00:00.000Z");
  });
  it("hasFreshCheckIn true within interval+grace, false when stale or paused", () => {
    const w = watcher(); // 14 + 7
    const fresh = [msg({ body: checkin, timestamp: "2026-02-01T00:00:00.000Z" })];
    expect(hasFreshCheckIn(w, fresh, "2026-02-10T00:00:00.000Z")).toBe(true);
    expect(hasFreshCheckIn(w, fresh, "2026-03-15T00:00:00.000Z")).toBe(false); // overdue
    expect(hasFreshCheckIn(watcher({ paused: true }), fresh, "2026-02-10T00:00:00.000Z")).toBe(
      false,
    );
    // No check-in messages → no indicator even if plain messages exist.
    expect(hasFreshCheckIn(w, [msg({ body: "hi" })], "2026-01-01T12:00:00.000Z")).toBe(false);
  });
});

describe("lastReceivedFrom", () => {
  it("returns the newest received message timestamp from the address", () => {
    const messages = [
      msg({ timestamp: "2026-01-01T00:00:00.000Z" }),
      msg({ timestamp: "2026-02-01T00:00:00.000Z" }),
      msg({ direction: "sent", timestamp: "2026-03-01T00:00:00.000Z" }), // sent → ignored
      msg({ counterpartyAddress: "ccx7other", timestamp: "2026-04-01T00:00:00.000Z" }), // other → ignored
    ];
    expect(lastReceivedFrom(messages, BOB)).toBe("2026-02-01T00:00:00.000Z");
  });

  it("returns null when no received message from the address", () => {
    expect(lastReceivedFrom([msg({ direction: "sent" })], BOB)).toBeNull();
    expect(lastReceivedFrom([], BOB)).toBeNull();
  });
});

describe("checkInStatus", () => {
  const last = "2026-01-01T00:00:00.000Z"; // interval 14d → due 2026-01-15, overdue 2026-01-22

  it("ok before the interval elapses", () => {
    expect(checkInStatus(watcher(), last, "2026-01-10T00:00:00.000Z")).toBe("ok");
  });
  it("due-soon inside the grace window", () => {
    expect(checkInStatus(watcher(), last, "2026-01-18T00:00:00.000Z")).toBe("due-soon");
  });
  it("overdue past interval + grace", () => {
    expect(checkInStatus(watcher(), last, "2026-01-25T00:00:00.000Z")).toBe("overdue");
  });
  it("waiting when nothing has been heard", () => {
    expect(checkInStatus(watcher(), null, "2026-06-01T00:00:00.000Z")).toBe("waiting");
  });
  it("paused when explicitly paused", () => {
    expect(checkInStatus(watcher({ paused: true }), last, "2026-06-01T00:00:00.000Z")).toBe(
      "paused",
    );
  });
  it("paused while snoozed, then evaluates normally after", () => {
    const w = watcher({ snoozedUntil: "2026-02-01T00:00:00.000Z" });
    expect(checkInStatus(w, last, "2026-01-25T00:00:00.000Z")).toBe("paused"); // within snooze
    expect(checkInStatus(w, last, "2026-02-02T00:00:00.000Z")).toBe("overdue"); // snooze elapsed
  });
});

describe("countOverdue", () => {
  it("counts only overdue, honoring last-heard per address", () => {
    const now = "2026-03-01T00:00:00.000Z";
    const messages = [msg({ counterpartyAddress: BOB, timestamp: "2026-02-28T00:00:00.000Z" })]; // Bob fresh
    const watchers = [
      watcher({ id: "bob", address: BOB }), // heard yesterday → ok
      watcher({ id: "mum", address: "ccx7mum" }), // never heard → waiting (not overdue)
      watcher({ id: "srv", address: "ccx7srv", intervalDays: 1, graceDays: 0 }), // never heard → waiting
    ];
    expect(countOverdue(watchers, messages, now)).toBe(0);
    // Make one overdue: a stale last-heard.
    const stale = [msg({ counterpartyAddress: "ccx7mum", timestamp: "2026-01-01T00:00:00.000Z" })];
    expect(countOverdue([watcher({ address: "ccx7mum" })], stale, now)).toBe(1);
  });
});

describe("daysSince", () => {
  it("whole days, clamped at zero", () => {
    expect(daysSince("2026-01-01T00:00:00.000Z", "2026-01-04T00:00:00.000Z")).toBe(3);
    expect(daysSince("2026-01-04T00:00:00.000Z", "2026-01-01T00:00:00.000Z")).toBe(0);
  });
});

describe("overdueInstanceKeys (per-instance de-dupe for alerts)", () => {
  const now = "2026-03-01T00:00:00.000Z";

  it("keys only overdue contacts by id + last-heard", () => {
    const stale = [msg({ counterpartyAddress: BOB, timestamp: "2026-01-01T00:00:00.000Z" })];
    const keys = overdueInstanceKeys([watcher({ id: "bob", address: BOB })], stale, now);
    expect(keys).toEqual(["bob@2026-01-01T00:00:00.000Z"]);
  });

  it("omits fresh, waiting, and paused contacts", () => {
    const messages = [msg({ counterpartyAddress: BOB, timestamp: "2026-02-28T00:00:00.000Z" })];
    const watchers = [
      watcher({ id: "bob", address: BOB }), // fresh → ok
      watcher({ id: "mum", address: "ccx7mum" }), // never heard → waiting
      watcher({ id: "srv", address: "ccx7srv", paused: true }), // paused
    ];
    expect(overdueInstanceKeys(watchers, messages, now)).toEqual([]);
  });

  it("mints a fresh key once a newer message advances last-heard", () => {
    const w = watcher({ id: "bob", address: BOB });
    const old = [msg({ counterpartyAddress: BOB, timestamp: "2026-01-01T00:00:00.000Z" })];
    const [firstKey] = overdueInstanceKeys([w], old, now);
    // A newer (but still stale relative to now) message changes the basis.
    const newer = [msg({ counterpartyAddress: BOB, timestamp: "2026-01-15T00:00:00.000Z" })];
    const [secondKey] = overdueInstanceKeys([w], newer, now);
    expect(secondKey).not.toBe(firstKey);
  });
});
