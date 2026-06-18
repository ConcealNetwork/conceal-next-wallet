import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { base64urlToBytes, encryptWithSecret } from "@/lib/auth/webauthn-crypto";
import {
  enrollPasskeyCredential,
  getPasskeyCapabilities,
  isPasskeyUnlockAvailable,
  isPlatformAuthenticatorAvailable,
  PasskeyError,
  signalPasskeyRemoved,
  unlockWithPasskey,
} from "@/lib/auth/webauthn-prf";

// Real WebCrypto (Node) does the AES; only the WebAuthn ceremony is mocked.
function fakeCredential(
  idBase64url: string,
  secret?: ArrayBuffer,
  opts: { transports?: AuthenticatorTransport[]; authData?: ArrayBuffer; rk?: boolean } = {},
) {
  return {
    rawId: base64urlToBytes(idBase64url).buffer,
    authenticatorAttachment: "platform",
    response: {
      getTransports: () => opts.transports ?? ["internal"],
      getAuthenticatorData: () => opts.authData,
    },
    getClientExtensionResults: () => ({
      ...(secret ? { prf: { results: { first: secret } } } : { prf: {} }),
      ...(opts.rk !== undefined ? { credProps: { rk: opts.rk } } : {}),
    }),
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

  it("excludes already-enrolled credentials and sets a timeout", async () => {
    create.mockResolvedValue(fakeCredential("Y3JlZEI", new Uint8Array(32).fill(5).buffer));
    await enrollPasskeyCredential("pw", [
      {
        credentialId: "Y3JlZEE",
        label: "x",
        encrypted: { iv: "i", ciphertext: "c" },
        createdAt: "",
        transports: ["internal"],
      },
    ]);
    const options = create.mock.calls[0][0].publicKey;
    expect(options.excludeCredentials).toHaveLength(1);
    expect(options.excludeCredentials[0].transports).toEqual(["internal"]);
    expect(options.timeout).toBe(60000);
  });

  it("captures transports and derives a label from them", async () => {
    create.mockResolvedValue(
      fakeCredential("Y3JlZEE", new Uint8Array(32).fill(5).buffer, { transports: ["usb", "nfc"] }),
    );
    const credential = await enrollPasskeyCredential("pw");
    expect(credential.transports).toEqual(["usb", "nfc"]);
    expect(credential.label).toBe("Security key");
  });

  it("maps a duplicate authenticator (InvalidStateError) to already-enrolled", async () => {
    create.mockRejectedValue(new DOMException("dup", "InvalidStateError"));
    const error = await enrollPasskeyCredential("pw", []).catch((e) => e);
    expect(error).toBeInstanceOf(PasskeyError);
    expect(error.code).toBe("already-enrolled");
  });

  it("requests credProps and records a discoverable/synced passkey", async () => {
    create.mockResolvedValue(
      fakeCredential("Y3JlZEE", new Uint8Array(32).fill(5).buffer, { rk: true }),
    );
    const credential = await enrollPasskeyCredential("pw");
    expect(credential.discoverable).toBe(true);
    expect(create.mock.calls[0][0].publicKey.extensions.credProps).toBe(true);
  });
});

describe("capability detection", () => {
  it("returns the capability map and prefers it for platform availability", async () => {
    const getClientCapabilities = vi
      .fn()
      .mockResolvedValue({ userVerifyingPlatformAuthenticator: true, hybridTransport: false });
    Object.defineProperty(globalThis, "window", {
      value: { PublicKeyCredential: Object.assign(class {}, { getClientCapabilities }) },
      configurable: true,
    });
    expect(await getPasskeyCapabilities()).toMatchObject({
      userVerifyingPlatformAuthenticator: true,
    });
    expect(await isPlatformAuthenticatorAvailable()).toBe(true);
  });

  it("falls back to isUserVerifyingPlatformAuthenticatorAvailable when getClientCapabilities is absent", async () => {
    const iuvpaa = vi.fn().mockResolvedValue(true);
    Object.defineProperty(globalThis, "window", {
      value: {
        PublicKeyCredential: Object.assign(class {}, {
          isUserVerifyingPlatformAuthenticatorAvailable: iuvpaa,
        }),
      },
      configurable: true,
    });
    expect(await isPlatformAuthenticatorAvailable()).toBe(true);
    expect(iuvpaa).toHaveBeenCalled();
  });
});

describe("signalPasskeyRemoved", () => {
  it("calls signalUnknownCredential when the browser supports it", async () => {
    const signal = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(globalThis, "window", {
      value: {
        PublicKeyCredential: Object.assign(class {}, { signalUnknownCredential: signal }),
        location: { hostname: "wallet.example" },
      },
      configurable: true,
    });
    await signalPasskeyRemoved("Y3JlZEE");
    expect(signal).toHaveBeenCalledWith({ rpId: "wallet.example", credentialId: "Y3JlZEE" });
  });

  it("is a no-op (never throws) when unsupported", async () => {
    Object.defineProperty(globalThis, "window", {
      value: { PublicKeyCredential: class {}, location: { hostname: "wallet.example" } },
      configurable: true,
    });
    await expect(signalPasskeyRemoved("x")).resolves.toBeUndefined();
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

  it("includes per-credential transports in allowCredentials", async () => {
    const secret = new Uint8Array(32).fill(8).buffer;
    const enrollment = {
      version: 2 as const,
      credentials: [
        {
          credentialId: "Y3JlZEE",
          label: "Security key",
          encrypted: await encryptWithSecret(secret, "pw"),
          createdAt: "",
          transports: ["usb"] as AuthenticatorTransport[],
        },
      ],
    };
    get.mockResolvedValue(fakeCredential("Y3JlZEE", secret));
    await unlockWithPasskey(enrollment);
    expect(get.mock.calls[0][0].publicKey.allowCredentials[0].transports).toEqual(["usb"]);
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
