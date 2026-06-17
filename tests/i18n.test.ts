import { describe, expect, it } from "vitest";
import { DICTIONARIES } from "@/lib/i18n/dictionaries";
import { isLocale, type Locale, resolveLocale, translate } from "@/lib/i18n/i18n";

describe("resolveLocale", () => {
  it("prefers an explicit stored locale", () => {
    expect(resolveLocale("es", ["en-US"])).toBe("es");
    expect(resolveLocale("en", ["es"])).toBe("en");
  });

  it("falls back to the first supported browser language (by base)", () => {
    expect(resolveLocale(null, ["es-419", "en"])).toBe("es");
    expect(resolveLocale(null, ["fr-FR", "en-GB"])).toBe("en");
  });

  it("defaults to English for unknown stored/browser values", () => {
    expect(resolveLocale("klingon", ["fr", "de"])).toBe("en");
    expect(resolveLocale(null, [])).toBe("en");
  });
});

describe("translate", () => {
  const en = { greeting: "Hello", saved: 'Saved "{name}"' };
  const es = { greeting: "Hola" };

  it("uses the active locale, falling back to English then the key", () => {
    expect(translate(es, en, "greeting")).toBe("Hola");
    expect(translate(es, en, "saved", { name: "x" })).toBe('Saved "x"'); // es missing → en
    expect(translate(es, en, "missing.key")).toBe("missing.key");
  });

  it("interpolates {placeholders}; leaves unknown ones intact", () => {
    expect(translate(en, en, "saved", { name: "backup.json" })).toBe('Saved "backup.json"');
    expect(translate({ x: "{a}-{b}" }, en, "x", { a: "1" })).toBe("1-{b}");
  });

  it("does not resolve Object.prototype keys as translations or interpolations", () => {
    // A key matching a prototype member must fall through to the literal key,
    // not return Object.prototype.valueOf/toString.
    expect(translate({}, {}, "valueOf")).toBe("valueOf");
    expect(translate({}, {}, "toString")).toBe("toString");
    // A {toString} placeholder with no matching own var stays literal.
    expect(translate({ x: "{toString}" }, en, "x", {})).toBe("{toString}");
  });
});

describe("dictionaries", () => {
  it("es covers every en key (no missing translations in the foundation set)", () => {
    const enKeys = Object.keys(DICTIONARIES.en).sort();
    const esKeys = Object.keys(DICTIONARIES.es).sort();
    expect(esKeys).toEqual(enKeys);
  });

  it("isLocale guards the supported set", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("es")).toBe(true);
    expect(isLocale("xx" as Locale)).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
