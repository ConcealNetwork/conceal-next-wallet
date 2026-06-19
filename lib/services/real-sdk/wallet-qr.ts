/**
 * Decode a Conceal wallet-QR payload into keys / mnemonic, WITHOUT importing
 * `lib/wallet-core` (the SDK engine must stay engine-clean). Mirrors the legacy
 * `CoinUri.decodeWallet` scheme:
 *
 *   conceal.<ccx7-address>?spend_key=<hex>?view_key=<hex>?mnemonic_seed=<words>?height=<n>
 *
 * Quirks preserved from the legacy encoder: the `conceal.` prefix is optional (a bare
 * address is accepted), and options are "?"-separated (not "&") — that is how
 * `CoinUri.encodeWalletKeys` emits them. Pure string parsing; the recovered keys are
 * validated downstream when the wallet is built.
 */

const WALLET_PREFIX = "conceal.";

/** Fields recoverable from a wallet QR (any subset may be present). */
export interface DecodedWalletQr {
  address?: string;
  spendKey?: string;
  viewKey?: string;
  mnemonicSeed?: string;
  height?: number;
}

/** Parse a wallet-QR payload string into its parts (no validation/crypto). */
export function decodeWalletQr(payload: string): DecodedWalletQr {
  let data = payload.trim();
  if (data.startsWith(WALLET_PREFIX)) data = data.slice(WALLET_PREFIX.length);

  const parts = data.split("?");
  const decoded: DecodedWalletQr = {};
  const address = parts[0]?.trim();
  if (address) decoded.address = address;

  for (let i = 1; i < parts.length; i++) {
    const segment = parts[i];
    const eq = segment.indexOf("=");
    if (eq < 0) continue;
    const key = segment.slice(0, eq).trim();
    const value = segment.slice(eq + 1).trim();
    if (!value) continue;
    switch (key) {
      case "spend_key":
        decoded.spendKey = value;
        break;
      case "view_key":
        decoded.viewKey = value;
        break;
      case "mnemonic_seed":
        decoded.mnemonicSeed = value;
        break;
      case "height": {
        const height = Number.parseInt(value, 10);
        if (Number.isFinite(height) && height >= 0) decoded.height = height;
        break;
      }
    }
  }
  return decoded;
}
