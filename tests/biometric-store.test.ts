import { beforeEach, describe, expect, it } from "vitest";
import {
  addPasskeyCredential,
  clearPasskeyEnrollment,
  DEFAULT_WALLET_ID,
  getPasskeyEnrollment,
  hasPasskeyEnrollment,
  type PasskeyCredential,
  type PasskeyEnrollment,
  removePasskeyCredential,
  renamePasskeyCredential,
  savePasskeyEnrollment,
} from "@/lib/auth/biometric-store";

const STORAGE_KEY = "ccx-biometric-enrollment";

function credential(id: string, label = "This device"): PasskeyCredential {
  return {
    credentialId: id,
    label,
    encrypted: { iv: "aXYtYnl0ZXM", ciphertext: `Y2lwaGVy-${id}` },
    createdAt: "2026-06-18T00:00:00.000Z",
  };
}

beforeEach(() => {
  clearPasskeyEnrollment();
});

describe("passkey enrollment store", () => {
  it("round-trips a v2 envelope", () => {
    expect(getPasskeyEnrollment()).toBeNull();
    const enrollment: PasskeyEnrollment = {
      version: 2,
      address: "ccx7abc",
      credentials: [credential("cred-a")],
    };
    savePasskeyEnrollment(enrollment);
    expect(getPasskeyEnrollment()).toEqual(enrollment);
    expect(hasPasskeyEnrollment()).toBe(true);
  });

  it("migrates a legacy v1 single-credential enrollment to the envelope (same ciphertext)", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        credentialId: "legacy-cred",
        address: "ccx7old",
        encrypted: { iv: "aXY", ciphertext: "Y2lwaGVy" },
      }),
    );
    const migrated = getPasskeyEnrollment();
    expect(migrated).toEqual({
      version: 2,
      address: "ccx7old",
      credentials: [
        {
          credentialId: "legacy-cred",
          label: "This device",
          encrypted: { iv: "aXY", ciphertext: "Y2lwaGVy" },
          createdAt: "",
        },
      ],
    });
  });

  it("appends credentials immutably and de-dupes by id", () => {
    const first = addPasskeyCredential(null, credential("cred-a"), "ccx7abc");
    expect(first.credentials).toHaveLength(1);

    const second = addPasskeyCredential(
      first,
      credential("cred-b", "Security key or phone"),
      "ccx7abc",
    );
    expect(second.credentials.map((c) => c.credentialId)).toEqual(["cred-a", "cred-b"]);
    expect(first.credentials).toHaveLength(1); // original untouched (immutable)

    // Re-adding the same id replaces, not duplicates.
    const reAdded = addPasskeyCredential(second, credential("cred-a"), "ccx7abc");
    expect(reAdded.credentials.map((c) => c.credentialId)).toEqual(["cred-b", "cred-a"]);
  });

  it("drops credentials from a different wallet when adding", () => {
    const forWalletA = addPasskeyCredential(null, credential("cred-a"), "ccx7AAA");
    const forWalletB = addPasskeyCredential(forWalletA, credential("cred-b"), "ccx7BBB");
    expect(forWalletB.address).toBe("ccx7BBB");
    expect(forWalletB.credentials.map((c) => c.credentialId)).toEqual(["cred-b"]);
  });

  it("removes a credential, and returns null once empty", () => {
    const two = addPasskeyCredential(
      addPasskeyCredential(null, credential("cred-a"), "ccx7abc"),
      credential("cred-b"),
      "ccx7abc",
    );
    const afterOne = removePasskeyCredential(two, "cred-a");
    expect(afterOne?.credentials.map((c) => c.credentialId)).toEqual(["cred-b"]);
    expect(removePasskeyCredential(afterOne as PasskeyEnrollment, "cred-b")).toBeNull();
  });

  it("renames a credential immutably; a blank name falls back to 'Passkey'", () => {
    const enrollment = addPasskeyCredential(null, credential("cred-a", "This device"), "ccx7abc");
    const renamed = renamePasskeyCredential(enrollment, "cred-a", "  Work MacBook  ");
    expect(renamed.credentials[0].label).toBe("Work MacBook");
    expect(enrollment.credentials[0].label).toBe("This device"); // original untouched
    expect(renamePasskeyCredential(enrollment, "cred-a", "   ").credentials[0].label).toBe(
      "Passkey",
    );
  });

  it("preserves transports through save/load", () => {
    const cred = {
      ...credential("cred-a"),
      transports: ["usb", "nfc"] as AuthenticatorTransport[],
    };
    savePasskeyEnrollment({ version: 2, address: "ccx7abc", credentials: [cred] });
    expect(getPasskeyEnrollment()?.credentials[0].transports).toEqual(["usb", "nfc"]);
  });

  it("clears an enrollment", () => {
    savePasskeyEnrollment(addPasskeyCredential(null, credential("cred-a"), "ccx7abc"));
    clearPasskeyEnrollment();
    expect(getPasskeyEnrollment()).toBeNull();
    expect(hasPasskeyEnrollment()).toBe(false);
  });

  it("returns null for malformed / partial stored data", () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ credentialId: "x" }));
    expect(getPasskeyEnrollment()).toBeNull();
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ version: 2, credentials: [{ credentialId: "x" }] }),
    );
    expect(getPasskeyEnrollment()).toBeNull();
    localStorage.setItem(STORAGE_KEY, "not json");
    expect(getPasskeyEnrollment()).toBeNull();
  });
});

describe("passkey enrollment store — per-wallet keying (#95)", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  function envelope(address: string, credId: string): PasskeyEnrollment {
    return { version: 2, address, credentials: [credential(credId)] };
  }

  it("stores the default wallet under the legacy global key (back-compat)", () => {
    const enrollment = envelope("ccx7default", "cred-d");
    savePasskeyEnrollment(enrollment, DEFAULT_WALLET_ID);
    // Reading with no arg defaults to the default wallet id → same key.
    expect(getPasskeyEnrollment()).toEqual(enrollment);
    // It lives at the unchanged legacy key, so existing enrollments keep working.
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull();
  });

  it("keys a namespaced wallet under a suffixed key, isolated from the default", () => {
    const def = envelope("ccx7default", "cred-d");
    const other = envelope("ccx7other", "cred-o");
    savePasskeyEnrollment(def, DEFAULT_WALLET_ID);
    savePasskeyEnrollment(other, "wallet-2");

    expect(getPasskeyEnrollment(DEFAULT_WALLET_ID)).toEqual(def);
    expect(getPasskeyEnrollment("wallet-2")).toEqual(other);
    expect(localStorage.getItem(`${STORAGE_KEY}:wallet-2`)).not.toBeNull();
    expect(hasPasskeyEnrollment("wallet-2")).toBe(true);
    // A wallet with no enrollment is null and unaffected by the others.
    expect(getPasskeyEnrollment("wallet-3")).toBeNull();
  });

  it("clears only the targeted wallet's enrollment", () => {
    savePasskeyEnrollment(envelope("ccx7default", "cred-d"), DEFAULT_WALLET_ID);
    savePasskeyEnrollment(envelope("ccx7other", "cred-o"), "wallet-2");

    clearPasskeyEnrollment("wallet-2");
    expect(getPasskeyEnrollment("wallet-2")).toBeNull();
    // The default wallet's enrollment survives.
    expect(hasPasskeyEnrollment(DEFAULT_WALLET_ID)).toBe(true);
  });

  it("migrates a pre-multi-wallet global enrollment as the default wallet's", () => {
    // A legacy install wrote the single global key with no multi-wallet suffix.
    savePasskeyEnrollment(envelope("ccx7legacy", "cred-l"), DEFAULT_WALLET_ID);
    // The default wallet reads it transparently — no migration step needed.
    expect(getPasskeyEnrollment(DEFAULT_WALLET_ID)?.address).toBe("ccx7legacy");
  });
});
