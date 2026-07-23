// @vitest-environment node
import {
  createAccount,
  crypto,
  init,
  transactions as txns,
  type WalletKeys,
} from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";
import { scanRawTransaction } from "@/lib/services/real-sdk/scan";

const DEPOSIT_FEE = 1000;
const TERM = 21_900;

function keysOf(account: ReturnType<typeof createAccount>): WalletKeys {
  return { spend: account.keys.spend, view: account.keys.view };
}

/** Pretty-denomination UTXOs only — selectInputs skips non-pretty amounts. */
function makeInputs(amounts: number[]) {
  return amounts.map((amount, i) => {
    const seed = (i + 1).toString(16).padStart(2, "0").repeat(32);
    const tx = crypto.generateKeys(crypto.scReduce32(seed));
    return {
      amount,
      globalIndex: i + 1,
      outputIndex: 0,
      txPublicKey: tx.pub,
      publicKey: tx.pub,
      keyImage: crypto.generateKeyImage(tx.pub, tx.sec),
    };
  });
}

describe("scan.ts → SDK daemon bridge", () => {
  it("finds owned deposits when daemon uses txout_to_deposit_key + string term", async () => {
    await init();
    const wallet = createAccount("english");
    const amount = 10_000_000_000;
    const built = txns.buildDepositTransaction({
      keys: wallet.keys,
      amount,
      termBlocks: TERM,
      ownKeys: { spendPublicKey: wallet.keys.spend.pub, viewPublicKey: wallet.keys.view.pub },
      // Split amount+fee into pretty dens; a single (amount+fee) lump is non-pretty.
      unspentOutputs: makeInputs([amount, DEPOSIT_FEE]),
      decoys: [],
      fee: DEPOSIT_FEE,
      mixin: 0,
    });

    const depKey = built.outputs[0]?.publicKey as string;
    const result = scanRawTransaction(
      {
        transaction: {
          extra: built.extra,
          vin: [],
          vout: [
            {
              amount: String(amount),
              target: {
                type: "txout_to_deposit_key",
                data: { keys: [depKey], required_signatures: 1, term: String(TERM) },
              },
            },
          ],
        },
        timestamp: 1_700_000_000,
        outputIndexes: [424242],
        height: 500_000,
        blockHash: "aa".repeat(32),
        hash: "bb".repeat(32),
        fee: DEPOSIT_FEE,
      },
      keysOf(wallet),
    );

    expect(result).not.toBeNull();
    expect(result?.ownedDeposits).toHaveLength(1);
    expect(result?.ownedDeposits[0]?.amount).toBe(amount);
    expect(result?.ownedDeposits[0]?.term).toBe(TERM);
    expect(result?.ownedDeposits[0]?.globalIndex).toBe(424242);
  });
});
