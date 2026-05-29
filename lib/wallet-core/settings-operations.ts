// @ts-nocheck
import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init"
import type { WalletSettings } from "@/lib/types"
import { BlockchainExplorerProvider } from "./providers/BlockchainExplorerProvider"
import { Storage } from "./Storage"
import {
  getRuntimeWallet,
  getRuntimeWatchdog,
} from "./wallet-runtime"

let uiOnlySettings: Pick<WalletSettings, "language" | "autoLock" | "biometric"> = {
  language: "English",
  autoLock: true,
  biometric: false,
}

function requireOpenWallet() {
  const wallet = getRuntimeWallet()
  if (wallet === null) throw new Error("Wallet is not open.")
  return wallet
}

function requireWatchdog() {
  const watchdog = getRuntimeWatchdog()
  if (watchdog === null) throw new Error("Wallet sync is not running.")
  return watchdog
}

async function mapRuntimeSettings(): Promise<WalletSettings> {
  await ensureAllWalletLegacyLibs()
  const wallet = requireOpenWallet()
  const customNodeUrl = (await Storage.getItem("customNodeUrl", null)) as string | null
  const useCustomNode = Boolean(customNodeUrl ?? wallet.options.customNode)
  const defaultNodeUrl = config.nodeList?.[0] ?? "https://explorer.conceal.network/daemon/"

  return {
    ...uiOnlySettings,
    useCustomNode,
    nodeUrl: useCustomNode ? (customNodeUrl ?? wallet.options.nodeUrl) : defaultNodeUrl,
    readMinorTx: wallet.options.checkMinerTx,
    creationHeight: wallet.creationHeight,
    scanHeight: Math.max(0, Number(wallet.lastHeight)),
  }
}

function applyWalletOptionUpdates(wallet: ReturnType<typeof requireOpenWallet>, input: Partial<WalletSettings>) {
  const options = wallet.options

  if (typeof input.readMinorTx !== "undefined") {
    options.checkMinerTx = input.readMinorTx
  }
  if (typeof input.useCustomNode !== "undefined") {
    options.customNode = input.useCustomNode
  }
  if (typeof input.nodeUrl !== "undefined") {
    options.nodeUrl = input.nodeUrl
  }

  wallet.options = options
}

async function applyConnectionSettings(input: Partial<WalletSettings>) {
  const wallet = requireOpenWallet()
  const watchdog = requireWatchdog()
  const explorer = BlockchainExplorerProvider.getInstance()

  const oldCustomNode = wallet.options.customNode
  const oldNodeUrl = wallet.options.nodeUrl

  if (typeof input.useCustomNode !== "undefined" || typeof input.nodeUrl !== "undefined") {
    applyWalletOptionUpdates(wallet, input)

    if (wallet.options.customNode) {
      await Storage.setItem("customNodeUrl", wallet.options.nodeUrl)
    } else {
      await Storage.remove("customNodeUrl")
    }

    watchdog.setupWorkers()
    watchdog.signalWalletUpdate()

    if (oldCustomNode !== wallet.options.customNode) {
      await explorer.resetNodes()
    } else if (wallet.options.customNode && oldNodeUrl !== wallet.options.nodeUrl) {
      await explorer.resetNodes()
    }
  }
}

export async function getSettingsOperation(): Promise<WalletSettings> {
  return mapRuntimeSettings()
}

export async function updateSettingsOperation(input: Partial<WalletSettings>): Promise<WalletSettings> {
  await ensureAllWalletLegacyLibs()
  const wallet = requireOpenWallet()
  const watchdog = requireWatchdog()
  const explorer = BlockchainExplorerProvider.getInstance()

  if (typeof input.language !== "undefined") uiOnlySettings.language = input.language
  if (typeof input.autoLock !== "undefined") uiOnlySettings.autoLock = input.autoLock
  if (typeof input.biometric !== "undefined") uiOnlySettings.biometric = input.biometric

  if (
    typeof input.useCustomNode !== "undefined" ||
    typeof input.nodeUrl !== "undefined"
  ) {
    await applyConnectionSettings(input)
  }

  if (typeof input.readMinorTx !== "undefined") {
    applyWalletOptionUpdates(wallet, input)
    watchdog.setupWorkers()
    watchdog.signalWalletUpdate()
    wallet.signalChanged()
    wallet.notify()
  }

  if (typeof input.creationHeight !== "undefined" || typeof input.scanHeight !== "undefined") {
    const maxHeight = await explorer.getHeight()

    if (typeof input.creationHeight !== "undefined") {
      let creationHeight = input.creationHeight
      if (creationHeight < 0) creationHeight = 0
      if (creationHeight > maxHeight) creationHeight = maxHeight
      wallet.creationHeight = creationHeight
    }

    if (typeof input.scanHeight !== "undefined") {
      let scanHeight = input.scanHeight
      if (scanHeight < 0) scanHeight = 0
      if (scanHeight > maxHeight) scanHeight = maxHeight
      wallet.lastHeight = scanHeight
    }

    watchdog.signalWalletUpdate()
    wallet.signalChanged()
    wallet.notify()
  }

  return mapRuntimeSettings()
}

export async function resetAndRescanOperation(): Promise<{ ok: true }> {
  await ensureAllWalletLegacyLibs()
  const wallet = requireOpenWallet()
  const watchdog = requireWatchdog()

  watchdog.stop()
  wallet.clearTransactions()
  wallet.resetScanHeight()
  watchdog.start()

  wallet.signalChanged()
  wallet.notify()

  return { ok: true }
}

export async function optimizeWalletOperation(): Promise<{ ok: true }> {
  await ensureAllWalletLegacyLibs()
  const wallet = requireOpenWallet()
  const explorer = BlockchainExplorerProvider.getInstance()
  const blockchainHeight = await explorer.getHeight()
  const optimizeInfo = wallet.optimizationNeeded(blockchainHeight, config.optimizeThreshold)

  if (!optimizeInfo.isNeeded) {
    return { ok: true }
  }

  await wallet.createFusionTransaction(
    blockchainHeight,
    config.optimizeThreshold,
    explorer,
    (amounts: number[], numberOuts: number) => explorer.getRandomOuts(amounts, numberOuts),
  )

  const watchdog = getRuntimeWatchdog()
  if (watchdog !== null) {
    watchdog.checkMempool()
  }

  return { ok: true }
}
