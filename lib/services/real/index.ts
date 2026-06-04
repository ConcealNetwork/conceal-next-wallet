import { realAddressBookService } from "@/lib/services/real/address-book.service";
import { realDepositService } from "@/lib/services/real/deposit.service";
import { realMessageService } from "@/lib/services/real/message.service";
import { realSettingsService } from "@/lib/services/real/settings.service";
import { realMarketService } from "@/lib/services/real/market.service";
import { realNetworkService } from "@/lib/services/real/network.service";
import { realTransactionService } from "@/lib/services/real/transaction.service";
import { realWalletService } from "@/lib/services/real/wallet.service";
import type { WalletServices } from "@/lib/services/types";

export const realServices: WalletServices = {
  wallet: realWalletService,
  transactions: realTransactionService,
  market: realMarketService,
  messages: realMessageService,
  deposits: realDepositService,
  addressBook: realAddressBookService,
  network: realNetworkService,
  settings: realSettingsService,
};
