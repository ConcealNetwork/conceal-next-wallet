import { readFileSync } from "node:fs";
import { messages } from "conceal-wallet-sdk";
import { beforeAll, describe, expect, it } from "vitest";

const { isKnownSmartMessage, isSmartMessage } = messages;

/**
 * Pins the decrypt acceptance gate for smart messages (#gap-messages).
 *
 * TransactionsExplorer.decryptMessage tries ChaCha12 first and accepts the
 * plaintext when: checksum-OK AND it's STRUCTURALLY a smart message (a single
 * `{...}` brace token) — NOT when it's a KNOWN-module message. The old gate
 * (isKnownSmartMessage, our 8-module allow-list) dropped smart messages other
 * Conceal wallets send with modules we don't recognise: they'd fail the
 * allow-list, fall through to ChaCha8, fail its checksum, and vanish.
 *
 * This reproduces the exact decrypt gate against the real conceal-lib-js WASM
 * (the same `cypher` the wallet bundles), mirroring tests/check-in-cipher.test.ts.
 * It proves: (1) an unknown-module smart message round-trips via ChaCha12,
 * (2) a known-module smart message still does, (3) plain chat still falls
 * through to ChaCha8 unchanged, (4) the new structural gate is strictly broader
 * than the old known-module gate.
 *
 * The encrypt side is intentionally unchanged (Cn.ts only sends KNOWN modules
 * over ChaCha12), so an unknown-module message can't be produced by our encrypt
 * path — we craft its ChaCha12 ciphertext directly here, exactly as a foreign
 * wallet would put it on-chain.
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

// Replica of decryptMessage's acceptance logic: try ChaCha12 first (accept when
// checksum-OK AND structurally a smart message), else fall back to ChaCha8.
function decryptMessage(key: Uint8Array, nonce: Uint8Array, ct: Uint8Array): string | null {
  // ChaCha12 branch (smart messages).
  const c12 = chacha12(key, nonce, ct);
  let checksumOk = true;
  for (let i = 0; i < CHECKSUM; i++) {
    if (c12[c12.length - CHECKSUM + i] !== 0) {
      checksumOk = false;
      break;
    }
  }
  if (checksumOk) {
    const candidate = new TextDecoder().decode(c12).slice(0, -CHECKSUM);
    if (isSmartMessage(candidate)) return candidate;
  }

  // ChaCha8 branch (ordinary chat).
  const c8 = chacha8(key, nonce, ct);
  for (let i = 0; i < CHECKSUM; i++) {
    if (c8[c8.length - CHECKSUM + i] !== 0) return null;
  }
  return new TextDecoder().decode(c8).slice(0, -CHECKSUM);
}

beforeAll(async () => {
  const mod = await import(`${CYPHER_DIR}/cypher.js`);
  const init = mod.default ?? mod.init;
  if (typeof init === "function") await init(readFileSync(`${CYPHER_DIR}/cypher_bg.wasm`));
  chacha8 = mod.chacha8;
  chacha12 = mod.chacha12;
});

describe("smart-message decrypt gate (real conceal-lib-js WASM)", () => {
  const key = new Uint8Array(32).fill(9);
  const nonce = new Uint8Array(12); // message nonce is index 0

  it("decodes an UNKNOWN-module smart message {futuremod,x} sent by another wallet", () => {
    const body = "{futuremod,x}";
    // It's structurally a smart message but NOT a module we know about.
    expect(isSmartMessage(body)).toBe(true);
    expect(isKnownSmartMessage(body)).toBe(false);

    // A foreign wallet frames it over ChaCha12 (the smart-message cipher).
    const ct = encrypt(chacha12, key, nonce, body);
    // The OLD gate (isKnownSmartMessage) would have rejected this and dropped it;
    // the NEW structural gate accepts it.
    expect(decryptMessage(key, nonce, ct)).toBe(body);
  });

  it("still decodes a KNOWN-module smart message {status,alive} (no regression)", () => {
    const body = "{status,alive}";
    expect(isKnownSmartMessage(body)).toBe(true);
    const ct = encrypt(chacha12, key, nonce, body);
    expect(decryptMessage(key, nonce, ct)).toBe(body);
  });

  it("still decodes plain chat via ChaCha8 fallback (no regression)", () => {
    const body = "hey, lunch tomorrow?";
    expect(isSmartMessage(body)).toBe(false);
    const ct = encrypt(chacha8, key, nonce, body);
    // ChaCha12 decrypt of a ChaCha8 ciphertext won't pass checksum + brace check,
    // so it falls through to ChaCha8 and recovers exactly.
    expect(decryptMessage(key, nonce, ct)).toBe(body);
  });

  it("does not misread plain brace-wrapped chat encrypted under ChaCha8 as a ChaCha12 smart message", () => {
    // Even though "{lunch?}" is structurally a smart message, when it's sent as
    // ordinary chat (ChaCha8) the ChaCha12 decrypt yields garbage that fails the
    // checksum — so it correctly falls through to ChaCha8 and round-trips.
    const body = "{lunch?}";
    expect(isSmartMessage(body)).toBe(true);
    const ct = encrypt(chacha8, key, nonce, body);
    expect(decryptMessage(key, nonce, ct)).toBe(body);
  });

  it("structural gate is strictly broader than the old known-module gate", () => {
    // Every known-module message is structurally a smart message, but not vice
    // versa — so the new gate accepts a strict superset (no message that used to
    // decode stops decoding).
    for (const known of ["{status,alive}", "{2FA,r,site}", "{vault,c,name}"]) {
      expect(isKnownSmartMessage(known)).toBe(true);
      expect(isSmartMessage(known)).toBe(true);
    }
    expect(isSmartMessage("{futuremod,x}")).toBe(true);
    expect(isKnownSmartMessage("{futuremod,x}")).toBe(false);
  });
});
