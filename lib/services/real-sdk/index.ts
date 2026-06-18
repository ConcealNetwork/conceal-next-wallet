import { realSdkAddressBookService } from "@/lib/services/real-sdk/address-book.service";
import { realSdkDepositService } from "@/lib/services/real-sdk/deposit.service";
import { realSdkMarketService } from "@/lib/services/real-sdk/market.service";
import { realSdkMessageService } from "@/lib/services/real-sdk/message.service";
import { realSdkNetworkService } from "@/lib/services/real-sdk/network.service";
import { realSdkSettingsService } from "@/lib/services/real-sdk/settings.service";
import { realSdkTransactionService } from "@/lib/services/real-sdk/transaction.service";
import { realSdkWalletService } from "@/lib/services/real-sdk/wallet.service";
import type { WalletServices } from "@/lib/services/types";

/**
 * The real wallet engine backed by `conceal-wallet-sdk` (no `lib/wallet-core`).
 * Selected when `NEXT_PUBLIC_USE_MOCK=false` AND `NEXT_PUBLIC_WALLET_ENGINE=sdk`.
 */
export const realServices: WalletServices = {
  wallet: realSdkWalletService,
  transactions: realSdkTransactionService,
  market: realSdkMarketService,
  messages: realSdkMessageService,
  deposits: realSdkDepositService,
  addressBook: realSdkAddressBookService,
  network: realSdkNetworkService,
  settings: realSdkSettingsService,
};
