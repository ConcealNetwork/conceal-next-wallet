import { describe, expect, it } from "vitest";
import {
  dismissPulse,
  listDismissed,
  resetPulseDismissed,
} from "@/lib/storage/pulse-dismiss-store";

describe("pulse dismiss store", () => {
  it("resetPulseDismissed clears dismissed tx ids", () => {
    dismissPulse("tx-a");
    expect(listDismissed().has("tx-a")).toBe(true);
    resetPulseDismissed();
    expect(listDismissed().size).toBe(0);
  });
});
