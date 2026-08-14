import { describe, expect, it } from "vitest";
import { clearPulseMeta } from "@/lib/storage/pulse-meta";
import { dismissPulse, listDismissed, resetPulseDismissed } from "@/lib/storage/pulse-dismiss-store";

const LEGACY_WATCHERS_KEY = "ccx-check-in-watchers";

describe("clearPulseMeta", () => {
  it("removes legacy check-in-watchers key", () => {
    localStorage.setItem(LEGACY_WATCHERS_KEY, JSON.stringify([{ id: "w1" }]));
    clearPulseMeta();
    expect(localStorage.getItem(LEGACY_WATCHERS_KEY)).toBeNull();
  });

  it("clears dismissals when dismissals option is set", () => {
    dismissPulse("tx-a");
    clearPulseMeta({ dismissals: true });
    expect(listDismissed().size).toBe(0);
  });

  it("leaves dismissals when dismissals option is omitted", () => {
    resetPulseDismissed();
    dismissPulse("tx-b");
    clearPulseMeta();
    expect(listDismissed().has("tx-b")).toBe(true);
  });
});
