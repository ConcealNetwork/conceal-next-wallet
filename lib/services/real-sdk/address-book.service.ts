import { isValidAddress, type RawAddressEntry as SdkRawAddressEntry } from "conceal-wallet-sdk";
import {
  fillOutboundPid,
  patchOutboundPid,
  withRelationshipFields,
} from "@/lib/messages/relationship";
import type { AddressBookService, AddressEntryInput } from "@/lib/services/address-book.service";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { persist, requireRuntime, type SdkRuntime } from "@/lib/services/real-sdk/runtime";
import type { AddressEntry, RawAddressEntry } from "@/lib/types";
import { normalizePaymentId, paymentIdIsValid } from "@/lib/validation/ccx";

/** App address-book row — superset of the SDK shape (extra fields round-trip in the blob). */
type StoredAddressEntry = SdkRawAddressEntry &
  Pick<RawAddressEntry, "paymentIdTo" | "relationship">;

/** Read the persisted address book from the blob (typed, defensive). */
function readEntries(runtime: SdkRuntime): StoredAddressEntry[] {
  const raw = runtime.raw.addressBook;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is StoredAddressEntry => {
    return (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as StoredAddressEntry).id === "string"
    );
  });
}

/** Write the address book back into the blob (immutably). */
function writeEntries(runtime: SdkRuntime, entries: StoredAddressEntry[]): void {
  runtime.raw = { ...runtime.raw, addressBook: entries };
}

/** Map a stored raw entry to the UI {@link AddressEntry}. */
function toAddressEntry(raw: StoredAddressEntry): AddressEntry {
  return withRelationshipFields({
    id: raw.id,
    label: raw.label,
    address: raw.address,
    paymentId: raw.paymentId,
    paymentIdTo: raw.paymentIdTo,
    avatar: raw.avatar,
  });
}

/** Validate + normalize an entry input, throwing friendly errors. */
function validateEntryInput(input: AddressEntryInput) {
  const label = input.label.trim();
  const address = input.address.trim();
  const paymentId = input.paymentId?.trim() ?? "";
  if (!label) throw new Error("Label is required.");
  if (!isValidAddress(address)) {
    throw new Error("Address must be a valid CCX address.");
  }
  if (!paymentIdIsValid(paymentId)) {
    throw new Error("Payment ID must be 64 or 16 hexadecimal characters.");
  }
  return {
    label,
    address,
    paymentId: paymentId || undefined,
    avatar: input.avatar?.trim() || undefined,
  };
}

function findByAddress(entries: StoredAddressEntry[], recipientAddress: string) {
  const target = recipientAddress.trim();
  return entries.findIndex((entry) => entry.address === target);
}

export const sdkAddrBook: AddressBookService = {
  async listEntries(): Promise<AddressEntry[]> {
    await ensureSdkReady();
    const rt = requireRuntime();
    return readEntries(rt).map(toAddressEntry);
  },

  async createEntry(input): Promise<AddressEntry> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const validated = validateEntryInput(input);
    const entry: StoredAddressEntry = withRelationshipFields({
      id: `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...validated,
    });
    writeEntries(rt, [...readEntries(rt), entry]);
    await persist();
    return toAddressEntry(entry);
  },

  async updateEntry(id, input): Promise<AddressEntry> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const validated = validateEntryInput(input);
    const entries = readEntries(rt);
    const index = entries.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error("Address book entry not found.");
    const existing = entries[index];
    const updated: StoredAddressEntry = withRelationshipFields({
      id,
      ...validated,
      paymentIdTo: existing.paymentIdTo,
    });
    writeEntries(
      rt,
      entries.map((entry, i) => (i === index ? updated : entry)),
    );
    await persist();
    return toAddressEntry(updated);
  },

  async deleteEntry(id): Promise<{ ok: true }> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const entries = readEntries(rt);
    const next = entries.filter((entry) => entry.id !== id);
    if (next.length === entries.length) {
      throw new Error("Address book entry not found.");
    }
    writeEntries(rt, next);
    await persist();
    return { ok: true };
  },

  async saveOutboundPid(recipientAddress, paymentId): Promise<void> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const normalized = normalizePaymentId(paymentId);
    if (!normalized) return;

    const entries = readEntries(rt);
    const index = findByAddress(entries, recipientAddress);
    if (index < 0) return;

    const patched = patchOutboundPid(toAddressEntry(entries[index]), normalized);
    if (!patched) return;

    const next: StoredAddressEntry = {
      ...entries[index],
      paymentIdTo: patched.paymentIdTo,
      relationship: patched.relationship,
    };
    writeEntries(
      rt,
      entries.map((entry, i) => (i === index ? next : entry)),
    );
    await persist();
  },

  async fillOutboundPid(recipientAddress, paymentId): Promise<void> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const normalized = normalizePaymentId(paymentId);
    if (!normalized) return;

    const entries = readEntries(rt);
    const index = findByAddress(entries, recipientAddress);
    if (index < 0) return;

    const patched = fillOutboundPid(toAddressEntry(entries[index]), normalized);
    if (!patched) return;

    const next: StoredAddressEntry = {
      ...entries[index],
      paymentIdTo: patched.paymentIdTo,
      relationship: patched.relationship,
    };
    writeEntries(
      rt,
      entries.map((entry, i) => (i === index ? next : entry)),
    );
    await persist();
  },
};
