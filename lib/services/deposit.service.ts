import type { Deposit } from "@/lib/types"

export type CreateDepositInput = {
  amount: number
  durationMonths: number
}

export const DEPOSIT_DURATION_OPTIONS = [3, 6, 12, 24] as const

// TODO(backend): replace mock APR tiers with values returned by walletd/RPC.
export const DEPOSIT_APR_BY_DURATION_MONTHS: Record<number, number> = {
  3: 3.2,
  6: 3.8,
  12: 4.6,
  24: 5.4,
}

export function getDepositApr(durationMonths: number) {
  return DEPOSIT_APR_BY_DURATION_MONTHS[durationMonths] ?? DEPOSIT_APR_BY_DURATION_MONTHS[12]
}

export function estimateDepositInterest(amount: number, durationMonths: number) {
  return amount * (getDepositApr(durationMonths) / 100) * (durationMonths / 12)
}

export function estimateDepositUnlockDays(durationMonths: number) {
  // TODO(backend): derive exact unlock height/date from the wallet deposit transaction.
  return Math.round(durationMonths * 30.4375)
}

export interface DepositService {
  listDeposits(): Promise<Deposit[]>
  createDeposit(input: CreateDepositInput): Promise<Deposit>
}
