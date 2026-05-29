import { mockAddressBookService } from "@/lib/services/mock/address-book.service"
import { mockDepositService } from "@/lib/services/mock/deposit.service"
import { mockMessageService } from "@/lib/services/mock/message.service"
import { mockSettingsService } from "@/lib/services/mock/settings.service"
import { realMarketService } from "@/lib/services/real/market.service"
import { realNetworkService } from "@/lib/services/real/network.service"
import { realTransactionService } from "@/lib/services/real/transaction.service"
import { realWalletService } from "@/lib/services/real/wallet.service"
import type { WalletServices } from "@/lib/services/types"

export const realServices: WalletServices = {
  wallet: realWalletService,
  transactions: realTransactionService,
  market: realMarketService,
  messages: mockMessageService,
  deposits: mockDepositService,
  addressBook: mockAddressBookService,
  network: realNetworkService,
  settings: mockSettingsService,
}
