import { describe, expect, it } from "vitest";
import { aaguidFromAuthData, authenticatorLabel } from "@/lib/auth/aaguid-names";

function authData(aaguid: string): ArrayBuffer {
  const buf = new Uint8Array(55); // rpIdHash(32)+flags(1)+signCount(4)=37, then AAGUID(16)
  const bytes = (aaguid.replace(/-/g, "").match(/../g) ?? []).map((h) => Number.parseInt(h, 16));
  buf.set(bytes, 37);
  return buf.buffer;
}

describe("aaguidFromAuthData", () => {
  it("extracts the AAGUID as a canonical UUID", () => {
    expect(aaguidFromAuthData(authData("ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4"))).toBe(
      "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4",
    );
  });

  it("returns undefined for a zeroed AAGUID (attestation: none privacy)", () => {
    expect(aaguidFromAuthData(new Uint8Array(55).buffer)).toBeUndefined();
  });

  it("returns undefined for too-short or missing authData", () => {
    expect(aaguidFromAuthData(new Uint8Array(40).buffer)).toBeUndefined();
    expect(aaguidFromAuthData(undefined)).toBeUndefined();
    expect(aaguidFromAuthData(null)).toBeUndefined();
  });
});

describe("authenticatorLabel", () => {
  it("maps a known AAGUID to a provider name (case-insensitive)", () => {
    expect(authenticatorLabel({ aaguid: "EA9B8D66-4D01-1D21-3CE4-B6B48CB575D4" })).toBe(
      "Google Password Manager",
    );
    expect(authenticatorLabel({ aaguid: "fbfc3007-154e-4ecc-8c0b-6e020557d7bd" })).toBe(
      "iCloud Keychain",
    );
  });

  it("falls back to a transport heuristic for unknown/absent AAGUID", () => {
    expect(authenticatorLabel({ transports: ["internal"] })).toBe("This device");
    expect(authenticatorLabel({ transports: ["hybrid"] })).toBe("Phone or tablet");
    expect(authenticatorLabel({ transports: ["usb", "nfc"] })).toBe("Security key");
  });

  it("falls back to attachment, then a generic label", () => {
    expect(authenticatorLabel({ attachment: "platform" })).toBe("This device");
    expect(authenticatorLabel({ attachment: "cross-platform" })).toBe("Security key or phone");
    expect(authenticatorLabel({})).toBe("Passkey");
  });

  it("prefers a known AAGUID over the heuristic", () => {
    expect(
      authenticatorLabel({
        aaguid: "cb69481e-8ff7-4039-93ec-0a2729a154a8",
        transports: ["internal"],
      }),
    ).toBe("YubiKey 5 Series");
  });
});
