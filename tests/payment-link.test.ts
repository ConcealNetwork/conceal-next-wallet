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

  it("carries a label query param (parity with the QR/CoinUri path)", () => {
    const url = buildPaymentSendUrl({
      address: ADDRESS,
      amount: "10",
      label: "Acme Corp",
      v1: false,
      origin: "https://wallet.example",
    });
    expect(url).toBe(
      `https://wallet.example/wallet/send?address=${encodeURIComponent(ADDRESS)}&amount=10&label=Acme+Corp`,
    );
  });

  it("leaves label out when blank", () => {
    const url = buildPaymentSendUrl({
      address: ADDRESS,
      amount: "10",
      label: "   ",
      v1: false,
      origin: "https://wallet.example",
    });
    expect(url).toBe(
      `https://wallet.example/wallet/send?address=${encodeURIComponent(ADDRESS)}&amount=10`,
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

  it("accepts a plain (non-b64.) message value", () => {
    const params = new URLSearchParams({
      address: ADDRESS,
      amount: "2",
      message: "plain text",
    });
    expect(parsePaymentSendDraft(params.toString())).toEqual({
      address: ADDRESS,
      amount: 2,
      message: "plain text",
    });
  });

  it("reads a label query param", () => {
    const params = new URLSearchParams({
      address: ADDRESS,
      amount: "2",
      label: "Acme Corp",
    });
    expect(parsePaymentSendDraft(params.toString())).toEqual({
      address: ADDRESS,
      amount: 2,
      label: "Acme Corp",
    });
  });

  it("reads a recipient_name alias as label", () => {
    const params = new URLSearchParams({
      address: ADDRESS,
      amount: "2",
      recipient_name: "Bob",
    });
    expect(parsePaymentSendDraft(params.toString())).toEqual({
      address: ADDRESS,
      amount: 2,
      label: "Bob",
    });
  });

  it("accepts a period-decimal amount", () => {
    const params = new URLSearchParams({ address: ADDRESS, amount: "1.5" });
    expect(parsePaymentSendDraft(params.toString())?.amount).toBe(1.5);
  });

  it("rejects a comma-decimal amount (BIP21 mandates period decimals)", () => {
    // "1,5" would otherwise parseFloat to 1 — silently sending the wrong amount.
    const params = new URLSearchParams({ address: ADDRESS, amount: "1,5" });
    expect(parsePaymentSendDraft(params.toString())).toBeNull();
  });

  it("rejects an amount with trailing junk", () => {
    const params = new URLSearchParams({ address: ADDRESS, amount: "1.5abc" });
    expect(parsePaymentSendDraft(params.toString())).toBeNull();
  });
});

describe("buildPaymentSendUrl → parsePaymentSendDraft round-trip", () => {
  it("preserves address, amount, paymentId, message, and label", () => {
    const url = buildPaymentSendUrl({
      address: ADDRESS,
      amount: "12.5",
      paymentId: "pid",
      message: "hello there",
      label: "Acme Corp",
      v1: false,
      origin: "https://wallet.example",
    });
    const search = url.slice(url.indexOf("?"));
    expect(parsePaymentSendDraft(search)).toEqual({
      address: ADDRESS,
      amount: 12.5,
      paymentId: "pid",
      message: "hello there",
      label: "Acme Corp",
    });
  });
});

describe("parsePaymentSendDraft — uri= (PWA protocol handler)", () => {
  it("decodes a web+conceal: CoinUri into a draft", () => {
    const uri = `web+conceal:${ADDRESS}?amount=1.5?payment_id=pid?recipient_name=Bob`;
    const params = new URLSearchParams({ uri });
    expect(parsePaymentSendDraft(params.toString())).toEqual({
      address: ADDRESS,
      amount: 1.5,
      paymentId: "pid",
      message: undefined,
      label: "Bob",
    });
  });

  it("decodes a bare-address CoinUri too", () => {
    const params = new URLSearchParams({ uri: `${ADDRESS}?amount=2` });
    expect(parsePaymentSendDraft(params.toString())?.amount).toBe(2);
  });

  it("returns null (never throws) on a malformed uri", () => {
    const params = new URLSearchParams({ uri: "web+conceal:not-an-address" });
    expect(() => parsePaymentSendDraft(params.toString())).not.toThrow();
    expect(parsePaymentSendDraft(params.toString())).toBeNull();
  });
});
