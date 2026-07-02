import { describe, expect, it } from "vitest";
import { createNavBadgeStore } from "@/lib/ui/nav-badge-store";

describe("nav badge store", () => {
  it("tracks delta since sync and clears on acknowledge", () => {
    const store = createNavBadgeStore();
    store.recordAtSync(2);
    expect(store.delta(2)).toBe(0);
    expect(store.delta(5)).toBe(3);
    store.acknowledge(5);
    expect(store.delta(5)).toBe(0);
    expect(store.delta(7)).toBe(2);
  });

  it("resets the baseline", () => {
    const store = createNavBadgeStore();
    store.recordAtSync(4);
    store.reset();
    expect(store.delta(10)).toBe(0);
  });
});
