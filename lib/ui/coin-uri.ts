// Payment-URI utility (#91 decoupling): moved out of lib/wallet-core so the UI
// depends on a neutral module, not the engine.
/*
 * Copyright (c) 2018 Gnock
 * Copyright (c) 2018-2019 The Masari Project
 * Copyright (c) 2018-2020 The Karbo developers
 * Copyright (c) 2018-2025 Conceal Community, Conceal.Network & Conceal Devs
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */

import { COIN_URI_PREFIX } from "@/lib/config/config";

/** Decoded `conceal:` transaction (payment) URI. */
export interface DecodedTxUri {
  address: string;
  paymentId?: string;
  recipientName?: string;
  amount?: string;
  description?: string;
}

/** Decoded `conceal:` wallet-keys URI. */
export interface DecodedWalletUri {
  address: string;
  spendKey?: string;
  viewKey?: string;
  mnemonicSeed?: string;
  height?: string;
  nonce?: string;
  encryptMethod?: string;
}

export const CoinUri = {
  coinTxPrefix: "conceal.", //legacy, used to be 'conceal:', but the char ':' was creating scanning issue
  coinAddressPrefix: "ccx7", //coin Address prefix, to check address , without using coinTxPrefix
  coinWalletPrefix: "conceal.", //legacy, used to be 'conceal:'
  coinAddressLength: 98,

  /** First URI segment (before ?) → bare ccx7 address. */
  resolveTxAddress(firstSegment: string): string {
    const seg = firstSegment.trim();
    if (seg.startsWith(CoinUri.coinAddressPrefix)) {
      return seg;
    }
    if (seg.startsWith(CoinUri.coinTxPrefix + CoinUri.coinAddressPrefix)) {
      return seg.slice(CoinUri.coinTxPrefix.length);
    }
    if (seg.startsWith(COIN_URI_PREFIX + CoinUri.coinAddressPrefix)) {
      return seg.slice(COIN_URI_PREFIX.length);
    }
    throw "missing_prefix";
  },

  decodeTx(str: string): DecodedTxUri | null {
    const temp = str.replace(/&/g, "?").trim();
    const exploded = temp.split("?");

    if (exploded.length === 0) throw "missing_address";

    const address = CoinUri.resolveTxAddress(exploded[0]);

    if (address.length !== CoinUri.coinAddressLength) throw "invalid_address_length";

    const decodedUri: DecodedTxUri = {
      address,
    };

    for (let i = 0; i < exploded.length; ++i) {
      const optionParts = exploded[i].split("=");
      if (optionParts.length === 2) {
        switch (optionParts[0].trim()) {
          case "payment_id":
            decodedUri.paymentId = optionParts[1];
            break;
          case "tx_payment_id":
            decodedUri.paymentId = optionParts[1];
            break;
          case "recipient_name":
            decodedUri.recipientName = optionParts[1];
            break;
          case "amount":
            decodedUri.amount = optionParts[1];
            break;
          case "tx_amount":
            decodedUri.amount = optionParts[1];
            break;
          case "tx_description":
            decodedUri.description = optionParts[1];
            break;
          case "label":
            decodedUri.description = optionParts[1];
            break;
        }
      }
    }
    return decodedUri;
  },

  isTxValid(str: string): boolean {
    try {
      CoinUri.decodeTx(str);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  encodeTx(
    address: string,
    paymentId: string | null = null,
    amount: string | null = null,
    recipientName: string | null = null,
    description: string | null = null,
    // version retained for call-site compatibility; both v1 and v3 now emit a
    // bare address. Upstream conceal-web-wallet dropped the 'conceal:' prefix —
    // "the char ':' was creating scanning issue" — so QRs scan in the legacy
    // wallet. decodeTx stays tolerant of 'conceal:'/'conceal.'/bare for back-compat.
    _version: "v1" | "v3" = "v3",
  ): string {
    let encoded = address; //legacy: version === "v3" ? COIN_URI_PREFIX + address : address
    if (address.length !== CoinUri.coinAddressLength) throw "invalid_address_length";

    if (paymentId !== null) encoded += `?payment_id=${paymentId}`;
    if (amount !== null) encoded += `?amount=${amount}`;
    if (recipientName !== null) encoded += `?recipient_name=${recipientName}`;
    if (description !== null) encoded += `?label=${description}`;
    return encoded;
  },

  stripWalletPrefix(str: string): string | null {
    const trimmed = str.trim();
    if (trimmed.startsWith(CoinUri.coinWalletPrefix)) {
      return trimmed.slice(CoinUri.coinWalletPrefix.length).trim();
    }
    if (trimmed.startsWith("conceal:")) {
      return trimmed.slice("conceal:".length).trim();
    }
    return null;
  },

  decodeWallet(str: string): DecodedWalletUri {
    const data = CoinUri.stripWalletPrefix(str);
    if (data === null) throw "missing_prefix";

    const exploded = data.split("?");

    if (exploded.length === 0) throw "missing_address";

    if (exploded[0].length !== CoinUri.coinAddressLength) throw "invalid_address_length";

    const decodedUri: DecodedWalletUri = {
      address: exploded[0],
    };

    for (let i = 1; i < exploded.length; ++i) {
      const optionParts = exploded[i].split("=");
      if (optionParts.length === 2) {
        switch (optionParts[0].trim()) {
          case "spend_key":
            decodedUri.spendKey = optionParts[1];
            break;
          case "view_key":
            decodedUri.viewKey = optionParts[1];
            break;
          case "mnemonic_seed":
            decodedUri.mnemonicSeed = optionParts[1];
            break;
          case "height":
            decodedUri.height = optionParts[1];
            break;
          case "nonce":
            decodedUri.nonce = optionParts[1];
            break;
          case "encrypt_method":
            decodedUri.encryptMethod = optionParts[1];
            break;
        }
      }
    }

    if (
      typeof decodedUri.mnemonicSeed !== "undefined" ||
      typeof decodedUri.spendKey !== "undefined" ||
      (typeof decodedUri.viewKey !== "undefined" && typeof decodedUri.address !== "undefined")
    ) {
      return decodedUri;
    } else throw "missing_seeds";
  },

  isWalletValid(str: string): boolean {
    try {
      CoinUri.decodeWallet(str);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  },

  encodeWalletKeys(
    address: string,
    spendKey: string,
    viewKey: string | null = null,
    height: number | null = null,
    encryptMethod: string | null = null,
    nonce: string | null = null,
  ): string {
    let encoded = CoinUri.coinWalletPrefix + address;
    if (address.length !== CoinUri.coinAddressLength) throw "invalid_address_length";

    if (spendKey !== null) encoded += `?spend_key=${spendKey}`;
    if (viewKey !== null) encoded += `?view_key=${viewKey}`;
    if (height !== null) encoded += `?height=${height}`;
    if (nonce !== null) encoded += `?nonce=${nonce}`;
    if (encryptMethod !== null) encoded += `?encrypt_method=${encryptMethod}`;
    return encoded;
  },
};
