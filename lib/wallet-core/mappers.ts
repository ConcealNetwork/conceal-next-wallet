import { createWalletNetworkConfig, type WalletNetworkConfig } from "@/lib/config/config";
import {
  MESSAGE_TX_AMOUNT_ATOMIC,
  SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC,
  SENT_MESSAGE_AMOUNT_SELF_ATOMIC,
} from "@/lib/config/config";
import type {
  AddressEntry,
  Deposit as UiDeposit,
  Message as UiMessage,
  Transaction as UiTransaction,
  TransactionType,
  WalletInfo,
} from "@/lib/types";
import { isWalletHeightSyncing } from "@/lib/ui/wallet-sync";
import { addressIsValid, normalizePaymentId } from "@/lib/validation/ccx";
import type { Deposit as CoreDeposit, Transaction as CoreTransaction } from "./Transaction";
import type { RawAddressEntry, Wallet } from "./Wallet";
import {
  listWalletMessagesFromUI,
  mapTransactionToMessageUI,
  messageUIToApiMessage,
} from "./MessageUI";
import { buildMessageThreadKey } from "@/lib/messages/thread-key";
import type { RawSentMessageRecord } from "./sent-messages";

export { buildMessageThreadKey };

export function clampImportHeight(scanHeight: number | undefined, currentHeight: number): number {
  let height = scanHeight ?? 0;
  if (Number.isNaN(height) || height < 0) height = 0;
  if (height >= currentHeight) height = currentHeight - 1;
  height -= 10;
  if (height < 0) height = 0;
  if (height > currentHeight) height = currentHeight;
  return height;
}

/** Scan start for a brand-new wallet: near chain tip, not from genesis. */
export function newWalletCreationHeight(currentHeight: number): number {
  let height = currentHeight - 10;
  if (height < 0) height = 0;
  return height;
}

type GlobalWithRuntimeWallet = typeof globalThis & { __ccxRuntimeWallet?: Wallet };

function resolveWalletForMapping(wallet: Wallet): Wallet {
  if (typeof wallet.availableAmount === "function") {
    return wallet;
  }
  const runtime = (globalThis as GlobalWithRuntimeWallet).__ccxRuntimeWallet;
  if (runtime != null && typeof runtime.availableAmount === "function") {
    return runtime;
  }
  throw new Error("Wallet runtime is not initialized.");
}

export function mapWalletToInfo(wallet: Wallet, networkHeight: number): WalletInfo {
  const w = resolveWalletForMapping(wallet);
  const walletHeight = Math.max(0, Number(w.lastHeight));
  const available = w.availableAmount(networkHeight);
  const locked = w.lockedDeposits(networkHeight);
  const withdrawable = w.unlockedDeposits(networkHeight);
  const pending = Math.max(0, w.availableAmount(-1) - available);

  return {
    address: w.getPublicAddress(),
    balanceTotal: { atomic: available + locked },
    available: { atomic: available },
    pending: { atomic: pending },
    lockedDeposits: { atomic: locked },
    withdrawable: { atomic: withdrawable },
    creationHeight: w.creationHeight,
    currentHeight: walletHeight,
    networkHeight,
  };
}

function getTxAmount(tx: CoreTransaction): number {
  return Math.abs(tx.getAmount());
}

/** Sent message envelope: self node (10100) or remote node (+ fee → 11100) atomic. */
export function isSentMessageAmount(amount: number): boolean {
  return amount === SENT_MESSAGE_AMOUNT_SELF_ATOMIC || amount === SENT_MESSAGE_AMOUNT_REMOTE_ATOMIC;
}

function txHasMessage(tx: CoreTransaction, sentRecord?: RawSentMessageRecord): boolean {
  return !!(tx.message?.trim() || sentRecord?.messageBody?.trim());
}

/** Incoming message: has message + 100 atomic to recipient. */
export function isMessageIn(tx: CoreTransaction): boolean {
  if (!tx.message) return false;
  return getTxAmount(tx) === MESSAGE_TX_AMOUNT_ATOMIC;
}

/** Outgoing message: has message + envelope amount (10100 / 11100 atomic). */
export function isMessageOut(tx: CoreTransaction, sentRecord?: RawSentMessageRecord): boolean {
  if (!txHasMessage(tx, sentRecord)) return false;
  return isSentMessageAmount(getTxAmount(tx));
}

/** Miner reward — TransactionsExplorer.isMinerTx (chain coinbase: no vin). Not same as isCoinbase(). */
export function isMinerRewardTx(tx: CoreTransaction): boolean {
  return tx.minerReward === true;
}

export function isWalletMessageTx(tx: CoreTransaction, sentRecord?: RawSentMessageRecord): boolean {
  return isMessageIn(tx) || isMessageOut(tx, sentRecord);
}

export function isUiMessageIn(transaction: Pick<UiTransaction, "message" | "amount">): boolean {
  if (!transaction.message) return false;
  return Math.abs(transaction.amount.atomic) === MESSAGE_TX_AMOUNT_ATOMIC;
}

export function isUiMessageOut(transaction: Pick<UiTransaction, "message" | "amount">): boolean {
  if (!transaction.message) return false;
  return isSentMessageAmount(Math.abs(transaction.amount.atomic));
}

/** Effective type for UI (icon, tabs, labels). */
export function resolveUiTransactionType(transaction: UiTransaction): TransactionType {
  if (isUiMessageOut(transaction) || isUiMessageIn(transaction)) return "message";
  return transaction.type;
}

/** Classify a synced core transaction for the UI (matches Transaction.ts getters). */
export function resolveTransactionType(
  tx: CoreTransaction,
  sentRecord?: RawSentMessageRecord,
): TransactionType {
  if (tx.isDeposit) return "deposit";
  if (tx.isWithdrawal) return "withdrawal";
  if (tx.isFusion) return "fusion";
  if (isWalletMessageTx(tx, sentRecord)) return "message";
  if (isMinerRewardTx(tx)) return "miner";
  return tx.getAmount() < 0 ? "send" : "receive";
}

/** Atomic amount shown in lists; fusion may net to zero — fall back to fee. */
export function resolveTransactionDisplayAmount(
  tx: CoreTransaction,
  type: TransactionType,
): number {
  const net = tx.getAmount();
  const absolute = Math.abs(net);
  if (type === "fusion" && absolute === 0) {
    return Math.abs(tx.fees ?? 0);
  }
  if (type === "message" && isMessageOut(tx)) {
    return getTxAmount(tx);
  }
  return absolute;
}

function resolveStoredMessageBody(
  tx: CoreTransaction,
  sentRecord?: RawSentMessageRecord,
): string | undefined {
  const body = tx.message?.trim() || sentRecord?.messageBody?.trim();
  return body || undefined;
}

export function mapCoreTransaction(
  tx: CoreTransaction,
  blockchainHeight: number,
  walletAddress: string,
  sentRecord?: RawSentMessageRecord,
): UiTransaction {
  const messageOut = isMessageOut(tx, sentRecord);
  const messageIn = isMessageIn(tx);
  const type = messageOut || messageIn ? "message" : resolveTransactionType(tx, sentRecord);
  const displayAtomic = resolveTransactionDisplayAmount(tx, type);
  const confirmations = tx.blockHeight === 0 ? 0 : Math.max(0, blockchainHeight - tx.blockHeight);

  const address = type === "send" ? "" : walletAddress;

  return {
    id: tx.hash || `${tx.timestamp}-${displayAtomic}-${type}`,
    hash: tx.hash,
    type,
    amount: { atomic: displayAtomic },
    address: messageOut && tx.remoteAddress ? tx.remoteAddress : address,
    timestamp: tx.timestamp
      ? new Date(tx.timestamp * 1000).toISOString()
      : new Date().toISOString(),
    blockHeight: tx.blockHeight,
    confirmations,
    paymentId: tx.paymentId || undefined,
    message: resolveStoredMessageBody(tx, sentRecord),
    ...(messageOut ? { outgoing: true } : {}),
  };
}

export function listWalletTransactions(wallet: Wallet, blockchainHeight: number): UiTransaction[] {
  const address = wallet.getPublicAddress();
  return wallet.txsMem.concat(wallet.getTransactionsCopy().reverse()).map((tx) => {
    wallet.hydrateSentMessageBody(tx);
    const sentRecord = wallet.getSentMessageRecord(tx.hash);
    return mapCoreTransaction(tx, blockchainHeight, address, sentRecord);
  });
}

/** Pending TTL txs store expiry as absolute unix seconds (v1 account/messages pages). */
export function isMessageTransactionExpired(tx: CoreTransaction): boolean {
  if (!tx.ttl || tx.ttl <= 0 || tx.blockHeight !== 0) return false;
  return Math.floor(Date.now() / 1000) >= tx.ttl;
}

export function resolveThreadKeyFromMeta(
  addressBook: RawAddressEntry[],
  counterpartyAddress: string,
  paymentId?: string,
): string {
  if (paymentId) {
    const contact = findAddressBookContact(addressBook, {
      paymentId,
      address: addressIsValid(counterpartyAddress) ? counterpartyAddress : undefined,
    });
    if (contact) {
      return buildMessageThreadKey(contact.address, paymentId);
    }
  }
  if (addressIsValid(counterpartyAddress)) {
    return buildMessageThreadKey(counterpartyAddress, paymentId);
  }
  return buildMessageThreadKey(counterpartyAddress, paymentId);
}

export function findAddressBookContact(
  addressBook: RawAddressEntry[],
  options: { paymentId?: string; address?: string },
): RawAddressEntry | undefined {
  const normalizedPid = normalizePaymentId(options.paymentId);
  if (normalizedPid) {
    const byPid = addressBook.find(
      (entry) => normalizePaymentId(entry.paymentId) === normalizedPid,
    );
    if (byPid) return byPid;
  }
  if (options.address) {
    return addressBook.find((entry) => entry.address === options.address);
  }
  return undefined;
}

export function resolveMessageCounterparty(
  tx: CoreTransaction,
  sent: boolean,
  addressBook: RawAddressEntry[],
): { address: string; name: string } {
  const paymentId = tx.paymentId || undefined;
  const contact = findAddressBookContact(addressBook, {
    paymentId,
    address: sent ? tx.remoteAddress || undefined : undefined,
  });

  if (sent) {
    const address = tx.remoteAddress || contact?.address || `sent:${tx.hash}`;
    const name =
      contact?.label ??
      (tx.remoteAddress ? truncateDisplayAddress(tx.remoteAddress) : `To ${tx.hash.slice(0, 8)}…`);
    return { address, name };
  }

  const address = contact?.address ?? (paymentId ? `recv:${paymentId}` : `recv:${tx.hash}`);
  const name =
    contact?.label ??
    (paymentId ? `PID ${paymentId.slice(0, 8)}…` : `From ${tx.hash.slice(0, 8)}…`);
  return { address, name };
}

function truncateDisplayAddress(address: string): string {
  return address.length > 16 ? `${address.slice(0, 8)}…${address.slice(-6)}` : address;
}

export function mapCoreMessage(
  tx: CoreTransaction,
  _walletAddress: string,
  addressBook: RawAddressEntry[] = [],
  sentRecord?: RawSentMessageRecord,
): UiMessage | null {
  const row = mapTransactionToMessageUI(tx, sentRecord);
  if (!row) return null;
  return messageUIToApiMessage(row, addressBook);
}

export function listWalletMessages(wallet: Wallet): UiMessage[] {
  return listWalletMessagesFromUI(wallet);
}

/** Confirmed blocks sort ascending; mempool (0) sorts last as the newest thread row. */
function messageChronologyHeight(blockHeight: number): number {
  return blockHeight > 0 ? blockHeight : Number.MAX_SAFE_INTEGER;
}

export function compareMessagesChronological(
  a: Pick<UiMessage, "blockHeight" | "timestamp" | "direction" | "id">,
  b: Pick<UiMessage, "blockHeight" | "timestamp" | "direction" | "id">,
): number {
  const heightA = messageChronologyHeight(a.blockHeight);
  const heightB = messageChronologyHeight(b.blockHeight);
  if (heightA !== heightB) return heightA - heightB;

  const timeA = new Date(a.timestamp).getTime();
  const timeB = new Date(b.timestamp).getTime();
  if (timeA !== timeB) return timeA - timeB;

  // Same block & second: show incoming before outgoing (reply follows original).
  if (a.direction !== b.direction) {
    return a.direction === "received" ? -1 : 1;
  }

  return a.id.localeCompare(b.id);
}

export function sortMessagesByHeight(messages: UiMessage[]): UiMessage[] {
  return [...messages].sort(compareMessagesChronological);
}

/** Indicative APR from principal, accrued interest, and term (for UI labels). */
export function deriveIndicativeDepositApr(
  amountAtomic: number,
  interestAtomic: number,
  termBlocks: number,
  network: WalletNetworkConfig = createWalletNetworkConfig(),
): number {
  const months = termBlocks / network.depositMinTermBlock;
  if (months <= 0 || amountAtomic <= 0) return 0;
  const divider = Math.pow(10, network.coinUnitPlaces);
  const principal = amountAtomic / divider;
  const interest = interestAtomic / divider;
  return (interest / principal / (months / 12)) * 100;
}

export function mapCoreDeposit(
  deposit: CoreDeposit,
  blockchainHeight: number,
  walletAddress: string,
  network: WalletNetworkConfig = createWalletNetworkConfig(),
): UiDeposit {
  const coreStatus = deposit.getStatus(blockchainHeight);
  const status =
    coreStatus === "Locked" ? "active" : coreStatus === "Unlocked" ? "unlocked" : "spent";
  const blocksRemaining = Math.max(0, deposit.unlockHeight - blockchainHeight);
  const unlocksInDays = Math.ceil((blocksRemaining * network.avgBlockTime) / 86400);
  const elapsedBlocks = Math.max(0, blockchainHeight - deposit.blockHeight);
  const progressPct =
    deposit.term > 0 ? Math.min(100, Math.round((elapsedBlocks / deposit.term) * 100)) : 100;
  const durationMonths = Math.max(1, Math.round(deposit.term / network.depositMinTermBlock));

  return {
    id: `${deposit.txHash}:${deposit.globalOutputIndex}`,
    txHash: deposit.txHash,
    globalOutputIndex: deposit.globalOutputIndex,
    amount: { atomic: deposit.amount },
    interest: { atomic: deposit.interest },
    status,
    durationMonths,
    apr: deriveIndicativeDepositApr(deposit.amount, deposit.interest, deposit.term, network),
    unlocksInDays: status === "spent" ? 0 : unlocksInDays,
    progressPct: status === "spent" ? 100 : progressPct,
    address: walletAddress,
    withdrawPending: deposit.withdrawPending || undefined,
  };
}

export function listWalletDeposits(wallet: Wallet, blockchainHeight: number): UiDeposit[] {
  const address = wallet.getPublicAddress();
  return wallet
    .getDepositsCopy()
    .reverse()
    .map((deposit) => mapCoreDeposit(deposit, blockchainHeight, address));
}

export function getWalletDepositConstraints(
  wallet: Wallet,
  networkHeight: number,
  network: WalletNetworkConfig = createWalletNetworkConfig(),
) {
  const walletHeight = Math.max(0, Number(wallet.lastHeight));
  const currencyDivider = Math.pow(10, network.coinUnitPlaces);
  const coinFee = Number(network.coinFee);
  const unlocked = wallet.availableAmount(networkHeight);
  const maxDepositAmount = Math.floor((unlocked - coinFee) / currencyDivider);
  const isWalletSyncing = isWalletHeightSyncing(walletHeight, networkHeight);

  return {
    maxDepositAmount,
    isDepositDisabled: isWalletSyncing || maxDepositAmount < network.depositMinAmountCoin,
    isWalletSyncing,
    hasPendingDeposit: wallet.hasPendingDeposit,
  };
}
