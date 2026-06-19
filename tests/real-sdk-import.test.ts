// @vitest-environment node
import { createAccount, type RawWalletV1, saveEncryptedWallet } from "conceal-wallet-sdk";
import { afterEach, describe, expect, it } from "vitest";
import { decodeWalletQr } from "@/lib/services/real-sdk/wallet-qr";

/**
 * #102: File (encrypted-backup) + QR import in the SDK engine. decodeWalletQr is pure;
 * the File error paths (bad JSON / wrong password) are reached before any network, so
 * they're testable without a daemon. The happy path (decode → adopt) is covered by the
 * e2e + the live walkthrough.
 */

describe("decodeWalletQr (#102)", () => {
  it("decodes a mnemonic-seed payload (with the conceal. prefix)", () => {
    const d = decodeWalletQr("conceal.ccx7ADDR?mnemonic_seed=abandon ability able?height=120");
    expect(d.address).toBe("ccx7ADDR");
    expect(d.mnemonicSeed).toBe("abandon ability able");
    expect(d.height).toBe(120);
  });

  it("decodes a spend+view key payload without a prefix (bare address)", () => {
    const d = decodeWalletQr("ccx7ADDR?spend_key=aa11?view_key=bb22");
    expect(d.address).toBe("ccx7ADDR");
    expect(d.spendKey).toBe("aa11");
    expect(d.viewKey).toBe("bb22");
  });

  it("decodes a view-only payload (view key + address, no spend)", () => {
    const d = decodeWalletQr("conceal.ccx7VIEWONLY?view_key=cc33");
    expect(d.address).toBe("ccx7VIEWONLY");
    expect(d.viewKey).toBe("cc33");
    expect(d.spendKey).toBeUndefined();
  });

  it("ignores empty/unknown options and a negative height", () => {
    const d = decodeWalletQr("conceal.ccx7A?spend_key=?bogus=1?height=-5");
    expect(d.address).toBe("ccx7A");
    expect(d.spendKey).toBeUndefined();
    expect(d.height).toBeUndefined();
  });
});

describe("real-sdk importWallet file (#102)", () => {
  afterEach(async () => {
    const { _setRuntimeForTest } = await import("@/lib/services/real-sdk/runtime");
    _setRuntimeForTest(null);
  });

  function encryptedBackup(password: string): string {
    const acct = createAccount("english");
    const raw: RawWalletV1 = {
      deposits: [],
      withdrawals: [],
      transactions: [],
      lastHeight: 0,
      nonce: "",
      keys: {
        pub: { spend: acct.keys.spend.pub, view: acct.keys.view.pub },
        priv: { spend: acct.keys.spend.sec, view: acct.keys.view.sec },
      },
      creationHeight: 0,
      options: {},
    };
    return JSON.stringify(saveEncryptedWallet(raw, password));
  }

  it("rejects a non-JSON file with a friendly error", async () => {
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    await expect(
      realSdkWalletService.importWallet({ method: "file", file: "not json at all", password: "x" }),
    ).rejects.toThrow(/not valid JSON/i);
  });

  it("rejects a valid backup opened with the wrong password", async () => {
    const { realSdkWalletService } = await import("@/lib/services/real-sdk/wallet.service");
    const backup = encryptedBackup("correct-password");
    await expect(
      realSdkWalletService.importWallet({ method: "file", file: backup, password: "wrong-password" }),
    ).rejects.toThrow(/Invalid wallet file or password/i);
  });
});
