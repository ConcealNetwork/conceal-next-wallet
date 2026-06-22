import { describe, expect, it } from "vitest";
import { paymentCardFilename } from "@/lib/ui/payment-card-png";
import { qrPngFilename, sanitizePngLabel } from "@/lib/ui/qr-png";

/**
 * Locks the filename-sanitization contract extracted in the #204 dedup: the QR and
 * payment-card filename builders share `sanitizePngLabel`, so this pins the slug rules
 * (lowercase → [a-z0-9-] → trim → 16-char cap → re-trim trailing dash) in one place.
 */
describe("sanitizePngLabel (#204 shared filename slug)", () => {
  it("lowercases, slugifies non-alphanumerics, and trims edge dashes", () => {
    expect(sanitizePngLabel("Hello World!", "conceal-qr")).toBe("conceal-qr-hello-world.png");
    expect(sanitizePngLabel("  spaced  ", "p")).toBe("p-spaced.png");
  });

  it("emits a bare prefix when the label sanitizes to empty", () => {
    expect(sanitizePngLabel("", "conceal-qr")).toBe("conceal-qr.png");
    expect(sanitizePngLabel("!!!", "conceal-qr")).toBe("conceal-qr.png");
  });

  it("caps the slug at 16 chars and re-trims a dash the slice re-exposes", () => {
    // "abcdefghijklmno pqrs" → "abcdefghijklmno-pqrs" → slice(0,16) "abcdefghijklmno-" → trim
    expect(sanitizePngLabel("abcdefghijklmno pqrs", "p")).toBe("p-abcdefghijklmno.png");
  });

  it("backs the QR + payment-card filename builders", () => {
    expect(qrPngFilename("ccx7ABCD")).toBe("conceal-qr-ccx7abcd.png");
    expect(paymentCardFilename("ccx7ABCD")).toBe("conceal-request-ccx7abcd.png");
  });
});
