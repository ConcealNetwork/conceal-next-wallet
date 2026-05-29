// @ts-nocheck
import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init"
import type { ExportWalletData } from "@/lib/services/wallet.service"
import type { SendTransactionInput } from "@/lib/services/transaction.service"
import type { ImportWalletInput } from "@/lib/services/wallet.service"
import type { Transaction, WalletInfo, NodeStatus } from "@/lib/types"
import { Cn, CnUtils } from "./Cn"
import { KeysRepository } from "./KeysRepository"
import { Mnemonic } from "./Mnemonic"
import { TransactionsExplorer } from "./TransactionsExplorer"
import { Wallet } from "./Wallet"
import { WalletRepository } from "./WalletRepository"
import { BlockchainExplorerProvider } from "./providers/BlockchainExplorerProvider"
import { Storage } from "./Storage"
import { clampImportHeight, listWalletTransactions, mapWalletToInfo } from "./mappers"
import {
  disconnectWalletRuntime,
  getCreatedMnemonic,
  getRuntimeWallet,
  getRuntimeWalletWorker,
  getRuntimeWatchdog,
  openWalletRuntime,
  setCreatedMnemonic,
} from "./wallet-runtime"
import { CoinUri } from "./CoinUri"

async function prepareLegacyRuntime() {
  await ensureAllWalletLegacyLibs()
  const explorer = BlockchainExplorerProvider.getInstance()
  await explorer.initialize()
  return explorer
}

export async function unlockStoredWallet(password: string): Promise<WalletInfo> {
  await ensureAllWalletLegacyLibs()
  await WalletRepository.migrateWallet()
  const wallet = await WalletRepository.getLocalWalletWithPassword(password)
  if (wallet === null) {
    throw new Error("Invalid password or wallet data.")
  }
  await prepareLegacyRuntime()
  await openWalletRuntime(wallet, password)
  const height = await BlockchainExplorerProvider.getInstance().getHeight()
  return mapWalletToInfo(wallet, height)
}

export async function createWalletOperation(name: string, password: string): Promise<{ wallet: WalletInfo; mnemonic: string }> {
  await prepareLegacyRuntime()
  const explorer = BlockchainExplorerProvider.getInstance()
  const currentHeight = await explorer.getHeight()

  const seed = concealjs.random.random_scalar()
  const keys = Cn.create_address(seed)
  const wallet = new Wallet()
  wallet.keys = KeysRepository.fromPriv(keys.spend.sec, keys.view.sec)
  wallet.lastHeight = clampImportHeight(undefined, currentHeight)
  wallet.creationHeight = wallet.lastHeight

  const phrase = Mnemonic.mn_encode(wallet.keys.priv.spend, "english")
  if (phrase === null) {
    throw new Error("Failed to encode mnemonic.")
  }
  setCreatedMnemonic(phrase)
  await openWalletRuntime(wallet, password)
  return {
    wallet: mapWalletToInfo(wallet, currentHeight),
    mnemonic: phrase,
  }
}

export async function importWalletOperation(input: ImportWalletInput): Promise<WalletInfo> {
  await prepareLegacyRuntime()
  const explorer = BlockchainExplorerProvider.getInstance()
  const currentHeight = await explorer.getHeight()
  let wallet: Wallet | null = null
  const password = "password" in input ? input.password : ""

  switch (input.method) {
    case "open":
      return unlockStoredWallet(input.password)
    case "mnemonic": {
      const language =
        input.language === "auto" || !input.language
          ? Mnemonic.detectLang(input.mnemonic) ?? "english"
          : input.language
      const decoded = Mnemonic.mn_decode(input.mnemonic.trim(), language)
      if (decoded === null) throw new Error("Invalid mnemonic phrase.")
      const keys = Cn.create_address(decoded)
      wallet = new Wallet()
      wallet.keys = KeysRepository.fromPriv(keys.spend.sec, keys.view.sec)
      wallet.lastHeight = clampImportHeight(input.scanHeight, currentHeight)
      wallet.creationHeight = wallet.lastHeight
      break
    }
    case "keys": {
      wallet = new Wallet()
      if (input.viewOnly) {
        const decodedPublic = Cn.decode_address(input.address.trim())
        wallet.keys = {
          priv: { spend: "", view: input.privateViewKey.trim() },
          pub: { spend: decodedPublic.spend, view: decodedPublic.view },
        }
      } else {
        let viewKey = input.privateViewKey.trim()
        if (viewKey === "") {
          viewKey = Cn.generate_keys(CnUtils.cn_fast_hash(input.privateSpendKey.trim())).sec
        }
        wallet.keys = KeysRepository.fromPriv(input.privateSpendKey.trim(), viewKey)
      }
      wallet.lastHeight = clampImportHeight(input.scanHeight, currentHeight)
      wallet.creationHeight = wallet.lastHeight
      break
    }
    case "file": {
      const text =
        typeof input.file === "string"
          ? input.file
          : new TextDecoder().decode(input.file).replace(/^\uFEFF/, "").trim()
      let raw: unknown
      try {
        raw = JSON.parse(text)
      } catch {
        throw new Error("The selected file is not valid JSON.")
      }
      if (!raw || typeof raw !== "object") {
        throw new Error("The selected file is not a valid wallet backup.")
      }
      wallet = WalletRepository.decodeWithPassword(raw as Parameters<typeof WalletRepository.decodeWithPassword>[0], input.password)
      if (wallet === null) {
        throw new Error("Invalid wallet file or password.")
      }
      if (!wallet.keys?.pub?.spend) {
        throw new Error("Wallet file decrypted but key data is incomplete.")
      }
      await openWalletRuntime(wallet, input.password)
      return mapWalletToInfo(wallet, currentHeight)
    }
    case "qr": {
      const decoded = CoinUri.decodeWallet(input.payload)
      if (decoded.mnemonicSeed) {
        const seed = Mnemonic.mn_decode(decoded.mnemonicSeed, "english")
        if (seed === null) throw new Error("Invalid mnemonic in QR payload.")
        const keys = Cn.create_address(seed)
        wallet = new Wallet()
        wallet.keys = KeysRepository.fromPriv(keys.spend.sec, keys.view.sec)
      } else if (decoded.spendKey) {
        let viewKey = decoded.viewKey ?? ""
        if (viewKey === "") {
          viewKey = Cn.generate_keys(CnUtils.cn_fast_hash(decoded.spendKey)).sec
        }
        wallet = new Wallet()
        wallet.keys = KeysRepository.fromPriv(decoded.spendKey, viewKey)
      } else if (decoded.viewKey && decoded.address) {
        const decodedPublic = Cn.decode_address(decoded.address)
        wallet = new Wallet()
        wallet.keys = {
          priv: { spend: "", view: decoded.viewKey },
          pub: { spend: decodedPublic.spend, view: decodedPublic.view },
        }
      } else {
        throw new Error("Unsupported QR wallet payload.")
      }
      const scanHeight = decoded.height ? parseInt(decoded.height, 10) : undefined
      wallet.lastHeight = clampImportHeight(scanHeight, currentHeight)
      wallet.creationHeight = wallet.lastHeight
      break
    }
    default:
      throw new Error("Unsupported import method.")
  }

  await openWalletRuntime(wallet, password)
  return mapWalletToInfo(wallet, currentHeight)
}

export async function getWalletInfoOperation(): Promise<WalletInfo> {
  await ensureAllWalletLegacyLibs()
  const wallet = getRuntimeWallet()
  if (wallet === null) throw new Error("Wallet is not open.")
  const explorer = BlockchainExplorerProvider.getInstance()
  const height = await explorer.getHeight()
  return mapWalletToInfo(wallet, height)
}

export async function refreshWalletOperation(): Promise<WalletInfo> {
  const watchdog = getRuntimeWatchdog()
  if (watchdog !== null) {
    watchdog.checkMempool()
  }
  return getWalletInfoOperation()
}

export async function getNodeStatusOperation(): Promise<NodeStatus> {
  await ensureAllWalletLegacyLibs()
  const explorer = BlockchainExplorerProvider.getInstance()
  if (!explorer.isInitialized()) {
    await explorer.initialize()
  }

  const [info, networkHeight, customNodeUrl] = await Promise.all([
    explorer.getInfo(),
    explorer.getHeight(),
    Storage.getItem("customNodeUrl", null) as Promise<string | null>,
  ])

  const wallet = getRuntimeWallet()
  const walletHeight = wallet !== null ? Math.max(0, Number(wallet.lastHeight)) : 0
  const nodeUrl =
    customNodeUrl ||
    (config.nodeList && config.nodeList.length > 0 ? config.nodeList[0] : "https://explorer.conceal.network/daemon/")

  const now = Math.floor(Date.now() / 1000)
  const lastBlockSecondsAgo = info.start_time > 0 ? Math.max(0, now - info.start_time) : config.avgBlockTime

  return {
    url: nodeUrl,
    height: walletHeight,
    networkHeight,
    peers: (info.white_peerlist_size ?? 0) + (info.grey_peerlist_size ?? 0),
    peersOut: info.outgoing_connections_count ?? 0,
    peersIn: info.incoming_connections_count ?? 0,
    isCustom: Boolean(customNodeUrl),
    version: String(info.status === "OK" ? "Conceal Core" : info.status),
    difficulty: info.difficulty ?? 0,
    hashrate: info.difficulty > 0 ? Math.round(info.difficulty / config.avgBlockTime) : 0,
    mempool: info.transactions_pool_size ?? 0,
    lastBlockSecondsAgo,
    avgBlockTimeSeconds: config.avgBlockTime,
    latencyMs: 0,
    uptimeSeconds: info.start_time > 0 ? Math.max(0, now - info.start_time) : 0,
    heightHistory: [walletHeight],
    hashrateHistory: [info.difficulty > 0 ? info.difficulty / config.avgBlockTime / 1_000_000 : 0],
    peersHistory: [(info.white_peerlist_size ?? 0) + (info.grey_peerlist_size ?? 0)],
    blockTimeHistory: [config.avgBlockTime],
  }
}

export async function exportWalletOperation(): Promise<ExportWalletData> {
  await ensureAllWalletLegacyLibs()
  const wallet = getRuntimeWallet()
  if (wallet === null) throw new Error("Wallet is not open.")
  const mnemonic = getCreatedMnemonic() || Mnemonic.mn_encode(wallet.keys.priv.spend, "english") || ""
  return {
    mnemonic,
    spendKey: wallet.keys.priv.spend,
    viewKey: wallet.keys.priv.view,
  }
}

export async function changePasswordOperation(currentPassword: string, newPassword: string): Promise<void> {
  await ensureAllWalletLegacyLibs()
  const worker = getRuntimeWalletWorker()
  if (worker === null) throw new Error("Wallet is not open.")
  const verified = await WalletRepository.getLocalWalletWithPassword(currentPassword)
  if (verified === null) throw new Error("Current password is incorrect.")
  worker.password = newPassword
  await worker.save()
}

export async function listTransactionsOperation(): Promise<Transaction[]> {
  await ensureAllWalletLegacyLibs()
  const wallet = getRuntimeWallet()
  if (wallet === null) throw new Error("Wallet is not open.")
  const height = await BlockchainExplorerProvider.getInstance().getHeight()
  return listWalletTransactions(wallet, height)
}

export async function sendTransactionOperation(input: SendTransactionInput): Promise<Transaction> {
  await ensureAllWalletLegacyLibs()
  const wallet = getRuntimeWallet()
  if (wallet === null) throw new Error("Wallet is not open.")
  const explorer = BlockchainExplorerProvider.getInstance()
  const blockchainHeight = await explorer.getHeight()
  const amountAtomic = Math.round(input.amount * Math.pow(10, config.coinUnitPlaces))

  if (amountAtomic > wallet.availableAmount(blockchainHeight)) {
    throw new Error("Amount exceeds available balance.")
  }

  const destinations = [{ address: input.address, amount: amountAtomic }]
  const remoteFeeAddress = await explorer.getSessionNodeFeeAddress()
  if (remoteFeeAddress !== wallet.getPublicAddress()) {
    destinations.push({
      address: remoteFeeAddress || config.donationAddress,
      amount: config.remoteNodeFee,
    })
  }

  const rawTxData = await TransactionsExplorer.createTx(
    destinations,
    input.paymentId ?? "",
    wallet,
    blockchainHeight,
    (amounts: number[], numberOuts: number) => explorer.getRandomOuts(amounts, numberOuts),
    async (amount: number, feesAmount: number) => {
      if (amount + feesAmount > wallet.availableAmount(blockchainHeight)) {
        throw new Error("Insufficient funds for amount plus fee.")
      }
    },
    config.defaultMixin,
    input.message ?? "",
    0,
    0,
    0,
  )

  await explorer.sendRawTx(rawTxData.raw.raw)
  wallet.addTxPrivateKeyWithTxHash(rawTxData.raw.hash, rawTxData.raw.prvkey)
  const watchdog = getRuntimeWatchdog()
  if (watchdog !== null) watchdog.checkMempool()

  const txs = listWalletTransactions(wallet, blockchainHeight)
  return (
    txs.find((tx) => tx.hash === rawTxData.raw.hash) ?? {
      id: rawTxData.raw.hash,
      hash: rawTxData.raw.hash,
      type: "send",
      amount: { atomic: amountAtomic },
      address: input.address,
      timestamp: new Date().toISOString(),
      confirmations: 0,
      paymentId: input.paymentId,
      message: input.message,
    }
  )
}

export { disconnectWalletRuntime, hasStoredWallet } from "./wallet-runtime"
