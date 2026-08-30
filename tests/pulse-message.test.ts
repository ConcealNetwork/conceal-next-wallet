import { messages, smartPulse } from "conceal-wallet-sdk";
import { describe, expect, it } from "vitest";

const { encodeSmartMessage, isKnownSmartMessage, isSmartMessage, parseSmartMessage } = messages;
const { formatStatusPulse, isStatusPulse, parseStatusPulse } = smartPulse;

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

describe("status pulse message", () => {
  it("round-trips format → parse as a {status,…} smart message", () => {
    expect(formatStatusPulse("alive")).toBe("{status,alive}");
    expect(parseStatusPulse(formatStatusPulse("alive"))).toEqual({ kind: "alive", graceDays: 0 });
  });

  it("accepts `ok` as an alias for alive", () => {
    expect(parseStatusPulse("{status,ok}")).toEqual({ kind: "alive", graceDays: 0 });
  });

  it("matches only the whole, trimmed body (no substring/injection)", () => {
    expect(parseStatusPulse("  {status,alive}  ")).toEqual({ kind: "alive", graceDays: 0 });
    expect(parseStatusPulse("hi {status,alive}")).toBeNull();
    expect(parseStatusPulse("{status,alive} and more")).toBeNull();
  });

  it("rejects other modules and unknown statuses", () => {
    expect(parseStatusPulse("{2FA,c}")).toBeNull();
    expect(parseStatusPulse("{vault,u}")).toBeNull();
    expect(parseStatusPulse("{status,dead}")).toBeNull();
    expect(parseStatusPulse("{status,help}")).toBeNull(); // reserved, not wired in v1.1
    expect(parseStatusPulse("{status}")).toBeNull(); // no status value
  });

  it("never throws or leaks prototype members on adversarial input", () => {
    expect(parseStatusPulse("")).toBeNull();
    expect(parseStatusPulse(undefined)).toBeNull();
    expect(parseStatusPulse(null)).toBeNull();
    expect(parseStatusPulse(12345)).toBeNull();
    expect(parseStatusPulse(`{status,${"x".repeat(10_000)}}`)).toBeNull();
    expect(parseStatusPulse("{status,constructor}")).toBeNull();
    expect(parseStatusPulse("{status,__proto__}")).toBeNull();
    expect(parseStatusPulse("{status,toString}")).toBeNull();
  });

  it("isStatusPulse mirrors parse", () => {
    expect(isStatusPulse("{status,alive}")).toBe(true);
    expect(isStatusPulse("just a normal message")).toBe(false);
  });
});
