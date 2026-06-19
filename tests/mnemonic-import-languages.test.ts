// @vitest-environment node
import { SEED_LANGUAGES } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { MNEMONIC_IMPORT_LANGUAGES } from "@/lib/ui/mnemonic-import-languages";

/**
 * #10: the import-language dropdown must only advertise seed languages the engine can
 * actually decode — the selected key is passed straight to the SDK as a `SeedLanguage`
 * (only "auto" → detect), so advertising an unsupported language fails the import. Guards
 * against re-introducing french/italian/etc. without the corresponding lib-js wordlists.
 */
describe("mnemonic import languages (#10)", () => {
  const advertised = MNEMONIC_IMPORT_LANGUAGES.map((l) => l.key).filter((k) => k !== "auto");

  it("only advertises languages the SDK supports", () => {
    const supported = new Set<string>(SEED_LANGUAGES);
    for (const key of advertised) expect(supported.has(key)).toBe(true);
  });

  it("no longer advertises languages without a wordlist (french/italian/…)", () => {
    for (const key of ["french", "italian", "chinese", "dutch", "esperanto", "russian"]) {
      expect(advertised).not.toContain(key);
    }
  });

  it("still offers automatic detection", () => {
    expect(MNEMONIC_IMPORT_LANGUAGES.some((l) => l.key === "auto")).toBe(true);
  });
});
