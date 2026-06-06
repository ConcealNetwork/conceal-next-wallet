import { describe, expect, it } from "vitest";
import {
  addressIsValid,
  generatePaymentId,
  normalizePaymentId,
  paymentIdIsValid,
} from "@/lib/validation/ccx";

// ccx7 prefix + 94 chars = exactly 98 (see addressIsValid). Built so the length
// is self-evidently correct; mirrors the ccx6 wrong-prefix case below.
const VALID_ADDRESS = `ccx7${"a".repeat(94)}`;

describe("ccx validation", () => {
  it("validates ccx7 addresses with exactly 98 characters", () => {
    expect(addressIsValid(VALID_ADDRESS)).toBe(true);
    expect(addressIsValid(`  ${VALID_ADDRESS}  `)).toBe(true);
    expect(addressIsValid("ccx7short")).toBe(false);
    expect(addressIsValid(`ccx6${"a".repeat(94)}`)).toBe(false);
  });

  it("allows empty payment id and validates hex lengths", () => {
    expect(paymentIdIsValid("")).toBe(true);
    expect(paymentIdIsValid("   ")).toBe(true);
    expect(paymentIdIsValid("a".repeat(64))).toBe(true);
    expect(paymentIdIsValid("A".repeat(64))).toBe(true);
    expect(paymentIdIsValid("a".repeat(16))).toBe(true);
    expect(paymentIdIsValid("a".repeat(63))).toBe(false);
    expect(paymentIdIsValid("zzzz")).toBe(false);
  });

  it("generates 64-char lowercase hex payment ids", () => {
    const id = generatePaymentId();
    expect(id).toHaveLength(64);
    expect(paymentIdIsValid(id)).toBe(true);
    expect(id).toMatch(/^[0-9a-f]{64}$/);
    expect(generatePaymentId()).not.toBe(id);
  });

  it("normalizes payment ids to lowercase trimmed strings", () => {
    expect(normalizePaymentId("  ABCD  ")).toBe("abcd");
    expect(normalizePaymentId(undefined)).toBe("");
  });
});
