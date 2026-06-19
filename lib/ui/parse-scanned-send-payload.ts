import { CoinUri } from "@/lib/ui/coin-uri";

export type ScannedSendDraft = {
  address: string;
  amount?: number;
  paymentId?: string;
  message?: string;
};

/** Parse a QR payload for the send form — mirrors v1 `SendView.handleScanResult`. */
export function parseScannedSendPayload(payload: string): ScannedSendDraft | null {
  const trimmed = payload.trim();
  if (!trimmed) return null;

  try {
    const tx = CoinUri.decodeTx(trimmed);
    if (tx) {
      const amount = tx.amount !== undefined ? Number.parseFloat(tx.amount) : undefined;
      return {
        address: tx.address,
        amount: amount !== undefined && Number.isFinite(amount) ? amount : undefined,
        paymentId: tx.paymentId,
        message: tx.description ?? tx.recipientName,
      };
    }
  } catch {
    // Fall through to wallet / raw address handling.
  }

  try {
    const wallet = CoinUri.decodeWallet(trimmed);
    if (wallet) {
      return { address: wallet.address };
    }
  } catch {
    // Fall through to raw payload.
  }

  return { address: trimmed };
}
