// Copyright (c) 2026 Conceal Network, Conceal Devs
// SPDX-License-Identifier: BSD-3-Clause

import { describe, expect, it } from "vitest";
import {
  parseDaemonHeight,
  pickPinnedHeight,
  readPinnedHeight,
  shouldWritePin,
} from "@/lib/config/release-pin.mjs";

/**
 * `npm run release:pin` guards: a refresh writes, no reachable node leaves the
 * pin untouched, a lower height is refused, and `--force` overrides the refusal.
 */

const NODE_A = "https://explorer.conceal.network/daemon/";
const NODE_B = "https://ccxapi.conceal.network/daemon/";

const ok = (height: number) => ({ status: "OK", height });
const failed = (nodeUrl: string) => ({ nodeUrl, body: null, error: "fetch failed" });
const answered = (nodeUrl: string, body: unknown) => ({ nodeUrl, body });

describe("parseDaemonHeight", () => {
  it("accepts an OK status with a positive safe-integer height", () => {
    expect(parseDaemonHeight(ok(2207562))).toBe(2207562);
  });

  it("rejects a non-OK or missing status", () => {
    expect(() => parseDaemonHeight({ status: "BUSY", height: 2207562 })).toThrow(/status "BUSY"/);
    expect(() => parseDaemonHeight({ height: 2207562 })).toThrow(/status "missing"/);
    expect(() => parseDaemonHeight(null)).toThrow(/status "missing"/);
  });

  it("rejects a height that is not a positive safe integer", () => {
    for (const height of [0, -5, 2207562.5, "2207562", null, undefined]) {
      expect(() => parseDaemonHeight(ok(height as number))).toThrow(/invalid height/);
    }
  });
});

describe("readPinnedHeight", () => {
  it("reads the pinned height", () => {
    expect(readPinnedHeight('{"version":"0.1.3","heightAtVersion":2207562}')).toBe(2207562);
  });

  it("returns 0 for a missing, unparsable or invalid pin", () => {
    for (const text of [
      "",
      "not json",
      "{}",
      '{"heightAtVersion":"2207562"}',
      '{"heightAtVersion":0}',
      '{"heightAtVersion":-1}',
      '{"heightAtVersion":1.5}',
    ]) {
      expect(readPinnedHeight(text)).toBe(0);
    }
  });
});

describe("pickPinnedHeight", () => {
  it("uses the first node's valid height", () => {
    const picked = pickPinnedHeight([answered(NODE_A, ok(2207562))]);
    expect(picked.height).toBe(2207562);
    expect(picked.source).toBe(NODE_A);
    expect(picked.errors).toEqual([]);
  });

  it("falls through to the next node when the first request failed", () => {
    const picked = pickPinnedHeight([failed(NODE_A), answered(NODE_B, ok(2207562))]);
    expect(picked.height).toBe(2207562);
    expect(picked.source).toBe(NODE_B);
    expect(picked.errors).toEqual([`${NODE_A}: fetch failed`]);
  });

  it("falls through to the next node when the first answer is unusable", () => {
    const picked = pickPinnedHeight([
      answered(NODE_A, { status: "BUSY", height: 2207562 }),
      answered(NODE_B, ok(2207560)),
    ]);
    expect(picked.height).toBe(2207560);
    expect(picked.source).toBe(NODE_B);
  });

  it("returns no height (one reason per node) when no node is usable", () => {
    const picked = pickPinnedHeight([failed(NODE_A), answered(NODE_B, ok(0))]);
    expect(picked.height).toBeNull();
    expect(picked.source).toBe("");
    expect(picked.errors).toEqual([`${NODE_A}: fetch failed`, `${NODE_B}: invalid height "0"`]);
  });

  it("returns no height when there are no outcomes at all", () => {
    expect(pickPinnedHeight([]).height).toBeNull();
  });
});

describe("shouldWritePin", () => {
  it("refreshes to a higher or equal height", () => {
    expect(shouldWritePin(2207562, 2207600)).toBe(true);
    expect(shouldWritePin(2207562, 2207562)).toBe(true);
  });

  it("refuses a lower height", () => {
    expect(shouldWritePin(2207600, 2207562)).toBe(false);
  });

  it("allows a lower height with --force", () => {
    expect(shouldWritePin(2207600, 2207562, true)).toBe(true);
  });

  it("always writes when there is no usable pin yet", () => {
    expect(shouldWritePin(0, 1)).toBe(true);
  });
});
