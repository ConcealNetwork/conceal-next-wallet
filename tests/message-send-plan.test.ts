// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from "vitest";
import { planMessageSend } from "@/lib/ui/message-send-plan";

describe("planMessageSend", () => {
  it("treats a queued auto or hung result as parked", () => {
    expect(planMessageSend("auto")).toBe("parked");
    expect(planMessageSend("hung")).toBe("parked");
  });

  it("treats a broadcast result as sent", () => {
    expect(planMessageSend(undefined)).toBe("sent");
  });
});
