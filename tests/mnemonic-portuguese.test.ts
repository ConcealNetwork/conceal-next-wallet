import { describe, expect, it } from "vitest";
import { Mnemonic } from "@/lib/wallet-core/Mnemonic";
import { MnemonicLang } from "@/lib/wallet-core/MnemonicLang";

// The Portuguese wordlist has 3-char prefixes that are not unique (e.g. "fel" →
// felicidade/felipe). With the legacy prefix-only decode, a colliding word
// resolves to the WRONG index — and thus the wrong wallet key. The fix flags the
// Portuguese wordset for full-word matching while keeping the prefix-3 checksum.

const portuguese = MnemonicLang.getLangs().find((lang) => lang.name === "portuguese");

// Deterministic, varied 64-hex seeds (xorshift32) so the suite is reproducible.
function seededHex(n: number): string {
  let x = (n * 2654435761) >>> 0 || 1;
  let out = "";
  for (let i = 0; i < 64; i += 1) {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    out += (x & 0xf).toString(16);
  }
  return out;
}

describe("Portuguese mnemonic decoding", () => {
  it("flags the Portuguese wordset for full-word matching", () => {
    expect(portuguese).toBeDefined();
    expect(portuguese?.fullWordMatch).toBe(true);
    expect(portuguese?.prefixLen).toBe(3);
  });

  it("contains prefix-colliding words the fix must disambiguate", () => {
    const words = portuguese?.words ?? [];
    const felipe = words.indexOf("felipe");
    const felicidade = words.indexOf("felicidade");
    expect(felipe).toBeGreaterThanOrEqual(0);
    expect(felicidade).toBeGreaterThanOrEqual(0);
    expect(felipe).not.toBe(felicidade);
    // Both share the 3-char prefix the legacy decoder keyed on.
    expect("felipe".slice(0, 3)).toBe("felicidade".slice(0, 3));
  });

  it("round-trips Portuguese seeds, including prefix-colliding words", () => {
    const words = portuguese?.words ?? [];
    const prefixLen = portuguese?.prefixLen ?? 3;
    const truncated = words.map((word) => word.slice(0, prefixLen));
    // Words that prefix-matching would resolve to an EARLIER index (the bug).
    const ambiguous = new Set(
      words.filter((word, index) => truncated.indexOf(word.slice(0, prefixLen)) !== index),
    );
    expect(ambiguous.size).toBeGreaterThan(0);

    let exercisedCollision = false;
    for (let n = 1; n <= 1000; n += 1) {
      const seed = seededHex(n);
      const mnemonic = Mnemonic.mn_encode(seed, "portuguese");
      expect(mnemonic).not.toBeNull();
      // Pre-fix, this round-trip fails for any mnemonic containing a colliding word.
      expect(Mnemonic.mn_decode(mnemonic as string, "portuguese")).toBe(seed);
      const dataWords = (mnemonic as string).split(" ").slice(0, -1);
      if (dataWords.some((word) => ambiguous.has(word))) {
        exercisedCollision = true;
      }
    }
    // Guard: ensure we actually exercised the collision path the fix addresses.
    expect(exercisedCollision).toBe(true);
  });

  it("leaves prefix-based decoding intact for other languages", () => {
    const seed = seededHex(42);
    for (const lang of ["english", "spanish", "french"]) {
      const mnemonic = Mnemonic.mn_encode(seed, lang);
      expect(mnemonic).not.toBeNull();
      expect(Mnemonic.mn_decode(mnemonic as string, lang)).toBe(seed);
    }
  });
});
