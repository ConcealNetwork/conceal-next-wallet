// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from "vitest";
import { queueCopy, queueToast } from "@/lib/ui/queue-copy";

describe("queueToast", () => {
  it("says a hung spend may already be on the network, per kind", () => {
    expect(queueToast("deposit", "hung")).toBe(queueCopy.hungToast.deposit);
    expect(queueToast("deposit", "hung")).toMatch(/may already be on the network/);
    expect(queueToast("message", "hung")).not.toMatch(/not submitted/);
  });

  it("says an auto intent was not submitted", () => {
    expect(queueToast("withdraw", "auto")).toBe(queueCopy.queuedToast.withdraw);
  });

  it("has no queue toast for a relay accept", () => {
    expect(queueToast("send", undefined)).toBeUndefined();
  });
});
