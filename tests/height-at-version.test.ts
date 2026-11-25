// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HEIGHT_AT_VERSION, resolveCreationHeight } from "@/lib/config/height-at-version";
import releasePin from "@/lib/config/release-pin.json";

const packageVersion: string = JSON.parse(
  readFileSync(join(process.cwd(), "package.json"), "utf8"),
).version;

describe("release pin file", () => {
  it("pins the current package.json version", () => {
    expect(releasePin.version).toBe(packageVersion);
  });

  it("pins a positive safe-integer mainnet height", () => {
    expect(Number.isSafeInteger(releasePin.heightAtVersion)).toBe(true);
    expect(releasePin.heightAtVersion).toBeGreaterThan(0);
  });

  it("exposes the pinned height as HEIGHT_AT_VERSION", () => {
    expect(HEIGHT_AT_VERSION).toBe(releasePin.heightAtVersion);
  });
});

describe("resolveCreationHeight", () => {
  const PIN = 2_000_000;

  it("uses the daemon tip when it is usable", () => {
    expect(resolveCreationHeight(2_100_000, PIN)).toBe(2_100_000);
  });

  it("floors a fractional daemon height", () => {
    expect(resolveCreationHeight(2_100_000.9, PIN)).toBe(2_100_000);
  });

  it("falls back to the pin when getHeight threw (undefined)", () => {
    expect(resolveCreationHeight(undefined, PIN)).toBe(PIN);
  });

  it("falls back to the pin when the daemon returned 0", () => {
    expect(resolveCreationHeight(0, PIN)).toBe(PIN);
  });

  it("falls back to the pin when the daemon returned a negative height", () => {
    expect(resolveCreationHeight(-5, PIN)).toBe(PIN);
  });

  it("falls back to the pin when the daemon returned a non-finite height", () => {
    expect(resolveCreationHeight(Number.NaN, PIN)).toBe(PIN);
    expect(resolveCreationHeight(Number.POSITIVE_INFINITY, PIN)).toBe(PIN);
  });

  it("defaults the pin to the shipped HEIGHT_AT_VERSION", () => {
    expect(resolveCreationHeight(undefined)).toBe(HEIGHT_AT_VERSION);
    expect(resolveCreationHeight(1)).toBe(1);
  });

  it("returns 0 only when the pin itself is unusable", () => {
    expect(resolveCreationHeight(undefined, 0)).toBe(0);
    expect(resolveCreationHeight(Number.NaN, -1)).toBe(0);
    expect(resolveCreationHeight(undefined, Number.NaN)).toBe(0);
  });
});
