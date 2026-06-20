import { COIN_UNIT_PLACES, DEPOSIT_RATE_V3 } from "@/lib/config/config";
import { InterestCalculator } from "@/lib/deposits/interest";

// Shared deposit-interest estimator (V3 model). Extracted from the calculator
// dialog so the dialog and the Deposits rail compute identically.

/** Tier index (0–2) for a CCX principal — selects the base-APR band. */
export function getDepositTierIndex(ccx: number): number {
  if (ccx >= 20000) return 2;
  if (ccx >= 10000) return 1;
  return 0;
}

export interface DepositInterestEstimate {
  /** Estimated interest in CCX. */
  interestCcx: number;
  /** Effective annual rate (percent). */
  earPct: number;
  /** Period (term) rate (percent). */
  eirPct: number;
}

/**
 * Estimate deposit interest. `ccx` must be a whole, positive number and `months`
 * a positive number; anything else yields a zeroed estimate (matches the form's
 * validation). Guarding `months` too keeps the exported contract safe for callers
 * that don't pre-clamp the term (a non-positive term would otherwise drive `ear`
 * below `base` and return a negative period rate).
 */
export function computeDepositInterest(ccx: number, months: number): DepositInterestEstimate {
  if (
    !Number.isFinite(ccx) ||
    ccx <= 0 ||
    !Number.isInteger(ccx) ||
    !Number.isFinite(months) ||
    months <= 0
  ) {
    return { interestCcx: 0, earPct: 0, eirPct: 0 };
  }

  const mCoin = 10 ** COIN_UNIT_PLACES;
  const atomic = ccx * mCoin;
  const termBlocks = months * 21900;
  const lockHeight = 999999999;

  const interestAtomic = InterestCalculator.calculateInterest(atomic, termBlocks, lockHeight);
  const interestCcx = interestAtomic / mCoin;

  const base = DEPOSIT_RATE_V3[getDepositTierIndex(ccx)];
  const ear = base + (Math.min(months, 12) - 1) * 0.001;
  const eir = (ear / 12) * months;

  return { interestCcx, earPct: ear * 100, eirPct: eir * 100 };
}
