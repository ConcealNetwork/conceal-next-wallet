// @ts-nocheck
import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import type { WalletSettings } from "@/lib/types";
import { readSpeedFromSyncSpeed, syncSpeedFromReadSpeed } from "@/lib/ui/sync-speed";
import { testNodeUrlReachability, validateNodeUrlFormat } from "@/lib/validation/node-url";
import { BlockchainExplorerProvider } from "./providers/BlockchainExplorerProvider";
import { Storage } from "./Storage";
import { flushRuntimeWalletPersistence, getRuntimeWallet, getRuntimeWatchdog } from "./wallet-runtime";

function requireOpenWallet() {
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  return wallet;
}

function requireWatchdog() {
  const watchdog = getRuntimeWatchdog();
  if (watchdog === null) throw new Error("Wallet sync is not running.");
  return watchdog;
}

function defaultNodeUrl(): string {
  return config.nodeList?.[0] ?? "https://explorer.conceal.network/daemon/";
}

function resolveActiveNodeUrl(explorer: ReturnType<typeof BlockchainExplorerProvider.getInstance>): string {
  return explorer.getActiveNodeUrl?.() ?? defaultNodeUrl();
}

async function mapRuntimeSettings(): Promise<WalletSettings> {
  await ensureAllWalletLegacyLibs();
  const wallet = requireOpenWallet();
  const explorer = BlockchainExplorerProvider.getInstance();
  const customNodeUrl = (await Storage.getItem("customNodeUrl", null)) as string | null;
  const useCustomNode = Boolean(customNodeUrl ?? wallet.options.customNode);
  const activeNodeUrl = resolveActiveNodeUrl(explorer);
  const autoLockMinutes = Number(await Storage.getItem("autoLockMinutes", 0)) || 0;

  return {
    useCustomNode,
    nodeUrl: useCustomNode ? (customNodeUrl ?? wallet.options.nodeUrl) : activeNodeUrl,
    readMinorTx: wallet.options.checkMinerTx,
    syncSpeed: syncSpeedFromReadSpeed(wallet.options.readSpeed),
    autoLockMinutes,
    creationHeight: wallet.creationHeight,
    scanHeight: Math.max(0, Number(wallet.lastHeight)),
  };
}

function applyWalletOptionUpdates(
  wallet: ReturnType<typeof requireOpenWallet>,
  input: Partial<WalletSettings>,
) {
  const options = wallet.options;

  if (typeof input.readMinorTx !== "undefined") {
    options.checkMinerTx = input.readMinorTx;
  }
  if (typeof input.syncSpeed !== "undefined") {
    options.readSpeed = readSpeedFromSyncSpeed(input.syncSpeed);
  }
  if (typeof input.useCustomNode !== "undefined") {
    options.customNode = input.useCustomNode;
  }
  if (typeof input.nodeUrl !== "undefined") {
    options.nodeUrl = input.nodeUrl;
  }

  wallet.options = options;
}

async function applyConnectionSettings(input: Partial<WalletSettings>) {
  const wallet = requireOpenWallet();
  const watchdog = requireWatchdog();
  const explorer = BlockchainExplorerProvider.getInstance();

  const oldCustomNode = wallet.options.customNode;
  const oldNodeUrl = wallet.options.nodeUrl;

  const nextCustomNode =
    typeof input.useCustomNode !== "undefined" ? input.useCustomNode : oldCustomNode;

  let nextNodeUrl = oldNodeUrl;
  if (typeof input.nodeUrl !== "undefined") {
    nextNodeUrl = input.nodeUrl;
  } else if (nextCustomNode && !oldCustomNode) {
    nextNodeUrl = resolveActiveNodeUrl(explorer);
  }

  if (nextCustomNode) {
    const format = validateNodeUrlFormat(nextNodeUrl);
    if (!format.ok) {
      throw new Error(format.errors.join(" "));
    }

    nextNodeUrl = format.normalized;
    await testNodeUrlReachability(nextNodeUrl);
  }

  applyWalletOptionUpdates(wallet, {
    useCustomNode: nextCustomNode,
    nodeUrl: nextNodeUrl,
  });

  if (nextCustomNode) {
    await Storage.setItem("customNodeUrl", nextNodeUrl);
  } else {
    await Storage.remove("customNodeUrl");
  }

  watchdog.setupWorkers();
  watchdog.signalWalletUpdate();

  if (oldCustomNode !== nextCustomNode || (nextCustomNode && oldNodeUrl !== nextNodeUrl)) {
    await explorer.resetNodes();
  }

  wallet.signalChanged();
  wallet.notify();
}

export async function getSettingsOperation(): Promise<WalletSettings> {
  return mapRuntimeSettings();
}

export async function updateSettingsOperation(
  input: Partial<WalletSettings>,
): Promise<WalletSettings> {
  await ensureAllWalletLegacyLibs();
  const wallet = requireOpenWallet();
  const watchdog = requireWatchdog();
  const explorer = BlockchainExplorerProvider.getInstance();

  if (typeof input.autoLockMinutes !== "undefined") {
    await Storage.setItem("autoLockMinutes", input.autoLockMinutes);
  }

  if (typeof input.useCustomNode !== "undefined" || typeof input.nodeUrl !== "undefined") {
    await applyConnectionSettings(input);
  }

  if (typeof input.readMinorTx !== "undefined" || typeof input.syncSpeed !== "undefined") {
    applyWalletOptionUpdates(wallet, input);
    watchdog.setupWorkers();
    watchdog.signalWalletUpdate();
    wallet.signalChanged();
    wallet.notify();
  }

  if (typeof input.creationHeight !== "undefined" || typeof input.scanHeight !== "undefined") {
    const maxHeight = await explorer.getHeight();

    if (typeof input.creationHeight !== "undefined") {
      let creationHeight = input.creationHeight;
      if (creationHeight < 0) creationHeight = 0;
      if (creationHeight > maxHeight) creationHeight = maxHeight;
      wallet.creationHeight = creationHeight;
      wallet.lastHeight = creationHeight;
    }

    if (typeof input.scanHeight !== "undefined") {
      let scanHeight = input.scanHeight;
      if (scanHeight < 0) scanHeight = 0;
      if (scanHeight > maxHeight) scanHeight = maxHeight;
      wallet.lastHeight = scanHeight;
    }

    watchdog.signalWalletUpdate();
    wallet.signalChanged();
    wallet.notify();
  }

  return mapRuntimeSettings();
}

export async function resetAndRescanOperation(): Promise<{ ok: true }> {
  await ensureAllWalletLegacyLibs();
  const wallet = requireOpenWallet();
  const watchdog = requireWatchdog();

  watchdog.stop();
  wallet.clearTransactions();
  wallet.resetScanHeight();
  watchdog.start();

  wallet.signalChanged();
  wallet.notify();
  await flushRuntimeWalletPersistence();

  return { ok: true };
}

export async function optimizeWalletOperation(): Promise<{ ok: true }> {
  await ensureAllWalletLegacyLibs();
  const wallet = requireOpenWallet();
  const explorer = BlockchainExplorerProvider.getInstance();
  const blockchainHeight = await explorer.getHeight();
  const optimizeInfo = wallet.optimizationNeeded(blockchainHeight, config.optimizeThreshold);

  if (!optimizeInfo.isNeeded) {
    return { ok: true };
  }

  await wallet.createFusionTransaction(
    blockchainHeight,
    config.optimizeThreshold,
    explorer,
    (amounts: number[], numberOuts: number) => explorer.getRandomOuts(amounts, numberOuts),
  );

  const watchdog = getRuntimeWatchdog();
  if (watchdog !== null) {
    watchdog.checkMempool();
  }

  return { ok: true };
}
