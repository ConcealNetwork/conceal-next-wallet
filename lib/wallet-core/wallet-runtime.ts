// @ts-nocheck

import { DependencyInjectorInstance } from "./numbersLab/DependencyInjector";
import { Observable } from "./numbersLab/Observable";
import { BlockchainExplorerProvider } from "./providers/BlockchainExplorerProvider";
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

  async flushSave(): Promise<void> {
    if (this.intervalSave !== 0) {
      clearTimeout(this.intervalSave);
      this.intervalSave = 0;
    }
    await this.save();
  }

  shutdown() {
    if (this.intervalSave !== 0) {
      clearTimeout(this.intervalSave);
      this.intervalSave = 0;
    }
  }
}

let cachedMnemonic = "";
let pendingCreationWallet: Wallet | null = null;
let pendingCreationMnemonic = "";

type GlobalWithRuntimeWallet = typeof globalThis & {
  __ccxRuntimeWallet?: Wallet;
  __ccxRuntimeWatchdog?: WalletWatchdog;
  __ccxRuntimeWalletWorker?: WalletWorker;
};

function isWalletInstance(value: unknown): value is Wallet {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as Wallet).availableAmount === "function" &&
    typeof (value as Wallet).getPublicAddress === "function"
  );
}

function isWalletWorkerInstance(value: unknown): value is WalletWorker {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as WalletWorker).save === "function" &&
    typeof (value as WalletWorker).flushSave === "function" &&
    isWalletInstance((value as WalletWorker).wallet)
  );
}

function isWatchdogInstance(value: unknown): value is WalletWatchdog {
  return (
    value != null &&
    typeof value === "object" &&
    typeof (value as WalletWatchdog).stop === "function" &&
    typeof (value as WalletWatchdog).setupWorkers === "function" &&
    typeof (value as WalletWatchdog).signalWalletUpdate === "function"
  );
}

function stopWatchdogIfRunning(watchdog: WalletWatchdog | null) {
  if (watchdog !== null && typeof watchdog.shutdown === "function") {
    watchdog.shutdown();
  } else if (watchdog !== null && typeof watchdog.stop === "function") {
    watchdog.stop();
  }
}

function shutdownExplorerRuntime() {
  const explorer = BlockchainExplorerProvider.getInstance();
  if (typeof explorer.shutdown === "function") {
    explorer.shutdown();
    return;
  }
  explorer.cleanupSession();
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

export function setPendingWalletCreation(wallet: Wallet, mnemonic: string) {
  pendingCreationWallet = wallet;
  pendingCreationMnemonic = mnemonic;
}

export function getPendingWalletCreation(): { wallet: Wallet; mnemonic: string } | null {
  if (pendingCreationWallet === null) {
    return null;
  }
  return { wallet: pendingCreationWallet, mnemonic: pendingCreationMnemonic };
}

export function clearPendingWalletCreation() {
  pendingCreationWallet = null;
  pendingCreationMnemonic = "";
}

export async function openWalletRuntime(wallet: Wallet, password: string) {
  await prepareWalletForOpen(wallet);

  (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWallet = wallet;
  const walletWorker = new WalletWorker(wallet, password);
  (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWalletWorker = walletWorker;
  DependencyInjectorInstance().register(Wallet.name, wallet);
  const explorer = BlockchainExplorerProvider.getInstance();
  const watchdog = explorer.start(wallet);
  (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWatchdog = watchdog;
  DependencyInjectorInstance().register(WalletWatchdog.name, watchdog);
  DependencyInjectorInstance().register(WalletWorker.name, walletWorker);
  registerWalletSyncNotifier(wallet);
}

export async function disconnectWalletRuntime(options: { flush?: boolean } = {}) {
  // The panic wipe passes flush:false — there is nothing to preserve, and flushing
  // would re-write the wallet to storage moments before we erase it.
  if (options.flush !== false) {
    await flushRuntimeWalletPersistence();
  }

  const watchdog = getRuntimeWatchdog();
  stopWatchdogIfRunning(watchdog);

  const worker = getRuntimeWalletWorker();
  if (worker !== null && typeof worker.shutdown === "function") {
    worker.shutdown();
  }

  shutdownExplorerRuntime();

  unregisterWalletSyncNotifier();
  delete (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWallet;
  delete (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWatchdog;
  delete (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWalletWorker;

  const di = DependencyInjectorInstance();
  di.unregister(Wallet.name);
  di.unregister(WalletWorker.name);
  di.unregister(WalletWatchdog.name);

  clearCreatedMnemonic();
  clearPendingWalletCreation();
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

  const worker = DependencyInjectorInstance().getInstance(
    WalletWorker.name,
    "default",
    false,
  ) as WalletWorker | null;
  if (isWalletInstance(worker?.wallet)) {
    return worker.wallet;
  }

  return null;
}

export function getRuntimeWalletWorker(): WalletWorker | null {
  const globalWorker = (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWalletWorker;
  if (isWalletWorkerInstance(globalWorker)) {
    return globalWorker;
  }

  const fromDi = DependencyInjectorInstance().getInstance(WalletWorker.name, "default", false);
  if (isWalletWorkerInstance(fromDi)) {
    return fromDi;
  }

  return null;
}

export async function flushRuntimeWalletPersistence(): Promise<void> {
  const worker = getRuntimeWalletWorker();
  if (worker !== null) {
    await worker.flushSave();
    return;
  }

  const wallet = getRuntimeWallet();
  if (wallet === null) return;

  const diWorker = DependencyInjectorInstance().getInstance(
    WalletWorker.name,
    "default",
    false,
  ) as WalletWorker | null;
  if (diWorker?.password) {
    await WalletRepository.save(wallet, diWorker.password);
  }
}

export function getRuntimeWatchdog(): WalletWatchdog | null {
  const globalWatchdog = (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWatchdog;
  if (isWatchdogInstance(globalWatchdog)) {
    return globalWatchdog;
  }

  const fromDi = DependencyInjectorInstance().getInstance(WalletWatchdog.name, "default", false);
  if (isWatchdogInstance(fromDi)) {
    return fromDi;
  }

  return null;
}

export async function hasStoredWallet(): Promise<boolean> {
  const { hasStoredWalletOnDevice } = await import("./stored-wallet-check");
  return hasStoredWalletOnDevice();
}
