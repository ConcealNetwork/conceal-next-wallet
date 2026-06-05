import {
  COIN_TICKER_FULL,
  WALLET_DONATION_ADDRESS,
} from "@/lib/config/config";

const MONERO_DONATION_ADDRESS =
  "41gW3g6qVxoTqRQAZwNpREfYntrmH31PvJLxKVfU7hGySukxB2YVMn3exzoEfV6pAy2GzubVKZpTrRfYJnMCrjG421e8WbY";

export const DONATION_CRYPTO_ADDRESSES = [
  {
    name: `Conceal (${COIN_TICKER_FULL})`,
    address: WALLET_DONATION_ADDRESS,
  },
  {
    name: "Monero (XMR)",
    address: MONERO_DONATION_ADDRESS,
  },
] as const;

export const DONATION_METHOD_KEYS = ["crypto", "paypal", "apple", "visa"] as const;

export type DonationMethodKey = (typeof DONATION_METHOD_KEYS)[number];

export const DONATION_METHOD_LABELS: Record<
  DonationMethodKey,
  "Cryptocurrency" | "Credit/Debit Card" | "PayPal" | "Apple Pay"
> = {
  crypto: "Cryptocurrency",
  visa: "Credit/Debit Card",
  paypal: "PayPal",
  apple: "Apple Pay",
};

/** SectionCard description when exactly one payment method is enabled. */
export const DONATION_SOLE_METHOD_DESCRIPTIONS: Record<DonationMethodKey, string> = {
  crypto: "Donate using cryptocurrency",
  visa: "Donate using credit card",
  paypal: "Donate using PayPal",
  apple: "Donate using Apple Pay",
};

export function getDonationMethodsDescription(
  enabledMethods: DonationMethodKey[],
): string {
  if (enabledMethods.length === 1) {
    return DONATION_SOLE_METHOD_DESCRIPTIONS[enabledMethods[0]];
  }
  return "Multiple ways to show your support";
}

const METHOD_ALIASES: Record<string, DonationMethodKey> = {
  crypto: "crypto",
  cryptocurrency: "crypto",
  paypal: "paypal",
  apple: "apple",
  "apple pay": "apple",
  applepay: "apple",
  visa: "visa",
  card: "visa",
  "credit/debit card": "visa",
};

function parseDonationMethodKey(raw: string): DonationMethodKey | null {
  const normalized = raw.trim().toLowerCase();
  return METHOD_ALIASES[normalized] ?? null;
}

/** `OFF` hides the fiat amount / recurring donation block. Default: `OFF`. */
function readDonationSupportFiat(): boolean {
  const raw = process.env.DONATION_SUPPORT_FIAT;
  if (raw === undefined || raw === "") return false;
  return raw.trim().toUpperCase() !== "OFF";
}

/** Comma-separated method keys, e.g. `Crypto` or `crypto,paypal,apple,visa`. Default: `crypto`. */
function readDonationSupportMethods(): DonationMethodKey[] {
  const raw = process.env.DONATION_SUPPORT_METHOD;
  if (raw === undefined || raw === "") return ["crypto"];

  const parsed = raw
    .split(",")
    .map(parseDonationMethodKey)
    .filter((key): key is DonationMethodKey => key !== null);

  return parsed.length > 0 ? [...new Set(parsed)] : ["crypto"];
}

export type DonationConfig = {
  fiatEnabled: boolean;
  enabledMethods: DonationMethodKey[];
};

export function getDonationConfig(): DonationConfig {
  return {
    fiatEnabled: readDonationSupportFiat(),
    enabledMethods: readDonationSupportMethods(),
  };
}
