import { isSendToSelf } from "@/lib/validation/ccx";

/**
 * A safety annotation shown in the Send confirm dialog so the user can sanity-check
 * a transfer before broadcasting. Ordered most-critical first.
 */
export type SendWarning =
  | { kind: "self-send" }
  | { kind: "address-book-match"; label: string }
  | { kind: "locked-deposits"; ccx: number };

export interface SendWarningInput {
  /** The recipient address being confirmed. */
  recipient: string;
  /** This wallet's own address (for self-send detection). */
  walletAddress: string;
  /** Address-book label when the recipient matches a saved contact, else null. */
  contactLabel: string | null;
  /** CCX currently locked in immature (unmatured) deposits. */
  lockedDepositsCcx: number;
  /** Spendable balance in CCX. */
  availableCcx: number;
  /** Total this send costs (amount + fees) in CCX. */
  sendTotalCcx: number;
}

/**
 * Derive the safety warnings for a pending send. Pure — the UI maps the result to
 * styled rows. Self-send is surfaced first (most critical), then a positive
 * address-book confirmation, then a locked-deposit warning — the last only when it
 * is actually relevant (the send exceeds the spendable balance *and* funds are
 * locked in deposits, which explains the shortfall). Showing it on every send would
 * be noise.
 */
export function deriveSendWarnings(input: SendWarningInput): SendWarning[] {
  const warnings: SendWarning[] = [];

  // Direct self-sends are blocked at the form, but a `conceal:` payment link to
  // one's own address reaches the confirm dialog via the "Continue" path — so this
  // is a live last line of defence, not dead code.
  if (isSendToSelf(input.recipient, input.walletAddress)) {
    warnings.push({ kind: "self-send" });
  }
  if (input.contactLabel) {
    warnings.push({ kind: "address-book-match", label: input.contactLabel });
  }
  if (input.lockedDepositsCcx > 0 && input.sendTotalCcx > input.availableCcx) {
    warnings.push({ kind: "locked-deposits", ccx: input.lockedDepositsCcx });
  }

  return warnings;
}
