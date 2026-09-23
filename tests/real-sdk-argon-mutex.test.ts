// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { afterEach, describe, expect, it } from "vitest";
import { _resetArgonMutex, withArgonMutex } from "@/lib/services/real-sdk/persistence";

/**
 * Cheap Argon2 FIFO unit test — fake async jobs only (no live 32 MiB Argon2).
 * @see wallet-change-password spec Argon2 serialization
 */

afterEach(() => {
  _resetArgonMutex();
});

describe("withArgonMutex FIFO", () => {
  it("second caller waits until the first finishes (does not reject as busy)", async () => {
    const order: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withArgonMutex(async () => {
      order.push("first-enter");
      await firstGate;
      order.push("first-leave");
      return 1;
    });

    // Let the first job acquire the mutex before starting the second.
    await Promise.resolve();
    await Promise.resolve();

    const second = withArgonMutex(async () => {
      order.push("second-enter");
      return 2;
    });

    expect(order).toEqual(["first-enter"]);
    releaseFirst();

    await expect(Promise.all([first, second])).resolves.toEqual([1, 2]);
    expect(order).toEqual(["first-enter", "first-leave", "second-enter"]);
  });
});
