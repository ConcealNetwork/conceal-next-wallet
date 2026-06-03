import type { AddressBookService } from "@/lib/services/address-book.service";
import type { DepositService } from "@/lib/services/deposit.service";
import type { MarketService } from "@/lib/services/market.service";
import type { MessageService } from "@/lib/services/message.service";
import type { NetworkService } from "@/lib/services/network.service";
import type { SettingsService } from "@/lib/services/settings.service";
import type { TransactionService } from "@/lib/services/transaction.service";
import type { WalletService } from "@/lib/services/wallet.service";

export type WalletServices = {
  wallet: WalletService;
  transactions: TransactionService;
  market: MarketService;
  messages: MessageService;
  deposits: DepositService;
  addressBook: AddressBookService;
  network: NetworkService;
  settings: SettingsService;
};
