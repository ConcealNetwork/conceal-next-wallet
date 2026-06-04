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

type GlobalWithRuntimeWallet = typeof globalThis & { __ccxRuntimeWallet?: Wallet };

function isWalletInstance(value: unknown): value is Wallet {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as Wallet).availableAmount === "function" &&
    typeof (value as Wallet).getPublicAddress === "function"
  );
}

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

  (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWallet = wallet;
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
  delete (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWallet;
  DependencyInjectorInstance().register(Wallet.name, undefined, "default");
  DependencyInjectorInstance().register(WalletWorker.name, undefined, "default");
  DependencyInjectorInstance().register(WalletWatchdog.name, undefined, "default");
  clearCreatedMnemonic();
}

export function getRuntimeWallet(): Wallet | null {
  const globalWallet = (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWallet;
  if (isWalletInstance(globalWallet)) {
    return globalWallet;
  }

  const fromDi = DependencyInjectorInstance().getInstance(Wallet.name, "default", false);
  if (isWalletInstance(fromDi)) {
    return fromDi;
  }

  const worker = DependencyInjectorInstance().getInstance(WalletWorker.name, "default", false) as
    | WalletWorker
    | null;
  if (isWalletInstance(worker?.wallet)) {
    return worker.wallet;
  }

  return null;
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
