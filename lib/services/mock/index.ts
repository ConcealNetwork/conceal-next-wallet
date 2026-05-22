import { mockAddressBookService } from "@/lib/services/mock/address-book.service"
import { mockDepositService } from "@/lib/services/mock/deposit.service"
import { mockMarketService } from "@/lib/services/mock/market.service"
import { mockMessageService } from "@/lib/services/mock/message.service"
import { mockNetworkService } from "@/lib/services/mock/network.service"
import { mockSettingsService } from "@/lib/services/mock/settings.service"
import { mockTransactionService } from "@/lib/services/mock/transaction.service"
import { mockWalletService } from "@/lib/services/mock/wallet.service"
import type { WalletServices } from "@/lib/services/types"

export const mockServices: WalletServices = {
  wallet: mockWalletService,
  transactions: mockTransactionService,
  market: mockMarketService,
  messages: mockMessageService,
  deposits: mockDepositService,
  addressBook: mockAddressBookService,
  network: mockNetworkService,
  settings: mockSettingsService,
}
