import { describe, expect, it } from "vitest";
import { encodeSmartMessage, isSmartMessage, parseSmartMessage } from "@/lib/messages/smart-message";
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

  it("parses into trimmed parts, or null", () => {
    expect(parseSmartMessage("{checkin,alive}")).toEqual(["checkin", "alive"]);
    expect(parseSmartMessage("{ a , b , c }")).toEqual(["a", "b", "c"]);
    expect(parseSmartMessage("not a command")).toBeNull();
  });
});

describe("check-in message", () => {
  it("round-trips format → parse as a {checkin,…} smart message", () => {
    expect(formatCheckIn("alive")).toBe("{checkin,alive}");
    expect(parseCheckIn(formatCheckIn())).toEqual({ status: "alive" });
  });

  it("accepts `ok` as an alias for alive", () => {
    expect(parseCheckIn("{checkin,ok}")).toEqual({ status: "alive" });
  });

  it("matches only the whole, trimmed body (no substring/injection)", () => {
    expect(parseCheckIn("  {checkin,alive}  ")).toEqual({ status: "alive" });
    expect(parseCheckIn("hi {checkin,alive}")).toBeNull();
    expect(parseCheckIn("{checkin,alive} and more")).toBeNull();
  });

  it("rejects other modules and unknown statuses", () => {
    expect(parseCheckIn("{2FA,c}")).toBeNull();
    expect(parseCheckIn("{vault,u}")).toBeNull();
    expect(parseCheckIn("{checkin,dead}")).toBeNull();
    expect(parseCheckIn("{checkin,help}")).toBeNull(); // reserved, not wired in v1.1
    expect(parseCheckIn("{checkin}")).toBeNull(); // no status
  });

  it("never throws or leaks prototype members on adversarial input", () => {
    expect(parseCheckIn("")).toBeNull();
    expect(parseCheckIn(undefined)).toBeNull();
    expect(parseCheckIn(null)).toBeNull();
    expect(parseCheckIn(12345)).toBeNull();
    expect(parseCheckIn(`{checkin,${"x".repeat(10_000)}}`)).toBeNull();
    expect(parseCheckIn("{checkin,constructor}")).toBeNull();
    expect(parseCheckIn("{checkin,__proto__}")).toBeNull();
    expect(parseCheckIn("{checkin,toString}")).toBeNull();
  });

  it("isCheckInMessage mirrors parse", () => {
    expect(isCheckInMessage("{checkin,alive}")).toBe(true);
    expect(isCheckInMessage("just a normal message")).toBe(false);
  });
});
