import type { Deposit } from "@/lib/types"

export type CreateDepositInput = {
  amount: number
  durationMonths: number
}

export interface DepositService {
  listDeposits(): Promise<Deposit[]>
  createDeposit(input: CreateDepositInput): Promise<Deposit>
}
