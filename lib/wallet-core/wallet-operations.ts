// @ts-nocheck
import { ensureAllWalletLegacyLibs } from "@/lib/conceal/init";
import { MAX_MESSAGE_SIZE, MESSAGE_TX_AMOUNT_ATOMIC } from "@/lib/config/config";
import type { CreateDepositInput, WithdrawDepositInput } from "@/lib/services/deposit.service";
import type { SendMessageInput } from "@/lib/services/message.service";
import type { SendTransactionInput } from "@/lib/services/transaction.service";
import type { ExportWalletData, ImportWalletInput } from "@/lib/services/wallet.service";
import type { Deposit, Message, NodeStatus, Transaction, WalletInfo } from "@/lib/types";
import { backupDownloadFilename } from "@/lib/ui/download-json-file";
import { Cn, CnUtils } from "./Cn";
import { CoinUri } from "./CoinUri";
import { InterestCalculator } from "./Interest";
import { KeysRepository } from "./KeysRepository";
import { Mnemonic } from "./Mnemonic";
import {
  buildMessageThreadKey,
  clampImportHeight,
  deriveIndicativeDepositApr,
  findAddressBookContact,
  getWalletDepositConstraints,
  listWalletDeposits,
  listWalletMessages,
  listWalletTransactions,
  mapCoreDeposit,
  mapCoreMessage,
  mapWalletToInfo,
  newWalletCreationHeight,
} from "./mappers";
import { BlockchainExplorerProvider } from "./providers/BlockchainExplorerProvider";
import { Storage } from "./Storage";
import { StorageOld } from "./StorageOld";
import { Deposit as CoreDeposit } from "./Transaction";
import { TransactionsExplorer } from "./TransactionsExplorer";
import { Wallet } from "./Wallet";
import { WalletRepository } from "./WalletRepository";
import {
  clearPendingWalletCreation,
  disconnectWalletRuntime,
  flushRuntimeWalletPersistence,
  getCreatedMnemonic,
  getPendingWalletCreation,
  getRuntimeWallet,
  getRuntimeWalletWorker,
  getRuntimeWatchdog,
  openWalletRuntime,
  setCreatedMnemonic,
  setPendingWalletCreation,
} from "./wallet-runtime";

async function prepareLegacyRuntime() {
  await ensureAllWalletLegacyLibs();
  const explorer = BlockchainExplorerProvider.getInstance();
  await explorer.initialize();
  return explorer;
}

export async function unlockStoredWallet(password: string): Promise<WalletInfo> {
  await ensureAllWalletLegacyLibs();
  await WalletRepository.migrateWallet();
  const wallet = await WalletRepository.getLocalWalletWithPassword(password);
  if (wallet === null) {
    throw new Error("Invalid password or wallet data.");
  }
  await prepareLegacyRuntime();
  await openWalletRuntime(wallet, password);
  const height = await BlockchainExplorerProvider.getInstance().getHeight();
  return mapWalletToInfo(wallet, height);
}

export async function generateWalletDraftOperation(): Promise<{
  mnemonic: string;
  address: string;
}> {
  await prepareLegacyRuntime();
  const explorer = BlockchainExplorerProvider.getInstance();
  const currentHeight = await explorer.getHeight();

  const seed = concealjs.random.random_scalar();
  const keys = Cn.create_address(seed);
  const wallet = new Wallet();
  wallet.keys = KeysRepository.fromPriv(keys.spend.sec, keys.view.sec);
  wallet.lastHeight = newWalletCreationHeight(currentHeight);
  wallet.creationHeight = wallet.lastHeight;

  const phrase = Mnemonic.mn_encode(wallet.keys.priv.spend, "english");
  if (phrase === null) {
    throw new Error("Failed to encode mnemonic.");
  }

  setPendingWalletCreation(wallet, phrase);
  return {
    mnemonic: phrase,
    address: wallet.getPublicAddress(),
  };
}

export function abortWalletCreationOperation(): void {
  clearPendingWalletCreation();
}

export async function finalizeWalletCreationOperation(password: string): Promise<WalletInfo> {
  const pending = getPendingWalletCreation();
  if (pending === null) {
    throw new Error("No wallet draft found. Start creation again.");
  }

  await prepareLegacyRuntime();
  setCreatedMnemonic(pending.mnemonic);
  await openWalletRuntime(pending.wallet, password);
  clearPendingWalletCreation();

  const height = await BlockchainExplorerProvider.getInstance().getHeight();
  return mapWalletToInfo(pending.wallet, height);
}

export async function importWalletOperation(input: ImportWalletInput): Promise<WalletInfo> {
  await prepareLegacyRuntime();
  const explorer = BlockchainExplorerProvider.getInstance();
  const currentHeight = await explorer.getHeight();
  let wallet: Wallet | null = null;
  const password = "password" in input ? input.password : "";

  // Key/QR/mnemonic import runs legacy crypto on user-supplied material. Some of
  // those paths throw bare strings (CoinUri codes like "missing_seeds") or errors
  // whose message could embed key material \u2014 funnel everything through
  // toFriendlyImportError so the UI never shows a raw/sensitive string.
  try {
    switch (input.method) {
      case "open":
        return await unlockStoredWallet(input.password);
      case "mnemonic": {
        const language =
          input.language === "auto" || !input.language
            ? (Mnemonic.detectLang(input.mnemonic) ?? "english")
            : input.language;
        const decoded = Mnemonic.mn_decode(input.mnemonic.trim(), language);
        if (decoded === null) throw new Error("Invalid mnemonic phrase.");
        const keys = Cn.create_address(decoded);
        wallet = new Wallet();
        wallet.keys = KeysRepository.fromPriv(keys.spend.sec, keys.view.sec);
        wallet.lastHeight = clampImportHeight(input.scanHeight, currentHeight);
        wallet.creationHeight = wallet.lastHeight;
        break;
      }
      case "keys": {
        wallet = new Wallet();
        if (input.viewOnly) {
          const built = Cn.build_view_only_keys(input.address, input.privateViewKey);
          wallet.keys = built.keys;
        } else {
          let viewKey = input.privateViewKey.trim();
          if (viewKey === "") {
            viewKey = Cn.generate_keys(CnUtils.cn_fast_hash(input.privateSpendKey.trim())).sec;
          }
          wallet.keys = KeysRepository.fromPriv(input.privateSpendKey.trim(), viewKey);
        }
        wallet.lastHeight = clampImportHeight(input.scanHeight, currentHeight);
        wallet.creationHeight = wallet.lastHeight;
        break;
      }
      case "file": {
        const text =
          typeof input.file === "string"
            ? input.file
            : new TextDecoder()
                .decode(input.file)
                .replace(/^\uFEFF/, "")
                .trim();
        let raw: unknown;
        try {
          raw = JSON.parse(text);
        } catch {
          throw new Error("The selected file is not valid JSON.");
        }
        if (!raw || typeof raw !== "object") {
          throw new Error("The selected file is not a valid wallet backup.");
        }
        wallet = WalletRepository.decodeWithPassword(
          raw as Parameters<typeof WalletRepository.decodeWithPassword>[0],
          input.password,
        );
        if (wallet === null) {
          throw new Error("Invalid wallet file or password.");
        }
        if (!wallet.keys?.pub?.spend) {
          throw new Error("Wallet file decrypted but key data is incomplete.");
        }
        await openWalletRuntime(wallet, input.password);
        await flushRuntimeWalletPersistence();
        return mapWalletToInfo(wallet, currentHeight);
      }
      case "qr": {
        const decoded = CoinUri.decodeWallet(input.payload);
        if (decoded.mnemonicSeed) {
          const seed = Mnemonic.mn_decode(decoded.mnemonicSeed, "english");
          if (seed === null) throw new Error("Invalid mnemonic in QR payload.");
          const keys = Cn.create_address(seed);
          wallet = new Wallet();
          wallet.keys = KeysRepository.fromPriv(keys.spend.sec, keys.view.sec);
        } else if (decoded.spendKey) {
          let viewKey = decoded.viewKey ?? "";
          if (viewKey === "") {
            viewKey = Cn.generate_keys(CnUtils.cn_fast_hash(decoded.spendKey)).sec;
          }
          wallet = new Wallet();
          wallet.keys = KeysRepository.fromPriv(decoded.spendKey, viewKey);
        } else if (decoded.viewKey && decoded.address) {
          const built = Cn.build_view_only_keys(decoded.address, decoded.viewKey);
          wallet = new Wallet();
          wallet.keys = built.keys;
        } else {
          throw new Error("Unsupported QR wallet payload.");
        }
        const scanHeight = decoded.height ? parseInt(decoded.height, 10) : undefined;
        wallet.lastHeight = clampImportHeight(scanHeight, currentHeight);
        wallet.creationHeight = wallet.lastHeight;
        break;
      }
      default:
        throw new Error("Unsupported import method.");
    }

    await openWalletRuntime(wallet, password);
    return mapWalletToInfo(wallet, currentHeight);
  } catch (error) {
    throw toFriendlyImportError(error);
  }
}

export async function previewKeysOperation(input: {
  spendKey: string;
  viewKey?: string;
}): Promise<{ address: string; viewKey: string }> {
  await ensureAllWalletLegacyLibs();
  const spend = input.spendKey.trim();
  let view = (input.viewKey ?? "").trim();
  if (view === "") {
    view = Cn.generate_keys(CnUtils.cn_fast_hash(spend)).sec;
  }
  const keys = KeysRepository.fromPriv(spend, view);
  return { address: Cn.pubkeys_to_string(keys.pub.spend, keys.pub.view), viewKey: view };
}

export async function getWalletInfoOperation(): Promise<WalletInfo> {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  const explorer = BlockchainExplorerProvider.getInstance();
  const height = await explorer.getHeight();
  return mapWalletToInfo(wallet, height);
}

export async function refreshWalletOperation(): Promise<WalletInfo> {
  const watchdog = getRuntimeWatchdog();
  if (watchdog !== null) {
    watchdog.checkMempool();
  }
  return getWalletInfoOperation();
}

export async function getNodeStatusOperation(): Promise<NodeStatus> {
  await ensureAllWalletLegacyLibs();
  const explorer = BlockchainExplorerProvider.getInstance();
  if (!explorer.isInitialized()) {
    await explorer.initialize();
  }

  const [info, networkHeight, customNodeUrl] = await Promise.all([
    explorer.getInfo(),
    explorer.getHeight(),
    Storage.getItem("customNodeUrl", null) as Promise<string | null>,
  ]);

  const wallet = getRuntimeWallet();
  const walletHeight = wallet !== null ? Math.max(0, Number(wallet.lastHeight)) : 0;
  const activeNodeUrl = explorer.getActiveNodeUrl?.() ?? null;
  const nodeUrl =
    customNodeUrl ||
    activeNodeUrl ||
    (config.nodeList && config.nodeList.length > 0
      ? config.nodeList[0]
      : "https://explorer.conceal.network/daemon/");

  const now = Math.floor(Date.now() / 1000);
  const lastBlockSecondsAgo =
    info.start_time > 0 ? Math.max(0, now - info.start_time) : config.avgBlockTime;

  const version =
    typeof info.version === "string" && info.version.trim().length > 0
      ? info.version.trim()
      : info.status === "OK"
        ? ""
        : String(info.status);

  return {
    url: nodeUrl,
    height: walletHeight,
    networkHeight,
    peers: (info.white_peerlist_size ?? 0) + (info.grey_peerlist_size ?? 0),
    peersOut: info.outgoing_connections_count ?? 0,
    peersIn: info.incoming_connections_count ?? 0,
    isCustom: Boolean(customNodeUrl),
    version,
    difficulty: info.difficulty ?? 0,
    hashrate: info.difficulty > 0 ? Math.round(info.difficulty / config.avgBlockTime) : 0,
    mempool: info.transactions_pool_size ?? 0,
    lastBlockSecondsAgo,
    avgBlockTimeSeconds: config.avgBlockTime,
    heightHistory: [networkHeight],
    hashrateHistory: [info.difficulty > 0 ? Math.round(info.difficulty / config.avgBlockTime) : 0],
    peersHistory: [(info.white_peerlist_size ?? 0) + (info.grey_peerlist_size ?? 0)],
    blockTimeHistory: [lastBlockSecondsAgo],
  };
}

export async function exportWalletOperation(): Promise<ExportWalletData> {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  const mnemonic =
    getCreatedMnemonic() || Mnemonic.mn_encode(wallet.keys.priv.spend, "english") || "";
  return {
    address: wallet.getPublicAddress(),
    mnemonic,
    spendKey: wallet.keys.priv.spend,
    viewKey: wallet.keys.priv.view,
    creationHeight: wallet.creationHeight,
  };
}

export async function exportWalletPdfOperation(): Promise<{ filename: string }> {
  const data = await exportWalletOperation();
  const { downloadWalletExportPdf } = await import("@/lib/ui/wallet-export-pdf");
  const filename = await downloadWalletExportPdf(data);
  return { filename };
}

export async function downloadWalletBackupOperation(input: {
  filename: string;
  password: string;
}): Promise<{ filename: string; payload: unknown }> {
  await ensureAllWalletLegacyLibs();

  const verified = await WalletRepository.getLocalWalletWithPassword(input.password);
  if (verified === null) {
    throw new Error("Invalid password.");
  }

  const wallet = getRuntimeWallet();
  if (wallet === null) {
    throw new Error("Wallet is not open.");
  }

  // Persist latest in-memory state (contacts, sent message copies) using the verified password.
  await WalletRepository.save(wallet, input.password);

  const persisted = await WalletRepository.getLocalWalletWithPassword(input.password);
  if (persisted === null) {
    throw new Error("Invalid password.");
  }

  return {
    filename: backupDownloadFilename(input.filename),
    payload: WalletRepository.getEncrypted(persisted, input.password),
  };
}

export async function changePasswordOperation(
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await ensureAllWalletLegacyLibs();
  const worker = getRuntimeWalletWorker();
  if (worker === null) throw new Error("Wallet is not open.");
  const verified = await WalletRepository.getLocalWalletWithPassword(currentPassword);
  if (verified === null) throw new Error("Current password is incorrect.");
  worker.password = newPassword;
  await worker.save();
}

export async function listTransactionsOperation(): Promise<Transaction[]> {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  const height = await BlockchainExplorerProvider.getInstance().getHeight();
  return listWalletTransactions(wallet, height);
}

export async function sendTransactionOperation(input: SendTransactionInput): Promise<Transaction> {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  const explorer = BlockchainExplorerProvider.getInstance();
  const blockchainHeight = await explorer.getHeight();
  const amountAtomic = Math.round(input.amount * Math.pow(10, config.coinUnitPlaces));

  if (amountAtomic > wallet.availableAmount(blockchainHeight)) {
    throw new Error("Amount exceeds available balance.");
  }

  const destinations = [{ address: input.address, amount: amountAtomic }];
  const remoteFeeAddress = await explorer.getSessionNodeFeeAddress();
  if (remoteFeeAddress !== wallet.getPublicAddress()) {
    destinations.push({
      address: remoteFeeAddress || config.donationAddress,
      amount: config.remoteNodeFee,
    });
  }

  const rawTxData = await TransactionsExplorer.createTx(
    destinations,
    input.paymentId ?? "",
    wallet,
    blockchainHeight,
    (amounts: number[], numberOuts: number) => explorer.getRandomOuts(amounts, numberOuts),
    async (amount: number, feesAmount: number) => {
      if (amount + feesAmount > wallet.availableAmount(blockchainHeight)) {
        throw new Error("Insufficient funds for amount plus fee.");
      }
    },
    config.defaultMixin,
    input.message ?? "",
    0,
    "regular",
    0,
  );

  await explorer.sendRawTx(rawTxData.raw.raw);
  wallet.addTxPrivateKeyWithTxHash(rawTxData.raw.hash, rawTxData.raw.prvkey);
  const watchdog = getRuntimeWatchdog();
  if (watchdog !== null) watchdog.checkMempool();

  const txs = listWalletTransactions(wallet, blockchainHeight);
  return (
    txs.find((tx) => tx.hash === rawTxData.raw.hash) ?? {
      id: rawTxData.raw.hash,
      hash: rawTxData.raw.hash,
      type: "send",
      amount: { atomic: amountAtomic },
      address: input.address,
      timestamp: new Date().toISOString(),
      blockHeight: 0,
      confirmations: 0,
      paymentId: input.paymentId,
      message: input.message,
    }
  );
}

export async function listMessagesOperation(): Promise<Message[]> {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  return listWalletMessages(wallet);
}

export async function sendMessageOperation(input: SendMessageInput): Promise<Message> {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");

  const body = input.body.trim();
  if (!body) throw new Error("Message is required.");
  if (body.length > MAX_MESSAGE_SIZE) {
    throw new Error(`Message exceeds maximum length of ${MAX_MESSAGE_SIZE} characters.`);
  }

  const destinationAddress = input.recipientAddress.trim();
  if (!destinationAddress) throw new Error("Recipient address is required.");
  try {
    Cn.decode_address(destinationAddress);
  } catch {
    throw new Error("Invalid recipient address.");
  }

  const ttlMinutes = input.ttlMinutes ? input.ttlMinutes : 0;
  const ttlForTx = input.ttlUnix ?? 0;
  const explorer = BlockchainExplorerProvider.getInstance();
  const blockchainHeight = await explorer.getHeight();
  const amountToSend = MESSAGE_TX_AMOUNT_ATOMIC;

  const destinations = [{ address: destinationAddress, amount: amountToSend }];
  const remoteFeeAddress = await explorer.getSessionNodeFeeAddress();
  if (remoteFeeAddress !== wallet.getPublicAddress() && ttlMinutes === 0) {
    destinations.push({
      address: remoteFeeAddress || config.donationAddress,
      amount: config.remoteNodeFee,
    });
  }

  const paymentId = input.paymentId?.trim() ?? "";

  let rawTxData: { raw: { hash: string; prvkey: string; raw: string }; signed: unknown };
  try {
    rawTxData = await TransactionsExplorer.createTx(
      destinations,
      paymentId,
      wallet,
      blockchainHeight,
      (amounts: number[], numberOuts: number) => explorer.getRandomOuts(amounts, numberOuts),
      async (amount, feesAmount) => {
        const total = amount.add(feesAmount);
        const available = new JSBigInt(String(wallet.availableAmount(blockchainHeight)));
        if (total.compare(available) > 0) {
          throw new Error("Insufficient funds for message transfer and fee.");
        }
      },
      config.defaultMixin,
      body,
      ttlForTx,
    );
  } catch (error) {
    throw normalizeWalletOperationError(error, "Failed to create message transaction.");
  }

  try {
    await explorer.sendRawTx(rawTxData.raw.raw);
  } catch (error) {
    throw normalizeWalletOperationError(error, "Failed to broadcast message transaction.");
  }
  wallet.addTxPrivateKeyWithTxHash(rawTxData.raw.hash, rawTxData.raw.prvkey);
  wallet.setPendingMessageTarget(
    rawTxData.raw.hash,
    destinationAddress,
    paymentId || undefined,
    body,
  );
  await flushRuntimeWalletPersistence();
  const watchdog = getRuntimeWatchdog();
  if (watchdog !== null) watchdog.checkMempool();

  const addressBook = wallet.listAddressBook();
  const contact = findAddressBookContact(addressBook, {
    paymentId: paymentId || undefined,
    address: destinationAddress,
  });
  const counterpartyName =
    contact?.label ??
    (destinationAddress.length > 16
      ? `${destinationAddress.slice(0, 8)}…${destinationAddress.slice(-6)}`
      : destinationAddress);

  return {
    id: rawTxData.raw.hash,
    direction: "sent",
    counterpartyName,
    counterpartyAddress: destinationAddress,
    body,
    hasBody: true,
    sentTo: destinationAddress,
    timestamp: new Date().toISOString(),
    unread: false,
    paymentIdFrom: null,
    paymentIdTo: paymentId || null,
    blockHeight: 0,
    threadKey: buildMessageThreadKey(destinationAddress, paymentId || undefined),
  };
}

export async function markMessageReadOperation(id: string): Promise<Message> {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");

  wallet.updateTransactionFlags(id, { messageViewed: true });

  const all = wallet.txsMem.concat(wallet.getTransactionsCopy());
  const tx = all.find((candidate) => candidate.hash === id);
  if (!tx) throw new Error("Message transaction not found.");

  wallet.hydrateSentMessageBody(tx);
  const mapped = mapCoreMessage(
    tx,
    wallet.getPublicAddress(),
    wallet.listAddressBook(),
    wallet.getSentMessageRecord(id),
  );
  if (!mapped) throw new Error("Transaction is not a message.");

  return { ...mapped, unread: false };
}

export async function listDepositsOperation(): Promise<Deposit[]> {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  const height = await BlockchainExplorerProvider.getInstance().getHeight();
  return listWalletDeposits(wallet, height);
}

export async function getDepositConstraintsOperation() {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  const explorer = BlockchainExplorerProvider.getInstance();
  const height = await explorer.getHeight();
  return getWalletDepositConstraints(wallet, height);
}

export async function previewCreateDepositOperation(input: {
  amount: number;
  durationMonths: number;
}): Promise<{ interestCcx: number; indicativeApr: number }> {
  await ensureAllWalletLegacyLibs();
  const explorer = BlockchainExplorerProvider.getInstance();
  const lockHeight = await explorer.getHeight();
  const amountCoins = Math.floor(input.amount);
  const months = Math.floor(input.durationMonths);
  const termBlocks = months * config.depositMinTermBlock;
  const currencyDivider = Math.pow(10, config.coinUnitPlaces);
  const amountAtomic = amountCoins * currencyDivider;
  const interestAtomic = InterestCalculator.calculateInterest(amountAtomic, termBlocks, lockHeight);

  return {
    interestCcx: interestAtomic / currencyDivider,
    indicativeApr: deriveIndicativeDepositApr(amountAtomic, interestAtomic, termBlocks),
  };
}

export async function createDepositOperation(input: CreateDepositInput): Promise<Deposit> {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  const explorer = BlockchainExplorerProvider.getInstance();
  const blockchainHeight = await explorer.getHeight();
  const currencyDivider = Math.pow(10, config.coinUnitPlaces);
  const amountCoins = Math.floor(input.amount);

  if (!Number.isFinite(amountCoins) || amountCoins < config.depositMinAmountCoin) {
    throw new Error(`Deposit amount must be at least ${config.depositMinAmountCoin} CCX.`);
  }

  const months = Math.floor(input.durationMonths);
  if (months < config.depositMinTermMonth || months > config.depositMaxTermMonth) {
    throw new Error(
      `Deposit term must be between ${config.depositMinTermMonth} and ${config.depositMaxTermMonth} months.`,
    );
  }

  const termBlocks =
    months > config.depositMaxTermMonth
      ? config.depositMaxTermMonth * config.depositMinTermBlock
      : months * config.depositMinTermBlock;
  const amountAtomic = amountCoins * currencyDivider;
  const coinFee = Number(config.coinFee);
  const neededAmount = amountAtomic + coinFee;

  if (neededAmount > wallet.availableAmount(blockchainHeight)) {
    throw new Error("Not enough unlocked balance for deposit and network fee.");
  }

  const destinationAddress = wallet.getPublicAddress();
  const rawTxData = await TransactionsExplorer.createTx(
    [{ address: destinationAddress, amount: amountAtomic }],
    "",
    wallet,
    blockchainHeight,
    (amounts: number[], numberOuts: number) => explorer.getRandomOuts(amounts, numberOuts),
    async (amount: number, feesAmount: number) => {
      if (amount + feesAmount > wallet.availableAmount(blockchainHeight)) {
        throw new Error("Insufficient funds for deposit plus fee.");
      }
      if (amount < config.depositMinAmountCoin * currencyDivider) {
        throw new Error(`Deposit amount must be at least ${config.depositMinAmountCoin} CCX.`);
      }
    },
    config.defaultMixin,
    "",
    0,
    "deposit",
    termBlocks,
  );

  await explorer.sendRawTx(rawTxData.raw.raw);
  wallet.addTxPrivateKeyWithTxHash(rawTxData.raw.hash, rawTxData.raw.prvkey);
  const watchdog = getRuntimeWatchdog();
  if (watchdog !== null) watchdog.checkMempool();

  const deposits = listWalletDeposits(wallet, blockchainHeight);
  const matched = deposits.find((deposit) => deposit.txHash === rawTxData.raw.hash);
  if (matched) return matched;

  const pending = new CoreDeposit();
  pending.txHash = rawTxData.raw.hash;
  pending.globalOutputIndex = 0;
  pending.amount = amountAtomic;
  pending.interest = 0;
  pending.term = termBlocks;
  pending.blockHeight = 0;
  pending.unlockHeight = blockchainHeight + termBlocks;
  pending.timestamp = Math.floor(Date.now() / 1000);
  return mapCoreDeposit(pending, blockchainHeight, destinationAddress);
}

export async function withdrawDepositOperation(input: WithdrawDepositInput): Promise<Transaction> {
  await ensureAllWalletLegacyLibs();
  const wallet = getRuntimeWallet();
  if (wallet === null) throw new Error("Wallet is not open.");
  const explorer = BlockchainExplorerProvider.getInstance();
  const blockchainHeight = await explorer.getHeight();

  const coreDeposit = wallet
    .getDepositsCopy()
    .find(
      (deposit) =>
        deposit.txHash === input.txHash && deposit.globalOutputIndex === input.globalOutputIndex,
    );

  if (!coreDeposit) {
    throw new Error("Deposit not found.");
  }
  if (coreDeposit.isSpent()) {
    throw new Error("Deposit has already been withdrawn.");
  }
  if (coreDeposit.withdrawPending) {
    throw new Error("Withdrawal already in progress for this deposit.");
  }
  if (coreDeposit.unlockHeight > blockchainHeight) {
    throw new Error("Deposit is still locked.");
  }

  let rawTxData: { raw: { hash: string; prvkey: string; raw: string } };
  try {
    rawTxData = await TransactionsExplorer.createWithdrawTx(
      coreDeposit,
      wallet,
      blockchainHeight,
      () => Promise.resolve([]),
      async (_amount: number, feesAmount: number) => {
        if (feesAmount > wallet.availableAmount(blockchainHeight)) {
          throw new Error("Insufficient unlocked balance for withdrawal fee.");
        }
        wallet.updateDepositFlags(coreDeposit.txHash, { withdrawPending: true });
      },
      config.defaultMixin,
      "",
      "",
      0,
      "withdraw",
      coreDeposit.term,
    );
  } catch (error) {
    wallet.updateDepositFlags(coreDeposit.txHash, { withdrawPending: false });
    throw error;
  }

  try {
    await explorer.sendRawTx(rawTxData.raw.raw);
  } catch (error) {
    wallet.updateDepositFlags(coreDeposit.txHash, { withdrawPending: false });
    throw error;
  }

  wallet.addTxPrivateKeyWithTxHash(rawTxData.raw.hash, rawTxData.raw.prvkey);
  const watchdog = getRuntimeWatchdog();
  if (watchdog !== null) watchdog.checkMempool();

  const txs = listWalletTransactions(wallet, blockchainHeight);
  return (
    txs.find((tx) => tx.hash === rawTxData.raw.hash) ?? {
      id: rawTxData.raw.hash,
      hash: rawTxData.raw.hash,
      type: "withdrawal",
      amount: { atomic: coreDeposit.amount + coreDeposit.interest },
      address: wallet.getPublicAddress(),
      timestamp: new Date().toISOString(),
      blockHeight: 0,
      confirmations: 0,
    }
  );
}

function normalizeWalletOperationError(error: unknown, fallback: string): Error {
  if (error instanceof Error && error.message) return error;
  if (typeof error === "string" && error) return new Error(error);
  const original = (error as { originalResponse?: { reason?: string; status?: string } })
    ?.originalResponse;
  if (original?.reason || original?.status) {
    return new Error(`${fallback} ${original.reason ?? original.status}`);
  }
  if (error && typeof error === "object" && "error" in error) {
    return new Error(`${fallback} ${String((error as { error: unknown }).error)}`);
  }
  return new Error(fallback);
}

/** Long hex runs in an error message likely carry key/seed material — never surface them. */
const SENSITIVE_ERROR_PATTERN = /[0-9a-fA-F]{32,}/;

/**
 * Map any import failure to a user-safe Error. Our own curated validation
 * messages (no key material) pass through; bare-string library throws and any
 * crypto error whose message could embed a key are replaced with a generic one.
 */
function toFriendlyImportError(error: unknown): Error {
  if (error instanceof Error && error.message && !SENSITIVE_ERROR_PATTERN.test(error.message)) {
    return error;
  }
  return new Error("Couldn't import this wallet — double-check the details and try again.");
}

export async function deleteStoredWalletOperation(): Promise<void> {
  await ensureAllWalletLegacyLibs();
  await disconnectWalletRuntime();
  await WalletRepository.deleteLocalCopy();
  try {
    await StorageOld.remove("wallet");
  } catch {
    // best-effort legacy localStorage cleanup
  }
}

/**
 * Panic wipe: delete the wallet (disconnects the runtime / terminates workers)
 * then clear ALL persisted wallet-engine state — settings, custom node URL,
 * creation height, etc. — so nothing recoverable is left in this browser.
 */
export async function panicWipeOperation(): Promise<void> {
  await ensureAllWalletLegacyLibs();
  const failures: unknown[] = [];

  // Stop the savers FIRST without flushing — otherwise the watchdog's debounced
  // save (or the disconnect's own flush) could re-persist the wallet moments after
  // we clear storage. Best-effort: a failure here must not abort the erase.
  try {
    await disconnectWalletRuntime({ flush: false });
  } catch (error) {
    failures.push(error);
  }

  // Then erase every persisted store, each independently so one failure can't
  // leave the rest behind.
  for (const step of [
    () => WalletRepository.deleteLocalCopy(),
    () => StorageOld.remove("wallet"),
    () => Storage.clear(),
    () => StorageOld.clear(),
  ]) {
    try {
      await step();
    } catch (error) {
      failures.push(error);
    }
  }

  if (failures.length > 0) {
    throw new Error("Panic wipe did not complete — some local data may remain.");
  }
}

export { disconnectWalletRuntime, hasStoredWallet } from "./wallet-runtime";
