import { describe, expect, it } from "vitest";
import { resolveTransactionDisplayAmount, resolveTransactionType } from "@/lib/wallet-core/mappers";
import { Transaction, TransactionIn, TransactionOut } from "@/lib/wallet-core/Transaction";

describe("view-only transaction model", () => {
  it("deposit principal comes from type-03 outs", () => {
    const tx = new Transaction();
    const depositOut = new TransactionOut();
    depositOut.type = "03";
    depositOut.amount = 5_000_000;
    const changeOut = new TransactionOut();
    changeOut.type = "02";
    changeOut.amount = 380_000;
    tx.outs = [depositOut, changeOut];
    tx.ins = [];

    expect(resolveTransactionType(tx)).toBe("deposit");
    expect(resolveTransactionDisplayAmount(tx, "deposit")).toBe(5_000_000);
  });

  it("withdrawal display uses incoming type-02 outs (principal + interest)", () => {
    const tx = new Transaction();
    const withdrawalIn = new TransactionIn();
    withdrawalIn.type = "03";
    withdrawalIn.amount = 4_000_000;
    const unlockedOut = new TransactionOut();
    unlockedOut.type = "02";
    unlockedOut.amount = 4_010_000;
    tx.ins = [withdrawalIn];
    tx.outs = [unlockedOut];

    expect(resolveTransactionType(tx)).toBe("withdrawal");
    expect(resolveTransactionDisplayAmount(tx, "withdrawal")).toBe(4_010_000);
  });
});
