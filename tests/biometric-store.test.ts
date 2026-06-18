import { beforeEach, describe, expect, it } from "vitest";
import {
  addPasskeyCredential,
  clearPasskeyEnrollment,
  getPasskeyEnrollment,
  hasPasskeyEnrollment,
  type PasskeyCredential,
  type PasskeyEnrollment,
  removePasskeyCredential,
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
