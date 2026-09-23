// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Encrypting… labels on download / change-password / first heavy encrypt. */

function readSrc(...parts: string[]): string {
  return readFileSync(join(process.cwd(), ...parts), "utf8");
}

describe("Encrypting… UX copy", () => {
  it("change-password submit shows Encrypting… while busy", () => {
    const src = readSrc("app/(wallet)/wallet/change-password/page.tsx");
    expect(src).toMatch(/Encrypting…/);
    expect(src).toMatch(/encrypting/);
  });

  it("export download backup shows Encrypting… while busy", () => {
    const src = readSrc("app/(wallet)/wallet/export/page.tsx");
    expect(src).toMatch(/downloading \? "Encrypting…"/);
  });

  it("create finalize shows Encrypting… on first heavy encrypt", () => {
    const src = readSrc("app/(onboarding)/create/page.tsx");
    expect(src).toMatch(/finalizing \? "Encrypting…"/);
  });
});
