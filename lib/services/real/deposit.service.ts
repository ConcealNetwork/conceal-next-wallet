import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import type {
  CreateDepositInput,
  DepositConstraints,
  DepositService,
  PreviewCreateDepositInput,
  WithdrawDepositInput,
} from "@/lib/services/deposit.service";
import type { Deposit, Transaction } from "@/lib/types";

async function depositOps() {
  await ensureAllWalletLegacyLibs();
  return import("@/lib/wallet-core/wallet-operations");
}

export const realDepositService: DepositService = {
  async listDeposits(): Promise<Deposit[]> {
    return (await depositOps()).listDepositsOperation();
  },
  async getDepositConstraints(): Promise<DepositConstraints> {
    return (await depositOps()).getDepositConstraintsOperation();
  },
  async previewCreateDeposit(input: PreviewCreateDepositInput) {
    return (await depositOps()).previewCreateDepositOperation(input);
  },
  async createDeposit(input: CreateDepositInput): Promise<Deposit> {
    return (await depositOps()).createDepositOperation(input);
  },
  async withdrawDeposit(input: WithdrawDepositInput): Promise<Transaction> {
    return (await depositOps()).withdrawDepositOperation(input);
  },
};
