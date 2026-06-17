import { expect, test } from "@playwright/test";

// Biometric unlock is real-mode-only and needs a platform authenticator, so it
// can't be driven through the mock unlock UI. Instead we attach a CDP virtual
// authenticator with PRF support and exercise the exact WebAuthn + WebCrypto
// chain the feature uses (create → PRF secret → AES-GCM encrypt → get → PRF
// secret → decrypt), proving the approach + the API shapes work in a real
// Chromium. The module (lib/auth/webauthn-prf.ts) is a thin wrapper over these
// calls; the crypto + store layers are unit-tested separately.
test("WebAuthn PRF round-trip recovers an AES-GCM-encrypted password", async ({ page }) => {
  const client = await page.context().newCDPSession(page);
  await client.send("WebAuthn.enable");
  let authenticatorId: string;
  try {
    const res = await client.send("WebAuthn.addVirtualAuthenticator", {
      options: {
        protocol: "ctap2",
        transport: "internal",
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
        // PRF (hmac-secret) support on the virtual authenticator.
        hasPrf: true,
      } as never,
    });
    authenticatorId = res.authenticatorId;
  } catch {
    test.skip(true, "This Chromium's virtual authenticator doesn't support PRF (hasPrf)");
    return;
  }

  // WebAuthn rejects IP-address origins ("invalid domain"); the suite's baseURL
  // is 127.0.0.1, so hit the same dev server via localhost instead.
  const port = process.env.E2E_PORT ?? "3100";
  await page.goto(`http://localhost:${port}/`);
  await expect(page.getByRole("heading", { name: /Quietly private/i })).toBeVisible();

  const recovered = await page.evaluate(async () => {
    const SALT = new TextEncoder().encode("conceal-wallet/biometric-unlock/v1");
    const PASSWORD = "s3cret-wallet-password";

    const created = (await navigator.credentials.create({
      publicKey: {
        rp: { name: "Conceal Wallet" },
        user: {
          id: crypto.getRandomValues(new Uint8Array(32)),
          name: "conceal-wallet",
          displayName: "Conceal Wallet",
        },
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        pubKeyCredParams: [{ type: "public-key", alg: -7 }],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
        },
        attestation: "none",
        // biome-ignore lint/suspicious/noExplicitAny: PRF types not in lib.dom
        extensions: { prf: { eval: { first: SALT } } } as any,
      },
    })) as PublicKeyCredential;

    const credId = new Uint8Array(created.rawId);

    const prfFrom = async () => {
      const assertion = (await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          allowCredentials: [{ id: credId, type: "public-key", transports: ["internal"] }],
          userVerification: "required",
          // biome-ignore lint/suspicious/noExplicitAny: PRF types not in lib.dom
          extensions: { prf: { eval: { first: SALT } } } as any,
        },
        // biome-ignore lint/suspicious/noExplicitAny: PRF results not in lib.dom
      })) as any;
      return assertion.getClientExtensionResults().prf?.results?.first as ArrayBuffer | undefined;
    };

    // biome-ignore lint/suspicious/noExplicitAny: PRF results not in lib.dom
    let secret = (created.getClientExtensionResults() as any)?.prf?.results?.first as
      | ArrayBuffer
      | undefined;
    if (!secret) secret = await prfFrom();
    if (!secret) return "NO_PRF";

    const keyForEnc = await crypto.subtle.importKey("raw", secret, { name: "AES-GCM" }, false, [
      "encrypt",
    ]);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      keyForEnc,
      new TextEncoder().encode(PASSWORD),
    );

    // Unlock: fresh assertion → secret → decrypt.
    const secret2 = await prfFrom();
    if (!secret2) return "NO_PRF";
    const keyForDec = await crypto.subtle.importKey("raw", secret2, { name: "AES-GCM" }, false, [
      "decrypt",
    ]);
    const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, keyForDec, ct);
    return new TextDecoder().decode(pt);
  });

  await client.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
  expect(recovered).toBe("s3cret-wallet-password");
});
