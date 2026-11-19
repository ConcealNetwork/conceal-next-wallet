// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from "vitest";
import { messageComposeDone } from "@/lib/ui/message-send-plan";

describe("messageComposeDone", () => {
  it("closes the compose dialog and does not open the thread when the message is only an intent", () => {
    for (const queued of ["auto", "hung"] as const) {
      expect(messageComposeDone(queued)).toEqual({
        close: true,
        clearForm: true,
        openThread: false,
      });
    }
  });

  it("closes the compose dialog and opens the thread after a relay accept", () => {
    expect(messageComposeDone(undefined)).toEqual({
      close: true,
      clearForm: true,
      openThread: true,
    });
  });
});
