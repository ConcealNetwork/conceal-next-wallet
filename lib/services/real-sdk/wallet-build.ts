/**
 * Construct fresh {@link RawWalletV1} blobs + key sets for the create/import paths,
 * and derive export data — the SDK-engine analogue of the `Wallet`/`KeysRepository`
 * construction in `lib/wallet-core/wallet-operations.ts`. Pure (no storage, no
 * network, no `lib/wallet-core`).
 */
import {
  crypto,
  encodeAddress,
  type RawWalletV1,
  restoreFromMnemonic,
  type SeedLanguage,
  type UserKeys,
  userKeysFromPriv,
  type WalletKeys,
} from "conceal-wallet-sdk";

/** A constructed wallet ready to adopt: keys (envelope shape) + plaintext blob + mnemonic. */
export interface BuiltWallet {
  keys: UserKeys;
  raw: RawWalletV1;
  /** Present when the wallet was created/restored from a seed phrase. */
  mnemonic?: string;
  address: string;
}

/** Map the SDK {@link WalletKeys} (sec/pub pairs) to the envelope {@link UserKeys}. */
export function walletKeysToUserKeys(keys: WalletKeys): UserKeys {
  return {
    pub: { view: keys.view.pub, spend: keys.spend.pub },
    priv: { view: keys.view.sec, spend: keys.spend.sec },
  };
}

/** A brand-new empty plaintext blob carrying `keys` at `creationHeight`. */
export function freshRawWallet(keys: UserKeys, creationHeight: number): RawWalletV1 {
  const height = Math.max(0, Math.round(creationHeight) || 0);
  return {
    deposits: [],
    withdrawals: [],
    transactions: [],
    txPrivateKeys: {},
    lastHeight: height,
    nonce: "",
    keys,
    creationHeight: height,
    // readSpeed 4 = the "Hurt me plenty" default level (see lib/ui/sync-speed.ts).
    options: { readSpeed: 4, checkMinerTx: false, customNode: false, nodeUrl: "" },
  };
}

/** Build a create/restore-from-mnemonic wallet (keys + blob + seed phrase). */
export function buildFromMnemonic(
  phrase: string,
  creationHeight: number,
  language?: string,
): BuiltWallet {
  const account = restoreFromMnemonic(phrase, language as SeedLanguage | undefined);
  const keys = walletKeysToUserKeys(account.keys);
  return {
    keys,
    raw: freshRawWallet(keys, creationHeight),
    mnemonic: account.mnemonic ?? phrase.trim(),
    address: account.address,
  };
}

/** Build an account from a brand-new random mnemonic at `creationHeight`. */
export function buildNewWallet(
  creationHeight: number,
  language: SeedLanguage = "english",
): BuiltWallet {
  const phrase = crypto.mnemonic.mn_encode(crypto.randomSeed(), language);
  return buildFromMnemonic(phrase, creationHeight, language);
}

/** Build a wallet from a private spend key (view key derived when omitted). */
export function buildFromSpendKey(
  spendKey: string,
  viewKey: string | undefined,
  creationHeight: number,
): BuiltWallet {
  const spend = spendKey.trim();
  let view = (viewKey ?? "").trim();
  if (view === "") {
    // Standard CryptoNote wallet: view secret = generate_keys(cn_fast_hash(spend)).
    view = crypto.generateKeys(crypto.cnFastHash(spend)).sec;
  }
  const keys = userKeysFromPriv(spend, view);
  return {
    keys,
    raw: freshRawWallet(keys, creationHeight),
    address: encodeAddress(keys.pub.spend, keys.pub.view),
  };
}

/** Build a view-only wallet from an address + private view key (no spend secret). */
export function buildViewOnly(
  address: string,
  privateViewKey: string,
  creationHeight: number,
): BuiltWallet {
  const decoded = crypto.ccxAddress.decode_address(address) as {
    spend?: string;
    view?: string;
  };
  if (!decoded || typeof decoded.spend !== "string" || typeof decoded.view !== "string") {
    throw new Error("Invalid CCX address.");
  }
  const keys: UserKeys = {
    pub: { spend: decoded.spend, view: decoded.view },
    priv: { spend: "", view: privateViewKey.trim() },
  };
  return {
    keys,
    raw: freshRawWallet(keys, creationHeight),
    address: encodeAddress(keys.pub.spend, keys.pub.view),
  };
}

/** The seed phrase for a spend secret (best-effort `english` encode), or `""`. */
export function mnemonicFromSpendKey(spendSecret: string): string {
  if (!spendSecret) return "";
  try {
    return crypto.mnemonic.mn_encode(spendSecret, "english") ?? "";
  } catch {
    return "";
  }
}
