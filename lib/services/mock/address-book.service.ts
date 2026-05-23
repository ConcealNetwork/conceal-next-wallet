import { mockAddressBook } from "@/lib/mock-data/wallet"
import { clone, mockDelay } from "@/lib/services/mock/helpers"
import type { AddressBookService } from "@/lib/services/address-book.service"

export const mockAddressBookService: AddressBookService = {
  async listEntries() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return clone(mockAddressBook)
  },
  async createEntry(input) {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return { id: `addr-${Date.now()}`, ...input }
  },
  async updateEntry(id, input) {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return { id, ...input }
  },
  async deleteEntry() {
    // TODO(backend): replace with real Conceal RPC/walletd call
    await mockDelay()
    return { ok: true }
  },
}
