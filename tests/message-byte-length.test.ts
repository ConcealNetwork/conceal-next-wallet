import { describe, expect, it } from "vitest";
import { MAX_MESSAGE_SIZE } from "@/lib/config/config";

/**
 * Pins the message-size budget as UTF-8 BYTES, not UTF-16 chars (#gap-messages).
 *
 * The on-chain tx_extra message length field is a SINGLE byte (≤255) and the
 * encrypted blob = body UTF-8 bytes + a 4-byte zero checksum, so the real body
 * ceiling is 255 − 4 = 251 bytes. A 252-char ASCII message — or a shorter
 * multi-byte/emoji message whose UTF-8 length exceeds the budget — passes a
 * naive `.length` (char-count) check but frames corrupt on-chain (the high byte
 * of the length is dropped by `.slice(-2)` in Cn.ts).
 *
 * This mirrors the exact byte-length validation in sendMessageOperation
 * (`new TextEncoder().encode(body).length > MAX_MESSAGE_SIZE`) so it can run in
 * the mock-mode jsdom suite without pulling in wallet-core / the WASM derivation
 * path. The framing itself (single-byte length + 4-byte checksum) is exercised
 * end-to-end in tests/message-decrypt-gate.test.ts against the real WASM.
 */

const CHECKSUM = 4;

// Replica of the sendMessageOperation gate: validate the UTF-8 byte length of
// the body against the byte budget. Returns the error message, or null if OK.
function validateBodySize(body: string): string | null {
  const bodyByteLength = new TextEncoder().encode(body).length;
  if (bodyByteLength > MAX_MESSAGE_SIZE) {
    return `Message exceeds maximum length of ${MAX_MESSAGE_SIZE} bytes.`;
  }
  return null;
}

describe("message byte-length validation (single-byte tx_extra length field)", () => {
  it("budget is 251 bytes = 255 (single-byte ceiling) − 4-byte checksum", () => {
    expect(MAX_MESSAGE_SIZE).toBe(251);
    expect(MAX_MESSAGE_SIZE + CHECKSUM).toBe(255);
    // The framed length (body + checksum) must never exceed a single byte.
    expect(MAX_MESSAGE_SIZE + CHECKSUM).toBeLessThanOrEqual(255);
  });

  it("accepts a 251-byte ASCII body (exactly at the budget → frames to 255)", () => {
    const body = "a".repeat(251);
    expect(new TextEncoder().encode(body).length).toBe(251);
    expect(validateBodySize(body)).toBeNull();
  });

  it("rejects a 252-byte ASCII body (would frame to 256 → high byte dropped)", () => {
    const body = "a".repeat(252);
    expect(new TextEncoder().encode(body).length).toBe(252);
    expect(validateBodySize(body)).toMatch(/exceeds maximum length of 251 bytes/);
  });

  it("rejects a multi-byte/emoji body whose UTF-8 length exceeds the budget despite a smaller char count", () => {
    // "😀" is 1 visible char but 2 UTF-16 code units and 4 UTF-8 BYTES.
    // 63 emoji = 126 UTF-16 code units (well under a 251 char-count check) but
    // 252 UTF-8 bytes (must be rejected) — exactly the silent-corruption case
    // the fix closes: a string that slips under any char-based limit yet
    // overflows the one-byte on-chain length field.
    const body = "😀".repeat(63);
    expect(body.length).toBeLessThanOrEqual(MAX_MESSAGE_SIZE); // UTF-16 char count slips under
    expect(new TextEncoder().encode(body).length).toBe(252); // but the UTF-8 byte count overflows
    expect(validateBodySize(body)).toMatch(/exceeds maximum length of 251 bytes/);
  });

  it("accepts a multi-byte body whose UTF-8 length is exactly at the budget", () => {
    // "é" = 2 UTF-8 bytes. 125 × 2 = 250 bytes + a trailing ASCII char = 251.
    const body = "é".repeat(125) + "a";
    expect(new TextEncoder().encode(body).length).toBe(251);
    expect(validateBodySize(body)).toBeNull();
  });
});
