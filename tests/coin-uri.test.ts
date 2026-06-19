import { describe, expect, it } from "vitest";
import { COIN_URI_PREFIX } from "@/lib/config/config";
import { CoinUri } from "@/lib/ui/coin-uri";

const ADDRESS = `ccx7${"a".repeat(94)}`;
const SPEND_KEY = "b".repeat(64);
const VIEW_KEY = "c".repeat(64);
const QUERY = "?payment_id=pid?amount=5?label=hello";

describe("CoinUri.decodeTx", () => {
  it("accepts bare ccx7", () => {
    expect(CoinUri.decodeTx(ADDRESS)).toEqual({ address: ADDRESS });
  });

  it("accepts conceal.ccx7 (coinTxPrefixLegacy)", () => {
    expect(CoinUri.decodeTx(`conceal.${ADDRESS}`)).toEqual({ address: ADDRESS });
  });

  it("accepts conceal:ccx7", () => {
    expect(CoinUri.decodeTx(`${COIN_URI_PREFIX}${ADDRESS}`)).toEqual({ address: ADDRESS });
  });

  it("parses query segments", () => {
    expect(CoinUri.decodeTx(`${ADDRESS}?payment_id=pid1?amount=12.5?label=note`)).toEqual({
      address: ADDRESS,
      paymentId: "pid1",
      amount: "12.5",
      description: "note",
    });
  });

  it("rejects invalid address length", () => {
    expect(() => CoinUri.decodeTx("ccx7short")).toThrow("invalid_address_length");
  });
});

describe("CoinUri.encodeTx", () => {
  // Upstream conceal-web-wallet dropped the 'conceal:' prefix from tx URIs
  // ("the char ':' was creating scanning issue"), so both v1 and v3 now emit a
  // bare address — otherwise our QRs may fail to scan in the legacy wallet.
  it("v3 (default) emits a bare address — no conceal: prefix", () => {
    const encoded = CoinUri.encodeTx(ADDRESS, "pid", "5", null, "hello", "v3");
    expect(encoded).toBe(`${ADDRESS}${QUERY}`);
    expect(encoded.startsWith(COIN_URI_PREFIX)).toBe(false);
    expect(encoded.startsWith(ADDRESS)).toBe(true);
  });

  it("v1 omits prefix", () => {
    expect(CoinUri.encodeTx(ADDRESS, "pid", "5", null, "hello", "v1")).toBe(`${ADDRESS}${QUERY}`);
  });

  it("default version (no arg) also emits a bare address", () => {
    expect(CoinUri.encodeTx(ADDRESS, "pid", "5", null, "hello")).toBe(`${ADDRESS}${QUERY}`);
  });

  it("round-trips a freshly-encoded bare URI through decodeTx", () => {
    const encoded = CoinUri.encodeTx(ADDRESS, "pid", "5", null, "hello", "v3");
    expect(CoinUri.decodeTx(encoded)).toEqual({
      address: ADDRESS,
      paymentId: "pid",
      amount: "5",
      description: "hello",
    });
  });

  it("still decodes our previously-produced conceal: v3 QR (back-compat)", () => {
    // A QR string our earlier build emitted with the now-removed prefix.
    const legacyConcealColon = `${COIN_URI_PREFIX}${ADDRESS}${QUERY}`;
    expect(CoinUri.decodeTx(legacyConcealColon)).toEqual({
      address: ADDRESS,
      paymentId: "pid",
      amount: "5",
      description: "hello",
    });
  });

  it("decodes all three tx forms (conceal:, conceal., bare) to the same address", () => {
    expect(CoinUri.decodeTx(`${COIN_URI_PREFIX}${ADDRESS}`)).toEqual({ address: ADDRESS });
    expect(CoinUri.decodeTx(`conceal.${ADDRESS}`)).toEqual({ address: ADDRESS });
    expect(CoinUri.decodeTx(ADDRESS)).toEqual({ address: ADDRESS });
  });
});

describe("CoinUri wallet URIs", () => {
  it("encodeWalletKeys uses coinWalletPrefix (conceal.)", () => {
    expect(CoinUri.encodeWalletKeys(ADDRESS, SPEND_KEY, VIEW_KEY, 1000)).toBe(
      `conceal.${ADDRESS}?spend_key=${SPEND_KEY}?view_key=${VIEW_KEY}?height=1000`,
    );
  });

  it("decodeWallet accepts conceal.", () => {
    const uri = `conceal.${ADDRESS}?spend_key=${SPEND_KEY}?view_key=${VIEW_KEY}`;
    expect(CoinUri.decodeWallet(uri)).toEqual({
      address: ADDRESS,
      spendKey: SPEND_KEY,
      viewKey: VIEW_KEY,
    });
  });

  it("decodeWallet accepts coinWalletPrefixLegacy (conceal:)", () => {
    const uri = `conceal:${ADDRESS}?spend_key=${SPEND_KEY}?view_key=${VIEW_KEY}`;
    expect(CoinUri.decodeWallet(uri)).toEqual({
      address: ADDRESS,
      spendKey: SPEND_KEY,
      viewKey: VIEW_KEY,
    });
  });
});
