import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base64urlToBytes, encryptWithSecret } from "@/lib/auth/webauthn-crypto";
import {
  enrollPasskeyCredential,
  isPasskeyUnlockAvailable,
  PasskeyError,
  unlockWithPasskey,
} from "@/lib/auth/webauthn-prf";

// Real WebCrypto (Node) does the AES; only the WebAuthn ceremony is mocked.
function fakeCredential(idBase64url: string, secret?: ArrayBuffer) {
  return {
    rawId: base64urlToBytes(idBase64url).buffer,
    authenticatorAttachment: "platform",
    getClientExtensionResults: () => (secret ? { prf: { results: { first: secret } } } : { prf: {} }),
  };
}

const create = vi.fn();
const get = vi.fn();

beforeEach(() => {
  create.mockReset();
  get.mockReset();
  Object.defineProperty(globalThis, "navigator", {
    value: { credentials: { create, get } },
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { PublicKeyCredential: class {} },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("isPasskeyUnlockAvailable", () => {
  it("is true when WebAuthn (PublicKeyCredential) is present", () => {
    expect(isPasskeyUnlockAvailable()).toBe(true);
  });
});

describe("enrollPasskeyCredential", () => {
  it("does not pin authenticatorAttachment, so roaming keys qualify", async () => {
    const secret = new Uint8Array(32).fill(5).buffer;
    create.mockResolvedValue(fakeCredential("Y3JlZEE", secret));
    await enrollPasskeyCredential("pw");
    const options = create.mock.calls[0][0].publicKey;
    expect(options.authenticatorSelection.authenticatorAttachment).toBeUndefined();
    expect(options.authenticatorSelection.userVerification).toBe("required");
  });

  it("falls back to an assertion when create() returns no PRF result", async () => {
    const secret = new Uint8Array(32).fill(9).buffer;
    create.mockResolvedValue(fakeCredential("Y3JlZEE")); // no prf from create
    get.mockResolvedValue(fakeCredential("Y3JlZEE", secret)); // prf from get
    const credential = await enrollPasskeyCredential("pw");
    expect(credential.credentialId).toBe("Y3JlZEE");
    expect(credential.encrypted.ciphertext).toBeTruthy();
  });

  it("throws a clear no-prf error when the authenticator can't produce a PRF secret", async () => {
    create.mockResolvedValue(fakeCredential("Y3JlZEE")); // no prf
    get.mockResolvedValue(fakeCredential("Y3JlZEE")); // still no prf
    await expect(enrollPasskeyCredential("pw")).rejects.toMatchObject({
      code: "no-prf",
    });
  });

  it("maps a cancelled ceremony to a cancelled error", async () => {
    create.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const error = await enrollPasskeyCredential("pw").catch((e) => e);
    expect(error).toBeInstanceOf(PasskeyError);
    expect(error.code).toBe("cancelled");
  });
});

describe("unlockWithPasskey", () => {
  it("recovers the password for whichever enrolled credential the authenticator responds with", async () => {
    const secretA = new Uint8Array(32).fill(1).buffer;
    const secretB = new Uint8Array(32).fill(2).buffer;
    const enrollment = {
      version: 2 as const,
      credentials: [
        {
          credentialId: "Y3JlZEE",
          label: "This device",
          encrypted: await encryptWithSecret(secretA, "password-A"),
          createdAt: "",
        },
        {
          credentialId: "Y3JlZEI",
          label: "Security key or phone",
          encrypted: await encryptWithSecret(secretB, "password-B"),
          createdAt: "",
        },
      ],
    };

    // The user taps credential B — the assertion must select B's ciphertext.
    get.mockResolvedValue(fakeCredential("Y3JlZEI", secretB));
    expect(await unlockWithPasskey(enrollment)).toBe("password-B");

    // Lists every enrolled credential in allowCredentials + a PRF eval for each.
    const options = get.mock.calls[0][0].publicKey;
    expect(options.allowCredentials).toHaveLength(2);
    expect(Object.keys(options.extensions.prf.evalByCredential)).toEqual(["Y3JlZEE", "Y3JlZEI"]);
  });

  it("fails clearly when the responding credential has no matching enrollment", async () => {
    const enrollment = {
      version: 2 as const,
      credentials: [
        {
          credentialId: "Y3JlZEE",
          label: "This device",
          encrypted: await encryptWithSecret(new Uint8Array(32).fill(1).buffer, "password-A"),
          createdAt: "",
        },
      ],
    };
    // Authenticator responds with an unknown credential id.
    get.mockResolvedValue(fakeCredential("dW5rbm93bg", new Uint8Array(32).fill(3).buffer));
    await expect(unlockWithPasskey(enrollment)).rejects.toMatchObject({ code: "failed" });
  });
});
