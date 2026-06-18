import { getBalance, isValidAddress, transactions as txns } from "conceal-wallet-sdk";
import {
  COIN_UNIT_PLACES,
  REMOTE_NODE_FEE_ATOMIC,
  WALLET_DONATION_ADDRESS,
} from "@/lib/config/config";
import { mapTransaction, mapTransactions } from "@/lib/services/real-sdk/mappers";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { requireRuntime } from "@/lib/services/real-sdk/runtime";
import {
  broadcast,
  decodeRecipient,
  FEE_ATOMIC,
  fetchDecoys,
  MIXIN,
  ownKeys,
  unspentOutputs,
} from "@/lib/services/real-sdk/spend";
import type { SendTransactionInput, TransactionService } from "@/lib/services/transaction.service";
import { assertCanSpend } from "@/lib/services/view-only";
import type { Transaction } from "@/lib/types";
import { walletCopy } from "@/lib/ui/wallet-copy";

const ATOMIC_PER_CCX = 10 ** COIN_UNIT_PLACES;

export const realSdkTransactionService: TransactionService = {
  async listTransactions(): Promise<Transaction[]> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const networkHeight = await rt.daemon.getHeight();
    return mapTransactions(rt.state, networkHeight);
  },

  async sendTransaction(input: SendTransactionInput): Promise<Transaction> {
    await ensureSdkReady();
    const rt = requireRuntime();
    assertCanSpend(rt.viewOnly, walletCopy.viewOnlySendDisabled);

    const amountAtomic = Math.round(input.amount * ATOMIC_PER_CCX);
    if (!Number.isFinite(amountAtomic) || amountAtomic <= 0) {
      throw new Error("Enter a valid amount to send.");
    }
    if (!isValidAddress(input.address)) {
      throw new Error("Invalid recipient address.");
    }

    const recipient = decodeRecipient(input.address);
    const destinations: txns.Destination[] = [
      {
        spendPublicKey: recipient.spendPublicKey,
        viewPublicKey: recipient.viewPublicKey,
        amount: amountAtomic,
      },
    ];

    // Resolve the remote-node fee BEFORE the balance check so its 10000-atomic
    // destination is counted: a node fee is added when the node advertises a fee
    // address that isn't ours (bounded to the donation address when undecodable —
    // mirrors the legacy guard). Omitting it from the check would let a max-balance
    // send pass here only to fail inside buildTransaction on insufficient inputs.
    const feeAddress = await safeNodeFeeAddress(rt.daemon);
    let nodeFeeAtomic = 0;
    if (feeAddress && feeAddress !== rt.account.address) {
      const feeRecipient = decodeFeeRecipient(feeAddress);
      destinations.push({
        spendPublicKey: feeRecipient.spendPublicKey,
        viewPublicKey: feeRecipient.viewPublicKey,
        amount: REMOTE_NODE_FEE_ATOMIC,
      });
      nodeFeeAtomic = REMOTE_NODE_FEE_ATOMIC;
    }

    const balance = getBalance(rt.state);
    if (amountAtomic + FEE_ATOMIC + nodeFeeAtomic > balance.spendable) {
      throw new Error("Amount exceeds available balance.");
    }

    const outputs = unspentOutputs(rt);
    const decoys = await fetchDecoys(rt, outputs);
    const built = txns.buildTransaction({
      keys: rt.account.keys,
      destinations,
      changeKeys: ownKeys(rt),
      unspentOutputs: outputs,
      decoys,
      fee: FEE_ATOMIC,
      mixin: MIXIN,
    });

    await broadcast(rt, built);

    const networkHeight = await rt.daemon.getHeight();
    const fromHistory = mapTransactions(rt.state, networkHeight).find(
      (tx) => tx.hash === built.hash,
    );
    if (fromHistory) {
      return {
        ...fromHistory,
        address: input.address,
        paymentId: input.paymentId,
        message: input.message,
      };
    }
    return {
      ...mapTransaction(
        { hash: built.hash, height: 0, amount: amountAtomic, direction: "out" },
        networkHeight,
      ),
      type: "send",
      address: input.address,
      paymentId: input.paymentId,
      message: input.message,
    };
  },
};

/** The node's advertised fee address, or `""` when it charges none / on error. */
async function safeNodeFeeAddress(daemon: {
  getNodeFeeAddress(): Promise<string>;
}): Promise<string> {
  try {
    return await daemon.getNodeFeeAddress();
  } catch {
    return "";
  }
}

/**
 * Decode the node's fee address; fall back to the donation address when the
 * (untrusted) node returns an undecodable string — bounds a bad node to the fee.
 */
function decodeFeeRecipient(feeAddress: string): {
  spendPublicKey: string;
  viewPublicKey: string;
} {
  const target = isValidAddress(feeAddress) ? feeAddress : WALLET_DONATION_ADDRESS;
  return decodeRecipient(target);
}
