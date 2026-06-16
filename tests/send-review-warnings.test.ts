import { describe, expect, it } from "vitest";
import { deriveSendWarnings, type SendWarningInput } from "@/lib/ui/send-review-warnings";

const ME = `ccx7${"a".repeat(94)}`;
const OTHER = `ccx7${"b".repeat(94)}`;

/** Defaults: a covered send (total well under available) to an unknown address. */
function input(overrides: Partial<SendWarningInput> = {}): SendWarningInput {
  return {
    recipient: OTHER,
    walletAddress: ME,
    contactLabel: null,
    lockedDepositsCcx: 0,
    availableCcx: 1000,
    sendTotalCcx: 10,
    ...overrides,
  };
}

describe("deriveSendWarnings", () => {
  it("returns nothing for a plain, covered send to an unknown address", () => {
    expect(deriveSendWarnings(input())).toEqual([]);
  });

  it("flags a self-send", () => {
    expect(deriveSendWarnings(input({ recipient: ME }))).toEqual([{ kind: "self-send" }]);
  });

  it("does not flag self-send when the recipient is empty", () => {
    expect(deriveSendWarnings(input({ recipient: "" }))).toEqual([]);
  });

  it("confirms an address-book match with the contact label", () => {
    expect(deriveSendWarnings(input({ contactLabel: "Ana" }))).toEqual([
      { kind: "address-book-match", label: "Ana" },
    ]);
  });

  describe("locked-deposit note", () => {
    it("fires only when the send exceeds available and funds are locked", () => {
      expect(
        deriveSendWarnings(input({ lockedDepositsCcx: 500, availableCcx: 634, sendTotalCcx: 700 })),
      ).toEqual([{ kind: "locked-deposits", ccx: 500 }]);
    });

    it("stays silent when the send is covered by available balance", () => {
      expect(
        deriveSendWarnings(input({ lockedDepositsCcx: 500, availableCcx: 634, sendTotalCcx: 100 })),
      ).toEqual([]);
    });

    it("stays silent when nothing is locked, even if the send exceeds available", () => {
      expect(
        deriveSendWarnings(input({ lockedDepositsCcx: 0, availableCcx: 50, sendTotalCcx: 100 })),
      ).toEqual([]);
    });
  });

  it("orders self-send first, then address-book match, then locked deposits", () => {
    expect(
      deriveSendWarnings(
        input({
          recipient: ME,
          contactLabel: "My Savings",
          lockedDepositsCcx: 3,
          availableCcx: 1,
          sendTotalCcx: 10,
        }),
      ),
    ).toEqual([
      { kind: "self-send" },
      { kind: "address-book-match", label: "My Savings" },
      { kind: "locked-deposits", ccx: 3 },
    ]);
  });
});
