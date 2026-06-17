import { describe, expect, it } from "vitest";
import { buildPaymentSendUrl, parsePaymentSendDraft } from "@/lib/ui/payment-link";

const ADDRESS = `ccx7${"a".repeat(94)}`;

describe("buildPaymentSendUrl", () => {
  it("builds v3 send route with query params", () => {
    const url = buildPaymentSendUrl({
      address: ADDRESS,
      amount: "10",
      paymentId: "abc",
      message: "hi",
      v1: false,
      origin: "https://wallet.example",
    });
    expect(url).toBe(
      `https://wallet.example/wallet/send?address=${encodeURIComponent(ADDRESS)}&amount=10&paymentId=abc&message=b64.aGk`,
    );
  });

  it("leaves v3 message out when empty", () => {
    const url = buildPaymentSendUrl({
      address: ADDRESS,
      amount: "10",
      v1: false,
      origin: "https://wallet.example",
    });
    expect(url).toBe(
      `https://wallet.example/wallet/send?address=${encodeURIComponent(ADDRESS)}&amount=10`,
    );
  });

  it("builds v1 hash send URL with txDesc", () => {
    const url = buildPaymentSendUrl({
      address: ADDRESS,
      amount: "5",
      message: "note",
      v1: true,
      origin: "https://wallet.example",
    });
    expect(url).toBe(
      `https://wallet.example/#!send?address=${encodeURIComponent(ADDRESS)}&amount=5&txDesc=note`,
    );
  });
});

describe("parsePaymentSendDraft", () => {
  it("reads v3 query params", () => {
    const params = new URLSearchParams({
      address: ADDRESS,
      amount: "12.5",
      paymentId: "pid",
      message: "hello",
    });
    expect(parsePaymentSendDraft(params.toString())).toEqual({
      address: ADDRESS,
      amount: 12.5,
      paymentId: "pid",
      message: "hello",
    });
  });

  it("reads v3 encoded message", () => {
    const params = new URLSearchParams({
      address: ADDRESS,
      amount: "12.5",
      message: "b64.aGVsbG8",
    });
    expect(parsePaymentSendDraft(params.toString())).toEqual({
      address: ADDRESS,
      amount: 12.5,
      message: "hello",
    });
  });

  it("reads v1 txDesc alias", () => {
    const params = new URLSearchParams({
      address: ADDRESS,
      amount: "3",
      txDesc: "v1 note",
    });
    expect(parsePaymentSendDraft(params.toString())).toEqual({
      address: ADDRESS,
      amount: 3,
      message: "v1 note",
    });
  });

  it("falls back to the raw token on a malformed encoded message (never throws)", () => {
    // A hostile or typo'd `?message=b64.…` link makes atob throw — it must not
    // bubble out of the send page's effect and blank the screen.
    const params = new URLSearchParams({
      address: ADDRESS,
      amount: "1",
      message: "b64.@@@invalid@@@",
    });
    expect(() => parsePaymentSendDraft(params.toString())).not.toThrow();
    const draft = parsePaymentSendDraft(params.toString());
    expect(draft?.address).toBe(ADDRESS);
    expect(draft?.amount).toBe(1);
    expect(draft?.message).toBe("b64.@@@invalid@@@");
  });
});
