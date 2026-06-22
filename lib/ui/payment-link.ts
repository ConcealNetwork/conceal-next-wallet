// CoinUri is a pure string codec (only pulls a config constant — no wallet
// engine), so importing it here keeps mock mode engine-free. Same precedent as
// lib/ui/parse-scanned-send-payload.ts.
import { CoinUri } from "@/lib/ui/coin-uri";

const PAYMENT_MESSAGE_ENC_PREFIX = "b64.";

function encodePaymentMessage(message: string): string {
  const bytes = new TextEncoder().encode(message);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const b64 = btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${PAYMENT_MESSAGE_ENC_PREFIX}${b64}`;
}

function decodePaymentMessage(raw: string): string {
  if (!raw.startsWith(PAYMENT_MESSAGE_ENC_PREFIX)) return raw;
  // A hostile or typo'd `?message=b64.…` link can make `atob` throw
  // (InvalidCharacterError) or yield garbage. Never let a bad link blank the
  // send page — fall back to the raw token so the page still renders.
  try {
    const b64 = raw.slice(PAYMENT_MESSAGE_ENC_PREFIX.length).replace(/-/g, "+").replace(/_/g, "/");
    const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  } catch {
    return raw;
  }
}

export type PaymentSendDraft = {
  address: string;
  amount: number;
  paymentId?: string;
  message?: string;
  /** Recipient name / label — parity with the QR/CoinUri `recipient_name`/`label`. */
  label?: string;
};

export type PaymentLinkInput = {
  address: string;
  amount: string;
  paymentId?: string;
  message?: string;
  /** Recipient name / label — parity with the QR/CoinUri `recipient_name`/`label`. */
  label?: string;
  origin?: string;
};

/** Internal post-unlock redirect from `?next=` (path + search only). */
export function getSafeNextPath(search?: string): string | undefined {
  const raw = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""),
  ).get("next");
  if (!raw?.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

/** `/wallet/send?address&amount…` on the current app (respects `NEXT_PUBLIC_BASE_PATH`). */
export function buildPaymentSendUrl(input: PaymentLinkInput): string {
  const origin = input.origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const params = new URLSearchParams();
  params.set("address", input.address);
  params.set("amount", input.amount);
  if (input.paymentId?.trim()) params.set("paymentId", input.paymentId.trim());
  if (input.message?.trim()) {
    params.set("message", encodePaymentMessage(input.message.trim()));
  }
  if (input.label?.trim()) params.set("label", input.label.trim());

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${origin}${basePath}/wallet/send?${params.toString()}`;
}

/** Build a draft from a `conceal:`/`web+conceal:`/bare CoinUri string. */
function draftFromCoinUri(raw: string): PaymentSendDraft | null {
  let decoded: ReturnType<typeof CoinUri.decodeTx>;
  try {
    // CoinUri.decodeTx tolerates `conceal:`/`conceal.`/bare; strip our PWA
    // protocol scheme first. It throws bare strings on malformed input.
    decoded = CoinUri.decodeTx(raw.replace(/^web\+conceal:/i, ""));
  } catch {
    return null;
  }
  if (!decoded?.address || !decoded.amount || !/^\d+(\.\d+)?$/.test(decoded.amount)) return null;
  const amount = Number.parseFloat(decoded.amount);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return {
    address: decoded.address,
    amount,
    paymentId: decoded.paymentId || undefined,
    message: decoded.description || undefined,
    label: decoded.recipientName || undefined,
  };
}

export function parsePaymentSendDraft(search?: string): PaymentSendDraft | null {
  const params = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""),
  );
  // PWA protocol-handler / standard-URI form: `?uri=web+conceal:ccx7…?amount=…`.
  const uri = params.get("uri")?.trim();
  if (uri) return draftFromCoinUri(uri);

  const address = params.get("address")?.trim();
  const amountRaw = params.get("amount")?.trim();
  if (!address || !amountRaw) return null;

  // BIP21 mandates a period decimal separator. parseFloat would silently
  // truncate a comma-decimal amount ("1,5" → 1), so reject any non-numeric
  // shape (commas, spaces, trailing junk) up front rather than misreading it.
  if (!/^\d+(\.\d+)?$/.test(amountRaw)) return null;

  const amount = Number.parseFloat(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const paymentId =
    params.get("paymentId")?.trim() || params.get("payment_id")?.trim() || undefined;
  const messageRaw = params.get("message")?.trim() || params.get("txDesc")?.trim() || undefined;
  // `message` may be a `b64.`-encoded token (our links) or a plain value
  // (other-wallet / hand-written links); decodePaymentMessage returns plain
  // values unchanged, so this covers both.
  const message = messageRaw ? decodePaymentMessage(messageRaw) : undefined;
  const label = params.get("label")?.trim() || params.get("recipient_name")?.trim() || undefined;

  return { address, amount, paymentId, message, label };
}
