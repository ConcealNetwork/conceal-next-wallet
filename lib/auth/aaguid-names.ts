/**
 * Best-effort authenticator labels for passkey enrollments.
 *
 * WebAuthn never gives the relying party the device's *name* (anti-fingerprinting).
 * The richest signal available is the authenticator's AAGUID — a non-secret model
 * id present in the attestation's authenticator data — which a public community
 * list maps to a provider name ("iCloud Keychain", "YubiKey 5 Series", …). With
 * `attestation: "none"` many platforms zero the AAGUID for privacy, so this is
 * best-effort; we fall back to a transport/attachment heuristic, and the user can
 * always rename the credential.
 *
 * AAGUIDs below are a curated subset of
 * https://github.com/passkeydeveloper/passkey-authenticator-aaguids — extend as
 * needed; unknown ids just fall through to the heuristic.
 */

const ZERO_AAGUID = "00000000-0000-0000-0000-000000000000";

const AAGUID_NAMES: Record<string, string> = {
  "ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4": "Google Password Manager",
  "fbfc3007-154e-4ecc-8c0b-6e020557d7bd": "iCloud Keychain",
  "dd4ec289-e01d-41c9-bb89-70fa845d4bf2": "iCloud Keychain",
  "adce0002-35bc-c60a-648b-0b25f1f05503": "Chrome on Mac",
  "08987058-cadc-4b81-b6e1-30de50dcbe96": "Windows Hello",
  "9ddd1817-af5a-4672-a2b9-3e3dd95000a9": "Windows Hello",
  "6028b017-b1d4-4c02-b4b3-afcdafc96bb2": "Windows Hello",
  "bada5566-a7aa-401f-bd96-45619a55120d": "1Password",
  "d548826e-79b4-db40-a3d8-11116f7e8349": "Bitwarden",
  "cb69481e-8ff7-4039-93ec-0a2729a154a8": "YubiKey 5 Series",
  "ee882879-721c-4913-9775-3dfcce97072a": "YubiKey 5 Series",
  "fa2b99dc-9e39-4257-8f92-4a30d23c4118": "YubiKey 5 Series (NFC)",
  "2fc0579f-8113-47ea-b116-bb5a8db9202a": "YubiKey 5 Series (NFC)",
};

/** Extract the AAGUID (canonical UUID string) from attestation authenticator data. */
export function aaguidFromAuthData(authData: ArrayBuffer | undefined | null): string | undefined {
  // authData = rpIdHash(32) + flags(1) + signCount(4) = 37, then AAGUID(16).
  if (!(authData instanceof ArrayBuffer) || authData.byteLength < 53) return undefined;
  const bytes = new Uint8Array(authData, 37, 16);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  const uuid = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  return uuid === ZERO_AAGUID ? undefined : uuid;
}

/** Resolve a friendly label: known AAGUID → provider name, else transport/attachment heuristic. */
export function authenticatorLabel(opts: {
  aaguid?: string;
  transports?: AuthenticatorTransport[];
  attachment?: string | null;
}): string {
  if (opts.aaguid) {
    const known = AAGUID_NAMES[opts.aaguid.toLowerCase()];
    if (known) return known;
  }
  const transports = opts.transports ?? [];
  if (transports.includes("internal")) return "This device";
  if (transports.includes("hybrid")) return "Phone or tablet";
  if (transports.includes("usb") || transports.includes("nfc") || transports.includes("ble")) {
    return "Security key";
  }
  if (opts.attachment === "platform") return "This device";
  if (opts.attachment === "cross-platform") return "Security key or phone";
  return "Passkey";
}
