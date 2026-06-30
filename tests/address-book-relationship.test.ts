import { describe, expect, it } from "vitest";
import {
  computeRelationship,
  fillOutboundPid,
  isP2PContact,
  missThreadPid,
  patchOutboundPid,
} from "@/lib/messages/relationship";
import type { AddressEntry } from "@/lib/types";

const CCX = "ccx7AliceWalletAddr2eZ9waDXgsLS7Uc11e2CpNSCWVdxEqSRFAm6P6NQhSb7XMG1D6VAZKmJeaJP37WYQ";
const PID_IN = "b".repeat(64);
const PID_OUT = "a".repeat(64);

function contact(over: Partial<AddressEntry> = {}): AddressEntry {
  return {
    id: "c1",
    label: "Alice",
    address: CCX,
    ...over,
  };
}

describe("contact relationship", () => {
  it("relationship requires address, paymentId, and paymentIdTo", () => {
    expect(computeRelationship(contact())).toBe(false);
    expect(computeRelationship(contact({ paymentId: PID_IN }))).toBe(false);
    expect(computeRelationship(contact({ paymentId: PID_IN, paymentIdTo: PID_OUT }))).toBe(true);
  });

  it("does not persist outbound PID on exchange-style contacts (no inbound paymentId)", () => {
    expect(isP2PContact(contact())).toBe(false);
    expect(patchOutboundPid(contact(), PID_OUT)).toBeNull();
  });

  it("persists paymentIdTo on P2P contacts after outbound send", () => {
    const patched = patchOutboundPid(contact({ paymentId: PID_IN }), PID_OUT);
    expect(patched?.paymentIdTo).toBe(PID_OUT);
    expect(patched?.relationship).toBe(true);
  });

  it("overwrites paymentIdTo with the latest outbound PID", () => {
    const next = "c".repeat(64);
    const patched = patchOutboundPid(
      contact({ paymentId: PID_IN, paymentIdTo: PID_OUT, relationship: true }),
      next,
    );
    expect(patched?.paymentIdTo).toBe(next);
    expect(patched?.relationship).toBe(true);
  });

  it("fillOutboundPid skips when paymentIdTo is already set", () => {
    expect(
      fillOutboundPid(contact({ paymentId: PID_IN, paymentIdTo: PID_OUT }), PID_IN),
    ).toBeNull();
  });

  it("fillOutboundPid sets paymentIdTo and relationship", () => {
    const patched = fillOutboundPid(contact({ paymentId: PID_IN }), PID_OUT);
    expect(patched?.paymentIdTo).toBe(PID_OUT);
    expect(patched?.relationship).toBe(true);
  });

  it("missThreadPid returns fill input only when contact lacks paymentIdTo", () => {
    const alice = contact({ paymentId: PID_IN });
    expect(missThreadPid(alice, PID_OUT, CCX)).toEqual({
      recipientAddress: CCX,
      paymentId: PID_OUT,
    });
    expect(
      missThreadPid(contact({ paymentId: PID_IN, paymentIdTo: PID_OUT }), PID_OUT, CCX),
    ).toBeNull();
  });
});
