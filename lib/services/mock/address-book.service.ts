import {
  fillOutboundPid,
  patchOutboundPid,
  withRelationshipFields,
} from "@/lib/messages/relationship";
import { mockAddressBook } from "@/lib/mock-data/wallet";
import type { AddressBookService } from "@/lib/services/address-book.service";
import { clone, mockDelay } from "@/lib/services/mock/helpers";
import { normalizePaymentId } from "@/lib/validation/ccx";

export const mockAddrBook: AddressBookService = {
  async listEntries() {
    await mockDelay();
    return clone(mockAddressBook);
  },
  async createEntry(input) {
    await mockDelay();
    const entry = withRelationshipFields({ id: `addr-${Date.now()}`, ...input });
    mockAddressBook.push(entry);
    return clone(entry);
  },
  async updateEntry(id, input) {
    await mockDelay();
    const index = mockAddressBook.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error("Address book entry not found.");
    const existing = mockAddressBook[index];
    const updated = withRelationshipFields({
      id,
      ...input,
      paymentIdTo: existing.paymentIdTo,
    });
    mockAddressBook[index] = updated;
    return clone(updated);
  },
  async deleteEntry(id) {
    await mockDelay();
    const index = mockAddressBook.findIndex((entry) => entry.id === id);
    if (index < 0) throw new Error("Address book entry not found.");
    mockAddressBook.splice(index, 1);
    return { ok: true };
  },
  async saveOutboundPid(recipientAddress, paymentId) {
    await mockDelay();
    const normalized = normalizePaymentId(paymentId);
    if (!normalized) return;
    const index = mockAddressBook.findIndex((entry) => entry.address === recipientAddress.trim());
    if (index < 0) return;
    const patched = patchOutboundPid(mockAddressBook[index], normalized);
    if (!patched) return;
    mockAddressBook[index] = patched;
  },
  async fillOutboundPid(recipientAddress, paymentId) {
    await mockDelay();
    const normalized = normalizePaymentId(paymentId);
    if (!normalized) return;
    const index = mockAddressBook.findIndex((entry) => entry.address === recipientAddress.trim());
    if (index < 0) return;
    const patched = fillOutboundPid(mockAddressBook[index], normalized);
    if (!patched) return;
    mockAddressBook[index] = patched;
  },
};
