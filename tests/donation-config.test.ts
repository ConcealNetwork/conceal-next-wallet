import { afterEach, describe, expect, it } from "vitest";

import { getDonationConfig, getDonationMethodsDescription } from "@/lib/donation-config";

describe("getDonationConfig", () => {
  const originalFiat = process.env.DONATION_SUPPORT_FIAT;
  const originalMethods = process.env.DONATION_SUPPORT_METHOD;

  afterEach(() => {
    if (originalFiat === undefined) delete process.env.DONATION_SUPPORT_FIAT;
    else process.env.DONATION_SUPPORT_FIAT = originalFiat;
    if (originalMethods === undefined) delete process.env.DONATION_SUPPORT_METHOD;
    else process.env.DONATION_SUPPORT_METHOD = originalMethods;
  });

  it("defaults to fiat off and crypto only", () => {
    delete process.env.DONATION_SUPPORT_FIAT;
    delete process.env.DONATION_SUPPORT_METHOD;

    expect(getDonationConfig()).toEqual({
      fiatEnabled: false,
      enabledMethods: ["crypto"],
    });
  });

  it("enables fiat when DONATION_SUPPORT_FIAT is not OFF", () => {
    process.env.DONATION_SUPPORT_FIAT = "ON";
    process.env.DONATION_SUPPORT_METHOD = "Crypto";

    expect(getDonationConfig().fiatEnabled).toBe(true);
  });

  it("parses comma-separated payment methods case-insensitively", () => {
    process.env.DONATION_SUPPORT_METHOD = "Crypto,PayPal,Apple,Visa";

    expect(getDonationConfig().enabledMethods).toEqual(["crypto", "paypal", "apple", "visa"]);
  });
});

describe("getDonationMethodsDescription", () => {
  it("returns a sole-method description per payment key", () => {
    expect(getDonationMethodsDescription(["crypto"])).toBe("Donate using cryptocurrency");
    expect(getDonationMethodsDescription(["visa"])).toBe("Donate using credit card");
    expect(getDonationMethodsDescription(["paypal"])).toBe("Donate using PayPal");
    expect(getDonationMethodsDescription(["apple"])).toBe("Donate using Apple Pay");
  });

  it("returns the multi-method description when more than one is enabled", () => {
    expect(getDonationMethodsDescription(["crypto", "paypal"])).toBe(
      "Multiple ways to show your support",
    );
  });
});
