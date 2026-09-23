// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

// @vitest-environment node
import { describe, expect, it } from "vitest";

/**
 * Shallow omitPassword: strip password / currentPassword / newPassword /
 * backupPassword without mutating the input.
 */

describe("omitPassword", () => {
  it("strips password fields and leaves other keys", async () => {
    const { omitPassword } = await import("@/lib/services/real-sdk/omit-password");
    const input = {
      method: "file" as const,
      password: "backup",
      newPassword: "local",
      currentPassword: "cur",
      backupPassword: "bak",
      label: "Main",
      nested: { password: "keep-nested" },
    };
    const copy = omitPassword(input);
    expect(copy).toEqual({
      method: "file",
      label: "Main",
      nested: { password: "keep-nested" },
    });
    expect("password" in copy).toBe(false);
    expect("newPassword" in copy).toBe(false);
    expect("currentPassword" in copy).toBe(false);
    expect("backupPassword" in copy).toBe(false);
  });

  it("does not mutate the input object", async () => {
    const { omitPassword } = await import("@/lib/services/real-sdk/omit-password");
    const input = {
      password: "secret",
      newPassword: "next",
      label: "x",
    };
    const before = structuredClone(input);
    omitPassword(input);
    expect(input).toEqual(before);
  });
});
