import { messages } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";

const { encodeSmartMessage, isKnownSmartMessage, isSmartMessage, parseSmartMessage } = messages;

import { formatCheckIn, isCheckInMessage, parseCheckIn } from "@/lib/ui/check-in-message";

describe("smart-message convention (conceal-2fa compatible)", () => {
  it("detects a brace-wrapped token only", () => {
    expect(isSmartMessage("{checkin,alive}")).toBe(true);
    expect(isSmartMessage("  {a,b}  ")).toBe(true); // trimmed
    expect(isSmartMessage("hello")).toBe(false);
    expect(isSmartMessage("{ partial")).toBe(false);
    expect(isSmartMessage("text {a,b}")).toBe(false);
    expect(isSmartMessage("")).toBe(false);
    expect(isSmartMessage(null)).toBe(false);
  });

  it("encodes module,action,…data and serializes known actions", () => {
    expect(encodeSmartMessage("checkin", "alive")).toBe("{checkin,alive}");
    expect(encodeSmartMessage("2FA", "create", "x")).toBe("{2FA,c,x}"); // create → c (conceal-2fa map)
  });

  it("rejects parts containing the structural delimiters", () => {
    expect(() => encodeSmartMessage("mod,ule", "action")).toThrow();
    expect(() => encodeSmartMessage("mod}", "action")).toThrow();
    expect(() => encodeSmartMessage("checkin", "ali,ve")).toThrow();
  });

  it("parses into trimmed parts, or null", () => {
    expect(parseSmartMessage("{checkin,alive}")).toEqual(["checkin", "alive"]);
    expect(parseSmartMessage("{ a , b , c }")).toEqual(["a", "b", "c"]);
    expect(parseSmartMessage("not a command")).toBeNull();
  });

  it("isKnownSmartMessage gates on the module allow-list (not just braces)", () => {
    expect(isKnownSmartMessage("{status,alive}")).toBe(true);
    expect(isKnownSmartMessage("{2FA,c}")).toBe(true); // ecosystem module
    expect(isKnownSmartMessage("{vault,u,x}")).toBe(true);
    // Ordinary brace-wrapped chat / JSON is NOT a smart message → stays ChaCha8 text.
    expect(isKnownSmartMessage("{hi}")).toBe(false);
    expect(isKnownSmartMessage('{"foo":1}')).toBe(false);
    expect(isKnownSmartMessage("{unknownModule,x}")).toBe(false);
    expect(isKnownSmartMessage("plain text")).toBe(false);
  });
});

describe("check-in message", () => {
  it("round-trips format → parse as a {status,…} smart message", () => {
    expect(formatCheckIn("alive")).toBe("{status,alive}");
    expect(parseCheckIn(formatCheckIn())).toEqual({ status: "alive" });
  });

  it("accepts `ok` as an alias for alive", () => {
    expect(parseCheckIn("{status,ok}")).toEqual({ status: "alive" });
  });

  it("matches only the whole, trimmed body (no substring/injection)", () => {
    expect(parseCheckIn("  {status,alive}  ")).toEqual({ status: "alive" });
    expect(parseCheckIn("hi {status,alive}")).toBeNull();
    expect(parseCheckIn("{status,alive} and more")).toBeNull();
  });

  it("rejects other modules and unknown statuses", () => {
    expect(parseCheckIn("{2FA,c}")).toBeNull();
    expect(parseCheckIn("{vault,u}")).toBeNull();
    expect(parseCheckIn("{status,dead}")).toBeNull();
    expect(parseCheckIn("{status,help}")).toBeNull(); // reserved, not wired in v1.1
    expect(parseCheckIn("{status}")).toBeNull(); // no status value
  });

  it("never throws or leaks prototype members on adversarial input", () => {
    expect(parseCheckIn("")).toBeNull();
    expect(parseCheckIn(undefined)).toBeNull();
    expect(parseCheckIn(null)).toBeNull();
    expect(parseCheckIn(12345)).toBeNull();
    expect(parseCheckIn(`{status,${"x".repeat(10_000)}}`)).toBeNull();
    expect(parseCheckIn("{status,constructor}")).toBeNull();
    expect(parseCheckIn("{status,__proto__}")).toBeNull();
    expect(parseCheckIn("{status,toString}")).toBeNull();
  });

  it("isCheckInMessage mirrors parse", () => {
    expect(isCheckInMessage("{status,alive}")).toBe(true);
    expect(isCheckInMessage("just a normal message")).toBe(false);
  });
});
