import {
  AVG_BLOCK_TIME_SECONDS,
  DEPOSIT_MAX_TERM_MONTH,
  DEPOSIT_MIN_TERM_BLOCK,
  DEPOSIT_MIN_TERM_MONTH,
} from "@/lib/config/config"
import type { Deposit, Transaction } from "@/lib/types"

export type CreateDepositInput = {
  /** Whole CCX coins (integer), same as v1 deposit modal. */
  amount: number
  durationMonths: number
}

export type WithdrawDepositInput = {
  txHash: string
  globalOutputIndex: number
}

export const DEPOSIT_DURATION_OPTIONS = Array.from(
  { length: DEPOSIT_MAX_TERM_MONTH - DEPOSIT_MIN_TERM_MONTH + 1 },
  (_, index) => DEPOSIT_MIN_TERM_MONTH + index,
) as readonly number[]

/** Indicative APR for mock UI; real deposits use on-chain interest from the mapper. */
export const DEPOSIT_APR_BY_DURATION_MONTHS: Record<number, number> = {
  1: 2.9,
  3: 3.2,
  6: 3.8,
  12: 4.6,
}

export function getDepositApr(durationMonths: number) {
  return DEPOSIT_APR_BY_DURATION_MONTHS[durationMonths] ?? DEPOSIT_APR_BY_DURATION_MONTHS[12] ?? 4.6
}

export function estimateDepositInterest(amount: number, durationMonths: number) {
  return amount * (getDepositApr(durationMonths) / 100) * (durationMonths / 12)
}

export function estimateDepositUnlockDays(durationMonths: number) {
  return Math.round((durationMonths * DEPOSIT_MIN_TERM_BLOCK * AVG_BLOCK_TIME_SECONDS) / 86400)
}

export type DepositConstraints = {
  maxDepositAmount: number
  isDepositDisabled: boolean
  isWalletSyncing: boolean
  hasPendingDeposit: boolean
}

export type PreviewCreateDepositInput = {
  amount: number
  durationMonths: number
}

export type PreviewCreateDepositResult = {
  interestCcx: number
  indicativeApr: number
}

export interface DepositService {
  listDeposits(): Promise<Deposit[]>
  getDepositConstraints(): Promise<DepositConstraints>
  previewCreateDeposit(input: PreviewCreateDepositInput): Promise<PreviewCreateDepositResult>
  createDeposit(input: CreateDepositInput): Promise<Deposit>
  withdrawDeposit(input: WithdrawDepositInput): Promise<Transaction>
}
