// @ts-nocheck
import { BlockchainExplorerProvider } from "./providers/BlockchainExplorerProvider";
import { DependencyInjectorInstance } from "./numbersLab/DependencyInjector";
import { Observable } from "./numbersLab/Observable";
import { Wallet } from "./Wallet";
import { WalletRepository } from "./WalletRepository";
import { WalletWatchdog } from "./WalletWatchdog";
import { prepareWalletForOpen } from "./wallet-open-prep";
import { registerWalletSyncNotifier, unregisterWalletSyncNotifier } from "./wallet-sync-notifier";

export class WalletWorker {
  wallet: Wallet;
  password: string;
  private intervalSave = 0;

  constructor(wallet: Wallet, password: string) {
    this.wallet = wallet;
    this.password = password;
    wallet.addObserver(Observable.EVENT_MODIFIED, () => {
      if (this.intervalSave === 0) {
        this.intervalSave = window.setTimeout(() => {
          this.save();
          this.intervalSave = 0;
        }, 1000);
      }
    });
    this.save();
  }

  save() {
    return WalletRepository.save(this.wallet, this.password);
  }
}

let cachedMnemonic = "";

export function setCreatedMnemonic(mnemonic: string) {
  cachedMnemonic = mnemonic;
}

export function getCreatedMnemonic() {
  return cachedMnemonic;
}

export function clearCreatedMnemonic() {
  cachedMnemonic = "";
}

export async function openWalletRuntime(wallet: Wallet, password: string) {
  await prepareWalletForOpen(wallet);

  const walletWorker = new WalletWorker(wallet, password);
  DependencyInjectorInstance().register(Wallet.name, wallet);
  const explorer = BlockchainExplorerProvider.getInstance();
  const watchdog = explorer.start(wallet);
  DependencyInjectorInstance().register(WalletWatchdog.name, watchdog);
  DependencyInjectorInstance().register(WalletWorker.name, walletWorker);
  registerWalletSyncNotifier(wallet);
}

export function disconnectWalletRuntime() {
  const watchdog: WalletWatchdog | null = DependencyInjectorInstance().getInstance(
    WalletWatchdog.name,
    "default",
    false,
  );
  if (watchdog !== null) {
    watchdog.stop();
  }

  BlockchainExplorerProvider.getInstance().cleanupSession();

  unregisterWalletSyncNotifier();
  DependencyInjectorInstance().register(Wallet.name, undefined, "default");
  DependencyInjectorInstance().register(WalletWorker.name, undefined, "default");
  DependencyInjectorInstance().register(WalletWatchdog.name, undefined, "default");
  clearCreatedMnemonic();
}

export function getRuntimeWallet(): Wallet | null {
  return DependencyInjectorInstance().getInstance(Wallet.name, "default", false);
}

export function getRuntimeWalletWorker(): WalletWorker | null {
  return DependencyInjectorInstance().getInstance(WalletWorker.name, "default", false);
}

export function getRuntimeWatchdog(): WalletWatchdog | null {
  return DependencyInjectorInstance().getInstance(WalletWatchdog.name, "default", false);
}

export async function hasStoredWallet(): Promise<boolean> {
  const { hasStoredWalletOnDevice } = await import("./stored-wallet-check");
  return hasStoredWalletOnDevice();
}
