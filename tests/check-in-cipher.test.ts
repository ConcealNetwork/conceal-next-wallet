import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { isKnownSmartMessage } from "@/lib/messages/smart-message";
import { formatCheckIn, parseCheckIn } from "@/lib/ui/check-in-message";

/**
 * Verifies the smart-message cipher path against the REAL conceal-lib-js WASM
 * (the same `cypher` the wallet bundles), so CI covers the ChaCha12 primitive +
 * the wallet's encrypt/decrypt scheme (4-byte zero checksum + smart-message
 * gate) — not just the pure parsing. The full wallet derivation path is still
 * real-mode only; this pins the cipher contract.
 */

const CYPHER_DIR = `${process.cwd()}/node_modules/conceal-lib-js/src/wasm/cypher`;
const CHECKSUM = 4;

let chacha8: (k: Uint8Array, n: Uint8Array, d: Uint8Array) => Uint8Array;
let chacha12: (k: Uint8Array, n: Uint8Array, d: Uint8Array) => Uint8Array;

// Mirror the wallet's message framing: append a 4-byte zero checksum, encrypt.
function encrypt(cipher: typeof chacha12, key: Uint8Array, nonce: Uint8Array, body: string) {
  const raw = new TextEncoder().encode(body);
  const full = new Uint8Array(raw.length + CHECKSUM);
  full.set(raw);
  return cipher(key, nonce, full);
}

// Mirror decryptMessage: decrypt, require trailing zero checksum, strip it.
function decrypt(cipher: typeof chacha12, key: Uint8Array, nonce: Uint8Array, ct: Uint8Array) {
  const buf = cipher(key, nonce, ct);
  for (let i = 0; i < CHECKSUM; i++) {
    if (buf[buf.length - CHECKSUM + i] !== 0) return null;
  }
  return new TextDecoder().decode(buf).slice(0, -CHECKSUM);
}

beforeAll(async () => {
  const mod = await import(`${CYPHER_DIR}/cypher.js`);
  const init = mod.default ?? mod.init;
  if (typeof init === "function") await init(readFileSync(`${CYPHER_DIR}/cypher_bg.wasm`));
  chacha8 = mod.chacha8;
  chacha12 = mod.chacha12;
});

describe("check-in cipher scheme (real conceal-lib-js WASM)", () => {
  const key = new Uint8Array(32).fill(9);
  const nonce = new Uint8Array(12); // message nonce is derived; all-zero is the common case

  it("round-trips a {status,alive} check-in through ChaCha12 + checksum framing", () => {
    const body = formatCheckIn("alive"); // {status,alive}
    const ct = encrypt(chacha12, key, nonce, body);
    const recovered = decrypt(chacha12, key, nonce, ct);
    expect(recovered).toBe(body);
    expect(isKnownSmartMessage(recovered as string)).toBe(true);
    expect(parseCheckIn(recovered)).toEqual({ status: "alive" });
  });

  it("a ChaCha8 (ordinary) message does NOT decrypt as a ChaCha12 smart message", () => {
    // This is exactly the decrypt fallback gate: try ChaCha12, reject, use ChaCha8.
    const ct8 = encrypt(chacha8, key, nonce, "hey, lunch tomorrow?");
    const asCha12 = decrypt(chacha12, key, nonce, ct8);
    // Either checksum fails (null) or it isn't a smart message — never a false check-in.
    expect(asCha12 === null || !isKnownSmartMessage(asCha12)).toBe(true);
    // And it round-trips correctly under ChaCha8.
    expect(decrypt(chacha8, key, nonce, ct8)).toBe("hey, lunch tomorrow?");
  });

  it("ChaCha8 and ChaCha12 keystreams differ (so the cipher choice is meaningful)", () => {
    const data = new Uint8Array(32).fill(1);
    expect(Buffer.from(chacha8(key, nonce, data)).equals(Buffer.from(chacha12(key, nonce, data)))).toBe(
      false,
    );
  });
});
