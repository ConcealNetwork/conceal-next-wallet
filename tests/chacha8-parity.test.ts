import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { JSChaCha8 } from "@/lib/wallet-core/ChaCha8";

/**
 * Gate for migrating the message cipher from the hand-rolled `JSChaCha8` to the
 * audited conceal-lib-js WASM `cypher.chacha8` (#79). Messages are always
 * encrypted with a zero nonce (Cn.ts uses index 0; only nonce-0 messages are
 * ever decryptable), so the WASM may replace the JS impl ONLY IF the two produce
 * byte-identical keystreams at nonce 0 across the message length range —
 * otherwise the swap would break reading already-on-chain messages.
 */

const CYPHER_DIR = `${process.cwd()}/node_modules/conceal-lib-js/src/wasm/cypher`;
let wasmChacha8: (k: Uint8Array, n: Uint8Array, d: Uint8Array) => Uint8Array;

function eq(a: Uint8Array, b: Uint8Array): boolean {
  return Buffer.from(a).equals(Buffer.from(b));
}

beforeAll(async () => {
  const mod = await import(`${CYPHER_DIR}/cypher.js`);
  const init = mod.default ?? mod.init;
  if (typeof init === "function") await init(readFileSync(`${CYPHER_DIR}/cypher_bg.wasm`));
  wasmChacha8 = mod.chacha8;
});

describe("ChaCha8 JS↔WASM parity (migration gate, #79)", () => {
  const key = new Uint8Array(32);
  for (let i = 0; i < 32; i++) key[i] = (i * 7 + 1) & 0xff;
  const zeroNonce = new Uint8Array(12); // the wallet's message nonce (index 0)

  // Spans sub-block, exactly one block, and several blocks (covers the 64-byte
  // boundary where the JS counter/nonce layout could diverge from IETF).
  const lengths = [1, 4, 16, 32, 63, 64, 65, 128, 256, 264, 300];

  it("produces identical keystream at nonce 0 across the message length range", () => {
    for (const len of lengths) {
      const data = new Uint8Array(len);
      for (let i = 0; i < len; i++) data[i] = (i * 13 + 5) & 0xff;
      const js = new JSChaCha8(key, zeroNonce).encrypt(data);
      const wasm = wasmChacha8(key, zeroNonce, data);
      expect(eq(js, wasm), `nonce-0 mismatch at length ${len}`).toBe(true);
    }
  });

  it("documents the known divergence at a NON-zero nonce (the wallet never uses one for messages)", () => {
    const nonce = new Uint8Array(12);
    nonce[0] = 1; // any non-zero nonce → JS (libsodium layout) ≠ WASM (IETF layout)
    const data = new Uint8Array(80);
    const js = new JSChaCha8(key, nonce).encrypt(data);
    const wasm = wasmChacha8(key, nonce, data);
    expect(eq(js, wasm)).toBe(false);
  });
});
