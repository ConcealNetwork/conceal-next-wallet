import type { AddressBookService } from "@/lib/services/address-book.service";

async function addressBookOps() {
  const { ensureAllWalletLegacyLibs } = await import("@/lib/conceal/init");
  await ensureAllWalletLegacyLibs();
  return import("@/lib/wallet-core/address-book-operations");
}

export const realAddressBookService: AddressBookService = {
  async listEntries() {
    return (await addressBookOps()).listAddressBookOperation();
  },
  async createEntry(input) {
    return (await addressBookOps()).createAddressEntryOperation(input);
  },
  async updateEntry(id, input) {
    return (await addressBookOps()).updateAddressEntryOperation(id, input);
  },
  async deleteEntry(id) {
    return (await addressBookOps()).deleteAddressEntryOperation(id);
  },
};
