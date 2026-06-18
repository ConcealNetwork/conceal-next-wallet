import { isValidAddress, type RawAddressEntry } from "conceal-wallet-sdk";
import { ensureSdkReady } from "@/lib/services/real-sdk/ready";
import { persist, requireRuntime, type SdkRuntime } from "@/lib/services/real-sdk/runtime";
import type { AddressBookService, AddressEntryInput } from "@/lib/services/address-book.service";
import type { AddressEntry } from "@/lib/types";
import { paymentIdIsValid } from "@/lib/validation/ccx";

/** Read the persisted address book from the blob (typed, defensive). */
function readEntries(runtime: SdkRuntime): RawAddressEntry[] {
  const raw = runtime.raw.addressBook;
  if (!Array.isArray(raw)) return [];
  return raw.filter((entry): entry is RawAddressEntry => {
    return (
      typeof entry === "object" &&
      entry !== null &&
      typeof (entry as RawAddressEntry).id === "string"
    );
  });
}

/** Write the address book back into the blob (immutably). */
function writeEntries(runtime: SdkRuntime, entries: RawAddressEntry[]): void {
  runtime.raw = { ...runtime.raw, addressBook: entries };
}

/** Map a stored raw entry to the UI {@link AddressEntry}. */
function toAddressEntry(raw: RawAddressEntry): AddressEntry {
  return {
    id: raw.id,
    label: raw.label,
    address: raw.address,
    paymentId: raw.paymentId,
    avatar: raw.avatar,
  };
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

export const realSdkAddressBookService: AddressBookService = {
  async listEntries(): Promise<AddressEntry[]> {
    await ensureSdkReady();
    const rt = requireRuntime();
    return readEntries(rt).map(toAddressEntry);
  },

  async createEntry(input): Promise<AddressEntry> {
    await ensureSdkReady();
    const rt = requireRuntime();
    const validated = validateEntryInput(input);
    const entry: RawAddressEntry = {
      id: `addr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      ...validated,
    };
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
    const updated: RawAddressEntry = { id, ...validated };
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
};
