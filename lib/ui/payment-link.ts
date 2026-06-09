export type PaymentSendDraft = {
  address: string;
  amount: number;
  paymentId?: string;
  message?: string;
};

export type PaymentLinkInput = {
  address: string;
  amount: string;
  paymentId?: string;
  message?: string;
  /** v1 web-wallet hash URL (`#!send?…`); otherwise v3 app route. */
  v1: boolean;
  origin?: string;
};

/** Internal post-unlock redirect from `?next=` (path + search only). */
export function getSafeNextPath(search?: string): string | undefined {
  const raw = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""),
  ).get("next");
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return undefined;
  return raw;
}

/** v3: `/base/wallet/send?address&amount…` — v1: `/#!send?address&amount&txDesc…` */
export function buildPaymentSendUrl(input: PaymentLinkInput): string {
  const origin =
    input.origin ?? (typeof window !== "undefined" ? window.location.origin : "");
  const params = new URLSearchParams();
  params.set("address", input.address);
  params.set("amount", input.amount);
  if (input.paymentId?.trim()) params.set("paymentId", input.paymentId.trim());
  if (input.message?.trim()) {
    if (input.v1) params.set("txDesc", input.message.trim());
    else params.set("message", input.message.trim());
  }

  if (input.v1) {
    return `${origin}/#!send?${params.toString()}`;
  }

  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
  return `${origin}${basePath}/wallet/send?${params.toString()}`;
}

export function parsePaymentSendDraft(
  search?: string,
): PaymentSendDraft | null {
  const params = new URLSearchParams(
    search ?? (typeof window !== "undefined" ? window.location.search : ""),
  );
  const address = params.get("address")?.trim();
  const amountRaw = params.get("amount");
  if (!address || !amountRaw) return null;

  const amount = Number.parseFloat(amountRaw);
  if (!Number.isFinite(amount) || amount <= 0) return null;

  const paymentId =
    params.get("paymentId")?.trim() || params.get("payment_id")?.trim() || undefined;
  const message = params.get("message")?.trim() || params.get("txDesc")?.trim() || undefined;

  return { address, amount, paymentId, message };
}
