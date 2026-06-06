const CCX_ADDRESS_LENGTH = 98;
const CCX_ADDRESS_PREFIX = "ccx7";
const CCX_PRIVATE_KEY_PATTERN = /^[0-9a-fA-F]{64}$/;

export function addressIsValid(address: string): boolean {
  const trimmed = address.trim();
  return trimmed.startsWith(CCX_ADDRESS_PREFIX) && trimmed.length === CCX_ADDRESS_LENGTH;
}

/** A Conceal private spend/view key is 64 hexadecimal characters. */
export function privateKeyIsValid(key: string): boolean {
  return CCX_PRIVATE_KEY_PATTERN.test(key.trim());
}

export function paymentIdIsValid(paymentId: string): boolean {
  const trimmed = paymentId.trim();
  if (trimmed === "") return true;
  return /^[0-9a-fA-F]{64}$/.test(trimmed) || /^[0-9a-fA-F]{16}$/.test(trimmed);
}

export function generatePaymentId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function normalizePaymentId(paymentId: string | undefined): string {
  return (paymentId ?? "").trim().toLowerCase();
}
